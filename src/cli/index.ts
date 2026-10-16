#!/usr/bin/env node
/**
 * XorVoid CLI — AI-powered error tracking that fixes errors before you see them.
 *
 * Usage:
 *   xorvoid list              list recent errors
 *   xorvoid show <id>         show error details + AI analysis
 *   xorvoid fix <id>          trigger AI auto-fix
 *   xorvoid watch             live tail of incoming errors
 *   xorvoid dashboard         open local web dashboard
 *   xorvoid init              initialize XorVoid in your project
 */

const args = process.argv.slice(2);
const command = args[0] || "help";

const COMMANDS: Record<string, () => void | Promise<void>> = {
  help: () => {
    console.log(`
  XorVoid — AI error tracking that fixes errors before you see them.

  Commands:
    init          Initialize XorVoid in your project
    list          List recent errors
    show <id>     Show error details + AI analysis
    fix <id>      Trigger AI auto-fix for an error
    watch         Live tail of incoming errors
    dashboard     Open local web dashboard
    version       Print version

  Sentry tells you what broke. XorVoid fixes it.
`);
  },
  version: () => {
    console.log("xorvoid 0.1.0-beta.1");
  },
  init: () => {
    console.log("[xorvoid] initializing...");
    console.log("[xorvoid] created .xorvoid/ config");
    console.log("[xorvoid] SDK ready — import { init, captureException } from '@fraziym/xorvoid'");
    console.log("[xorvoid] done.");
  },
  list: () => {
    console.log("[xorvoid] no errors captured yet. Initialize with: xorvoid init");
  },
  show: () => {
    const id = args[1];
    if (!id) { console.log("usage: xorvoid show <id>"); return; }
    console.log(`[xorvoid] error ${id} not found`);
  },
  fix: () => {
    const id = args[1];
    if (!id) { console.log("usage: xorvoid fix <id>"); return; }
    console.log(`[xorvoid] triggering AI auto-fix for error ${id}...`);
    console.log("[xorvoid] agent not yet configured. Set up AXONIZ first.");
  },
  watch: () => {
    console.log("[xorvoid] watching for errors... (press Ctrl+C to stop)");
  },
  dashboard: () => {
    console.log("[xorvoid] dashboard not yet built. Coming soon.");
  },
};

if (COMMANDS[command]) {
  COMMANDS[command]();
} else {
  console.log(`unknown command: ${command}`);
  COMMANDS.help();
  process.exit(1);
}
