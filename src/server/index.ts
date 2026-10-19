/**
 * XorVoid Error Server — SQLite-backed error storage.
 *
 * Captures errors from the SDK, stores them with full context,
 * groups similar errors via fingerprinting, and tracks resolution status.
 *
 * This is NOT a cloud service — all data stays on the user's machine
 * in a local SQLite database. The AI agent reads from this database
 * to find errors that need fixing.
 */

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { defaultDbPath } from "../home.ts";
import fs from "node:fs";
import path from "node:path";

export interface ErrorRecord {
  id: string;
  timestamp: number;
  project: string;
  release: string | null;
  environment: string;
  error_name: string;
  error_message: string;
  error_stack: string | null;
  error_type: "Error" | "TypeError" | "ReferenceError" | "RangeError" | "SyntaxError" | "UnhandledRejection" | "UncaughtException" | "Unknown";
  fingerprint: string;       // groups similar errors together
  context_json: string;      // JSON-encoded request context, user data, etc.
  url: string | null;
  method: string | null;
  status_code: number | null;
  user_id: string | null;
  session_id: string | null;
  level: "fatal" | "error" | "warning" | "info";
  resolved: boolean;
  resolved_at: number | null;
  resolved_by: string | null;   // "agent" or "human:username"
  fix_pr_url: string | null;     // GitHub PR URL if agent fixed it
  occurrence_count: number;      // how many times this fingerprint has been seen
  last_seen: number;
}

export interface ErrorStats {
  total: number;
  unresolved: number;
  resolved: number;
  fatal: number;
  errors: number;
  warnings: number;
  unique_fingerprints: number;
  topErrors: { fingerprint: string; error_name: string; error_message: string; count: number; last_seen: number }[];
}

export class ErrorServer {
  private db: DatabaseSync;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || defaultDbPath();
    if (this.dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS errors (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        project TEXT NOT NULL DEFAULT 'default',
        release TEXT,
        environment TEXT NOT NULL DEFAULT 'production',
        error_name TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        error_type TEXT NOT NULL DEFAULT 'Unknown',
        fingerprint TEXT NOT NULL,
        context_json TEXT NOT NULL DEFAULT '{}',
        url TEXT,
        method TEXT,
        status_code INTEGER,
        user_id TEXT,
        session_id TEXT,
        level TEXT NOT NULL DEFAULT 'error',
        resolved INTEGER NOT NULL DEFAULT 0,
        resolved_at INTEGER,
        resolved_by TEXT,
        fix_pr_url TEXT,
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        last_seen INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_errors_fingerprint ON errors(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON errors(timestamp);
      CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors(resolved);
      CREATE INDEX IF NOT EXISTS idx_errors_level ON errors(level);
      CREATE INDEX IF NOT EXISTS idx_errors_project ON errors(project);
    `);
  }

  /**
   * Capture an error. If an error with the same fingerprint already exists,
   * increment its occurrence_count and update last_seen.
   */
  capture(params: {
    error: Error | { name: string; message: string; stack?: string };
    project?: string;
    release?: string;
    environment?: string;
    context?: Record<string, unknown>;
    url?: string;
    method?: string;
    statusCode?: number;
    userId?: string;
    sessionId?: string;
    level?: ErrorRecord["level"];
  }): string {
    const id = `xv_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
    const timestamp = Date.now();
    const err = params.error;
    const errorName = err.name || "Error";
    const errorMessage = err.message || "Unknown error";
    const errorStack = err.stack || null;
    const errorType = this.classifyErrorType(errorName);
    const fingerprint = this.fingerprint(errorName, errorMessage, errorStack);
    const contextJson = JSON.stringify(params.context || {});

    // Check if an error with this fingerprint already exists
    const existing = this.db.prepare(
      "SELECT id, occurrence_count FROM errors WHERE fingerprint = ? AND resolved = 0 ORDER BY last_seen DESC LIMIT 1"
    ).get(fingerprint) as { id: string; occurrence_count: number } | undefined;

    if (existing) {
      // Increment occurrence count and update last_seen
      this.db.prepare(
        "UPDATE errors SET occurrence_count = occurrence_count + 1, last_seen = ?, context_json = ? WHERE id = ?"
      ).run(timestamp, contextJson, existing.id);
      return existing.id;
    }

    // Insert new error
    this.db.prepare(
      `INSERT INTO errors (
        id, timestamp, project, release, environment,
        error_name, error_message, error_stack, error_type,
        fingerprint, context_json, url, method, status_code,
        user_id, session_id, level, resolved, resolved_at, resolved_by,
        fix_pr_url, occurrence_count, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, 1, ?)`
    ).run(
      id, timestamp,
      params.project || "default",
      params.release || null,
      params.environment || "production",
      errorName, errorMessage, errorStack, errorType,
      fingerprint, contextJson,
      params.url || null, params.method || null, params.statusCode || null,
      params.userId || null, params.sessionId || null,
      params.level || "error",
      timestamp
    );

    return id;
  }

  /**
   * Mark an error as resolved.
   */
  resolve(errorId: string, resolvedBy: string, fixPrUrl?: string): void {
    this.db.prepare(
      "UPDATE errors SET resolved = 1, resolved_at = ?, resolved_by = ?, fix_pr_url = ? WHERE id = ?"
    ).run(Date.now(), resolvedBy, fixPrUrl || null, errorId);
  }

  /**
   * Get an error by ID.
   */
  get(errorId: string): ErrorRecord | null {
    return (this.db.prepare("SELECT * FROM errors WHERE id = ?").get(errorId) as unknown as ErrorRecord) || null;
  }

  /**
   * List unresolved errors (the agent's fix queue).
   */
  listUnresolved(limit = 50, offset = 0): ErrorRecord[] {
    return this.db.prepare(
      "SELECT * FROM errors WHERE resolved = 0 ORDER BY last_seen DESC LIMIT ? OFFSET ?"
    ).all(limit, offset) as unknown as ErrorRecord[];
  }

  /**
   * List recent errors.
   */
  listRecent(limit = 50): ErrorRecord[] {
    return this.db.prepare(
      "SELECT * FROM errors ORDER BY timestamp DESC LIMIT ?"
    ).all(limit) as unknown as ErrorRecord[];
  }

  /**
   * Get statistics.
   */
  getStats(): ErrorStats {
    const total = (this.db.prepare("SELECT COUNT(*) as count FROM errors").get() as { count: number }).count;
    const unresolved = (this.db.prepare("SELECT COUNT(*) as count FROM errors WHERE resolved = 0").get() as { count: number }).count;
    const resolved = total - unresolved;
    const fatal = (this.db.prepare("SELECT COUNT(*) as count FROM errors WHERE level = 'fatal' AND resolved = 0").get() as { count: number }).count;
    const errors = (this.db.prepare("SELECT COUNT(*) as count FROM errors WHERE level = 'error' AND resolved = 0").get() as { count: number }).count;
    const warnings = (this.db.prepare("SELECT COUNT(*) as count FROM errors WHERE level = 'warning' AND resolved = 0").get() as { count: number }).count;
    const uniqueFingerprints = (this.db.prepare("SELECT COUNT(DISTINCT fingerprint) as count FROM errors WHERE resolved = 0").get() as { count: number }).count;

    const topErrors = this.db.prepare(
      `SELECT fingerprint, error_name, error_message, SUM(occurrence_count) as count, MAX(last_seen) as last_seen
       FROM errors WHERE resolved = 0
       GROUP BY fingerprint ORDER BY count DESC LIMIT 10`
    ).all() as { fingerprint: string; error_name: string; error_message: string; count: number; last_seen: number }[];

    return { total, unresolved, resolved, fatal, errors, warnings, unique_fingerprints: uniqueFingerprints, topErrors };
  }

  /**
   * Watch for NEW errors (polling-based, for the CLI `watch` command).
   * Live tail: starts from the current end of the log — history is not replayed.
   * Cursor is SQLite rowid (insertion order), not the id string.
   */
  watch(callback: (error: ErrorRecord) => void, intervalMs = 1000): () => void {
    const row = this.db.prepare("SELECT COALESCE(MAX(rowid), 0) AS max_rowid FROM errors").get() as { max_rowid: number };
    let lastRowid = Number(row.max_rowid);
    const timer = setInterval(() => {
      const newErrors = this.db.prepare(
        "SELECT *, rowid AS _rowid FROM errors WHERE rowid > ? ORDER BY rowid ASC"
      ).all(lastRowid) as unknown as (ErrorRecord & { _rowid: number })[];
      for (const err of newErrors) {
        lastRowid = Number(err._rowid);
        callback(err);
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Generate a fingerprint for error grouping.
   * Two errors with the same name + message + top stack frame
   * are considered the same error (grouped together).
   */
  private fingerprint(name: string, message: string, stack?: string | null): string {
    // Normalize the message — replace dynamic values with placeholders
    const normalizedMsg = message
      .replace(/[0-9a-f]{8,}/g, "<hex>")     // hex IDs
      .replace(/\d+/g, "<n>")                 // numbers
      .replace(/'[^']*'/g, "'...'")           // quoted strings
      .replace(/"[^"]*"/g, '"..."')           // double-quoted strings
      .replace(/https?:\/\/[^\s]+/g, "<url>") // URLs (before paths)
      .replace(/\/[^\s]+/g, "/<path>")        // file paths

    // Extract the top stack frame for grouping
    let topFrame = "";
    if (stack) {
      const frameMatch = stack.match(/at .+ \((.+):\d+:\d+\)/);
      if (frameMatch) topFrame = frameMatch[1];
    }

    return createHash("sha256")
      .update(`${name}|${normalizedMsg}|${topFrame}`)
      .digest("hex")
      .slice(0, 32);
  }

  /**
   * Classify the error type from the error name.
   */
  private classifyErrorType(name: string): ErrorRecord["error_type"] {
    const map: Record<string, ErrorRecord["error_type"]> = {
      "TypeError": "TypeError",
      "ReferenceError": "ReferenceError",
      "RangeError": "RangeError",
      "SyntaxError": "SyntaxError",
      "Error": "Error",
    };
    return map[name] || "Unknown";
  }
}
