/**
 * Fraziym home layout — one root for every Fraziym product:
 *
 *   Machine-local FRAZIYM cache         (T2; override: $FRAZIYM_LOCAL)
 *   └── xorvoid/
 *       └── errors.db                default ErrorServer database
 *
 * Error data is machine-local telemetry (like axoniz's trajectory.db), so it
 * never roams: `%LOCALAPPDATA%\FRAZIYM` on Windows, `~/Library/Caches/FRAZIYM`
 * on macOS, `$XDG_CACHE_HOME/fraziym` on Linux.
 */

import os from "node:os";
import path from "node:path";

/** Shared Fraziym root (~/.fraziym, or $FRAZIYM_HOME). */
export function fraziymRoot(): string {
  const override = process.env.FRAZIYM_HOME?.trim();
  return override ? path.resolve(override) : path.join(os.homedir(), ".fraziym");
}

/** Machine-local Fraziym cache root — state that never roams (T2; override: $FRAZIYM_LOCAL). */
export function fraziymLocal(): string {
  const override = process.env.FRAZIYM_LOCAL?.trim();
  if (override) return path.resolve(override);
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "FRAZIYM");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "FRAZIYM");
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  return path.join(xdg || path.join(os.homedir(), ".cache"), "fraziym");
}

/** Per-product state dir for xorvoid — machine-local FRAZIYM cache. */
export function xorvoidHome(): string {
  return path.join(fraziymLocal(), "xorvoid");
}

/** Default error database path — <machine-local cache>/xorvoid/errors.db. */
export function defaultDbPath(): string {
  return path.join(xorvoidHome(), "errors.db");
}
