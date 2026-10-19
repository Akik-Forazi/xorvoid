/**
 * XorVoid SDK tests — drop-in capture API against a local SQLite database.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  init,
  captureException,
  captureMessage,
  getServer,
  getConfig,
  onError,
} from "../src/sdk/index.ts";

test("sdk init + captureMessage + onError", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xorvoid-sdk-"));
  const dsn = path.join(dir, "errors.db");

  init({ project: "sdk-test", dsn, autoFix: false, environment: "test" });

  const seen: string[] = [];
  const off = onError((data) => seen.push(data.id as string));

  const id = captureMessage("hello from the sdk", "warning", { extra: 1 });
  assert.ok(id.startsWith("xv_"));

  const server = getServer();
  assert.ok(server);
  const record = server.get(id);
  assert.equal(record?.error_message, "hello from the sdk");
  assert.equal(record?.error_name, "Error");
  assert.equal(record?.level, "warning");
  assert.equal(record?.project, "sdk-test");
  assert.equal(record?.environment, "test");

  assert.deepEqual(seen, [id]);

  const cfg = getConfig();
  assert.equal(cfg.project, "sdk-test");
  assert.equal(cfg.autoFix, false);

  off();
  captureException(new Error("after unsubscribe"));
  assert.equal(seen.length, 1, "onError unsubscribe must stop callbacks");

  server.close();
});
