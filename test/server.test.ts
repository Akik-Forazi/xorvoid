/**
 * XorVoid error server tests — fingerprinting, grouping, stats, live tail.
 * Runs directly against src/ via node --test with type stripping.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { ErrorServer } from "../src/server/index.ts";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xorvoid-test-"));
  return path.join(dir, "nested", "errors.db");
}

test("capture stores an error and get() returns it", () => {
  const server = new ErrorServer(tempDbPath());
  const id = server.capture({
    error: new TypeError("Cannot read properties of undefined"),
    project: "demo",
    release: "1.0.0",
    environment: "test",
    url: "/api/users",
    method: "GET",
    statusCode: 500,
  });

  const record = server.get(id);
  assert.ok(record);
  assert.equal(record.id, id);
  assert.equal(record.error_name, "TypeError");
  assert.equal(record.error_type, "TypeError");
  assert.equal(record.project, "demo");
  assert.equal(record.release, "1.0.0");
  assert.equal(record.status_code, 500);
  assert.equal(record.level, "error");
  assert.equal(record.resolved, 0);
  assert.equal(record.occurrence_count, 1);
  server.close();
});

test("duplicate errors are grouped: same id, occurrence_count increments", () => {
  const server = new ErrorServer(tempDbPath());
  const a = server.capture({ error: new Error("boom") });
  const b = server.capture({ error: new Error("boom") });
  assert.equal(a, b);
  assert.equal(server.get(a)?.occurrence_count, 2);
  assert.equal(server.listRecent().length, 1);
  server.close();
});

test("fingerprint normalizes numbers and URLs", () => {
  const server = new ErrorServer(tempDbPath());
  const a = server.capture({ error: new Error("Connection refused to 127.0.0.1:5432") });
  const b = server.capture({ error: new Error("Connection refused to 127.0.0.1:5433") });
  assert.equal(a, b, "dynamic numbers in messages must group together");

  const c = server.capture({ error: new Error("Failed to fetch https://api.example.com/v1/users") });
  const d = server.capture({ error: new Error("Failed to fetch https://api.example.com/v2/posts") });
  assert.equal(c, d, "URLs must be normalized");
  server.close();
});

test("different error names do not group", () => {
  const server = new ErrorServer(tempDbPath());
  const a = server.capture({ error: new TypeError("boom") });
  const b = server.capture({ error: new RangeError("boom") });
  assert.notEqual(a, b);
  server.close();
});

test("resolve marks the error resolved and stats reflect it", () => {
  const server = new ErrorServer(tempDbPath());
  const id = server.capture({ error: new Error("fix me") });
  server.capture({ error: new Error("leave me") });

  server.resolve(id, "agent", "https://github.com/pr/1");

  const record = server.get(id);
  assert.equal(record?.resolved, 1);
  assert.equal(record?.resolved_by, "agent");
  assert.equal(record?.fix_pr_url, "https://github.com/pr/1");

  const stats = server.getStats();
  assert.equal(stats.total, 2);
  assert.equal(stats.unresolved, 1);
  assert.equal(stats.resolved, 1);
  assert.equal(stats.unique_fingerprints, 1);

  const queue = server.listUnresolved();
  assert.equal(queue.length, 1);
  assert.notEqual(queue[0].id, id);
  server.close();
});

test("watch is a live tail — history is not replayed", async () => {
  const dbPath = tempDbPath();
  const seed = new ErrorServer(dbPath);
  seed.capture({ error: new Error("old error") });
  seed.close();

  const server = new ErrorServer(dbPath);
  const seen: string[] = [];
  const stop = server.watch((err) => seen.push(err.id), 50);

  await delay(150);
  assert.equal(seen.length, 0, "watch must not replay existing errors");

  const id = server.capture({ error: new Error("new error") });
  await delay(200);
  assert.deepEqual(seen, [id]);

  const id2 = server.capture({ error: new Error("another error") });
  await delay(200);
  assert.deepEqual(seen, [id, id2]);

  stop();
  server.close();
});

test("levels are counted in stats", () => {
  const server = new ErrorServer(tempDbPath());
  server.capture({ error: new Error("crash"), level: "fatal" });
  server.capture({ error: new Error("hm"), level: "warning" });
  const stats = server.getStats();
  assert.equal(stats.fatal, 1);
  assert.equal(stats.warnings, 1);
  assert.equal(stats.errors, 0);
  server.close();
});
