/**
 * Fraziym home layout — one root for every Fraziym product:
 *
 *   ~/.fraziym/                      (override: $FRAZIYM_HOME)
 *   └── xorvoid/
 *       └── errors.db                default ErrorServer database
 */

import os from "node:os";
import path from "node:path";

/** Shared Fraziym root (~/.fraziym, or $FRAZIYM_HOME). */
export function fraziymRoot(): string {
  const override = process.env.FRAZIYM_HOME?.trim();
  return override ? path.resolve(override) : path.join(os.homedir(), ".fraziym");
}

/** Per-product state dir for xorvoid — ~/.fraziym/xorvoid. */
export function xorvoidHome(): string {
  return path.join(fraziymRoot(), "xorvoid");
}

/** Default error database path — ~/.fraziym/xorvoid/errors.db. */
export function defaultDbPath(): string {
  return path.join(xorvoidHome(), "errors.db");
}
