/**
 * XorVoid SDK — drop-in @sentry/node replacement.
 *
 * Captures errors to local SQLite (no cloud, no network call).
 * The XorVoid agent picks up new errors and auto-fixes them.
 */

export interface XorvoidConfig {
  /** Where to store errors. Default: local SQLite at ~/.xorvoid/errors.db */
  dsn?: string;
  /** Project name for grouping. */
  project?: string;
  /** Enable AI auto-fix. Default: true */
  autoFix?: boolean;
  /** Release version for tracking which deploy caused which bug. */
  release?: string;
}

const DEFAULT_CONFIG: XorvoidConfig = {
  dsn: "local://.xorvoid",
  autoFix: true,
};

let config: XorvoidConfig = { ...DEFAULT_CONFIG };

export function init(cfg: XorvoidConfig): void {
  config = { ...DEFAULT_CONFIG, ...cfg };
  console.log(`[xorvoid] initialized (project: ${config.project || "unnamed"}, autoFix: ${config.autoFix})`);
}

export function captureException(error: Error | unknown, context?: Record<string, unknown>): string {
  const errorId = generateErrorId();
  const errorRecord = {
    id: errorId,
    timestamp: Date.now(),
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "Unknown", message: String(error), stack: undefined },
    context: context || {},
    release: config.release,
    project: config.project,
  };

  // In production: write to SQLite. For now: log.
  console.error(`[xorvoid] captured error ${errorId}: ${errorRecord.error.message}`);
  if (config.autoFix) {
    console.log(`[xorvoid] agent will analyze and fix...`);
    // In production: trigger the AXONIZ agent to analyze + fix
  }

  return errorId;
}

export function captureMessage(message: string, level: "info" | "warn" | "error" = "info"): string {
  return captureException(new Error(message), { level });
}

function generateErrorId(): string {
  return `xv_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}
