/**
 * XorVoid SDK — drop-in @sentry/node replacement.
 *
 * Captures errors to local SQLite (no cloud, no network call).
 * The XorVoid agent picks up new errors and auto-fixes them.
 *
 * Usage:
 *   import { init, captureException } from '@fraziym/xorvoid';
 *   init({ project: 'my-app' });
 *   try { risky() } catch (e) { captureException(e); }
 */

import { ErrorServer } from "../server/index.ts";
import { EventEmitter } from "node:events";
import { defaultDbPath } from "../home.ts";

export interface XorvoidConfig {
  /** Where to store errors. Default: ~/.fraziym/xorvoid/errors.db */
  dsn?: string;
  /** Project name for grouping. */
  project?: string;
  /** Enable AI auto-fix (triggers agent when new error arrives). Default: true */
  autoFix?: boolean;
  /** Release version for tracking which deploy caused which bug. */
  release?: string;
  /** Environment (production, staging, development). */
  environment?: string;
}

const DEFAULT_CONFIG: XorvoidConfig = {
  dsn: defaultDbPath(),
  autoFix: true,
  environment: "production",
};

let config: XorvoidConfig = { ...DEFAULT_CONFIG };
let server: ErrorServer | null = null;
const events = new EventEmitter();

/**
 * Initialize XorVoid. Must be called before captureException.
 */
export function init(cfg: XorvoidConfig = {}): void {
  config = { ...DEFAULT_CONFIG, ...cfg };
  server = new ErrorServer(config.dsn);

  // Install global error handlers
  process.on("uncaughtException", (error: Error) => {
    captureException(error, { level: "fatal" });
    // Give the capture time to write to SQLite before crashing
    setTimeout(() => process.exit(1), 100);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureException(error, { level: "fatal" });
  });

  console.log(`[xorvoid] initialized — project: ${config.project || "default"}, db: ${config.dsn}`);
}

/**
 * Capture an exception. Returns the error ID.
 * If an error with the same fingerprint already exists, increments its count.
 */
export function captureException(
  error: Error | { name: string; message: string; stack?: string },
  context?: Record<string, unknown> & { level?: "fatal" | "error" | "warning" | "info" },
): string {
  if (!server) {
    // SDK not initialized — create a default server
    server = new ErrorServer();
  }

  const id = server.capture({
    error,
    project: config.project,
    release: config.release,
    environment: config.environment,
    context: context || {},
    level: context?.level || "error",
  });

  // Emit event for the watch command / agent
  // NOTE: named "captured", not "error" — EventEmitter throws on unhandled "error" events
  events.emit("captured", { id, error, context });

  // If autoFix is enabled, signal the agent (in production this would
  // wake the AXONIZ agent; for now it just logs)
  if (config.autoFix) {
    const record = server.get(id);
    if (record && record.occurrence_count === 1) {
      console.log(`[xorvoid] new error captured: ${id} — ${record.error_name}: ${record.error_message}`);
      console.log(`[xorvoid] agent would analyze + fix this error (requires @fraziym/axoniz)`);
    }
  }

  return id;
}

/**
 * Capture a message (not an exception).
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" = "info",
  context?: Record<string, unknown>,
): string {
  return captureException(new Error(message), { ...context, level });
}

/**
 * Get the error server instance (for the CLI / agent).
 */
export function getServer(): ErrorServer | null {
  return server;
}

/**
 * Get the current config.
 */
export function getConfig(): XorvoidConfig {
  return { ...config };
}

/**
 * Subscribe to new error events.
 */
export function onError(callback: (data: { id: string; error: unknown; context: unknown }) => void): () => void {
  events.on("captured", callback);
  return () => events.off("captured", callback);
}
