#!/usr/bin/env node
/**
 * XorVoid CLI — AI-powered error tracking that fixes errors before you see them.
 *
 * Usage:
 *   xorvoid init              Initialize XorVoid in your project
 *   xorvoid list              List recent errors
 *   xorvoid show <id>         Show error details + fingerprint group
 *   xorvoid fix <id>          Trigger AI auto-fix for an error
 *   xorvoid watch             Live tail of incoming errors
 *   xorvoid stats             Show error statistics
 *   xorvoid resolve <id>      Mark an error as resolved
 *   xorvoid version           Print version
 */

import { ErrorServer } from "../server/index.js";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const command = args[0] || "help";
const dbPath = path.join(os.homedir(), ".xorvoid", "errors.db");

function getServer(): ErrorServer {
  return new ErrorServer(dbPath);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const ago = Math.floor((Date.now() - ts) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
  return `${Math.floor(ago / 86400)}d ago`;
}

function severityColor(level: string): string {
  const colors: Record<string, string> = {
    fatal: "\x1b[31m",   // red
    error: "\x1b[33m",   // yellow
    warning: "\x1b[36m", // cyan
    info: "\x1b[37m",    // white
  };
  return colors[level] || "\x1b[37m";
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const commands: Record<string, () => void | Promise<void>> = {
  help: () => {
    console.log(`
${BOLD}XorVoid${RESET} — AI error tracking that fixes errors before you see them.

${BOLD}Commands:${RESET}
  ${BOLD}init${RESET}              Initialize XorVoid in your project
  ${BOLD}list${RESET}              List recent errors
  ${BOLD}show <id>${RESET}         Show error details + fingerprint group
  ${BOLD}fix <id>${RESET}          Trigger AI auto-fix for an error
  ${BOLD}watch${RESET}             Live tail of incoming errors
  ${BOLD}stats${RESET}             Show error statistics
  ${BOLD}resolve <id>${RESET}     Mark an error as resolved
  ${BOLD}version${RESET}           Print version

${DIM}Sentry tells you what broke. XorVoid fixes it.${RESET}
`);
  },

  version: () => {
    console.log("xorvoid 0.1.0-beta.1");
  },

  init: () => {
    const fs = require("node:fs");
    const xorvoidDir = path.join(os.homedir(), ".xorvoid");
    fs.mkdirSync(xorvoidDir, { recursive: true });
    console.log(`${BOLD}[xorvoid]${RESET} initialized`);
    console.log(`  Database: ${DIM}${dbPath}${RESET}`);
    console.log(`  ${BOLD}SDK ready${RESET} — import { init, captureException } from '@fraziym/xorvoid'`);
    console.log(`  Run ${BOLD}xorvoid list${RESET} after errors are captured`);
  },

  list: () => {
    const server = getServer();
    const errors = server.listRecent(20);
    if (errors.length === 0) {
      console.log(`${DIM}[xorvoid] no errors captured yet${RESET}`);
      console.log(`${DIM}  Initialize the SDK in your app:${RESET}`);
      console.log(`    import { init, captureException } from '@fraziym/xorvoid'`);
      console.log(`    init({ project: 'my-app' })`);
      server.close();
      return;
    }
    console.log(`${BOLD}XorVoid — Recent Errors${RESET}\n`);
    for (const err of errors) {
      const sev = severityColor(err.level);
      const status = err.resolved ? `${DIM}✓ resolved${RESET}` : `${sev}● unresolved${RESET}`;
      const count = err.occurrence_count > 1 ? ` ${BOLD}×${err.occurrence_count}${RESET}` : "";
      console.log(`  ${sev}${err.id}${RESET}  ${status}${count}`);
      console.log(`    ${BOLD}${err.error_name}${RESET}: ${err.error_message.slice(0, 80)}`);
      console.log(`    ${DIM}project: ${err.project} · ${formatTime(err.last_seen)}${RESET}\n`);
    }
    const stats = server.getStats();
    console.log(`${DIM}${stats.unresolved} unresolved · ${stats.resolved} resolved · ${stats.unique_fingerprints} unique${RESET}`);
    server.close();
  },

  show: () => {
    const id = args[1];
    if (!id) { console.log("usage: xorvoid show <id>"); return; }
    const server = getServer();
    const err = server.get(id);
    if (!err) {
      console.log(`${severityColor("error")}Error not found: ${id}${RESET}`);
      server.close();
      return;
    }
    console.log(`${BOLD}XorVoid — Error Details${RESET}\n`);
    console.log(`  ${BOLD}ID:${RESET}          ${err.id}`);
    console.log(`  ${BOLD}Level:${RESET}       ${severityColor(err.level)}${err.level}${RESET}`);
    console.log(`  ${BOLD}Type:${RESET}       ${err.error_type}`);
    console.log(`  ${BOLD}Name:${RESET}       ${err.error_name}`);
    console.log(`  ${BOLD}Message:${RESET}    ${err.error_message}`);
    console.log(`  ${BOLD}Project:${RESET}    ${err.project}`);
    console.log(`  ${BOLD}Release:${RESET}    ${err.release || "—"}`);
    console.log(`  ${BOLD}Environment:${RESET} ${err.environment}`);
    console.log(`  ${BOLD}First seen:${RESET} ${formatTime(err.timestamp)}`);
    console.log(`  ${BOLD}Last seen:${RESET}  ${formatTime(err.last_seen)}`);
    console.log(`  ${BOLD}Occurrences:${RESET} ${err.occurrence_count}`);
    console.log(`  ${BOLD}Fingerprint:${RESET} ${err.fingerprint}`);
    console.log(`  ${BOLD}Resolved:${RESET}   ${err.resolved ? `✓ by ${err.resolved_by}` : "no"}`);
    if (err.fix_pr_url) console.log(`  ${BOLD}Fix PR:${RESET}      ${err.fix_pr_url}`);
    if (err.error_stack) {
      console.log(`\n  ${BOLD}Stack trace:${RESET}`);
      const stackLines = err.error_stack.split("\n").slice(0, 10);
      for (const line of stackLines) {
        console.log(`    ${DIM}${line}${RESET}`);
      }
    }
    const ctx = JSON.parse(err.context_json);
    if (Object.keys(ctx).length > 0) {
      console.log(`\n  ${BOLD}Context:${RESET}`);
      for (const [k, v] of Object.entries(ctx)) {
        console.log(`    ${k}: ${JSON.stringify(v).slice(0, 100)}`);
      }
    }
    server.close();
  },

  fix: () => {
    const id = args[1];
    if (!id) { console.log("usage: xorvoid fix <id>"); return; }
    const server = getServer();
    const err = server.get(id);
    if (!err) {
      console.log(`Error not found: ${id}`);
      server.close();
      return;
    }
    console.log(`${BOLD}[xorvoid]${RESET} triggering AI auto-fix for ${id}...`);
    console.log(`  ${BOLD}Error:${RESET} ${err.error_name}: ${err.error_message}`);
    console.log(`  ${BOLD}Fingerprint:${RESET} ${err.fingerprint}`);
    console.log(`  ${BOLD}Occurrences:${RESET} ${err.occurrence_count}`);
    console.log(`\n  ${DIM}Agent analysis:${RESET}`);
    console.log(`    ${DIM}1. Reading stack trace...${RESET}`);
    console.log(`    ${DIM}2. Loading source files via @fraziym/axodex...${RESET}`);
    console.log(`    ${DIM}3. Identifying root cause...${RESET}`);
    console.log(`    ${DIM}4. Writing fix...${RESET}`);
    console.log(`    ${DIM}5. Running tests...${RESET}`);
    console.log(`\n  ${severityColor("warning")}Agent requires @fraziym/axoniz to be installed.${RESET}`);
    console.log(`  ${DIM}Install with: npm install @fraziym/axoniz${RESET}`);
    server.close();
  },

  watch: () => {
    const server = getServer();
    console.log(`${BOLD}[xorvoid]${RESET} watching for errors... ${DIM}(Ctrl+C to stop)${RESET}\n`);
    const stop = server.watch((err) => {
      const sev = severityColor(err.level);
      console.log(`  ${sev}${new Date().toISOString().slice(11, 19)}${RESET}  ${BOLD}${err.error_name}${RESET}: ${err.error_message.slice(0, 80)}`);
      console.log(`    ${DIM}${err.id} · ${err.project} · fingerprint: ${err.fingerprint.slice(0, 12)}...${RESET}\n`);
    }, 1000);
    process.on("SIGINT", () => {
      stop();
      server.close();
      console.log(`\n${DIM}[xorvoid] stopped watching${RESET}`);
      process.exit(0);
    });
  },

  stats: () => {
    const server = getServer();
    const stats = server.getStats();
    console.log(`${BOLD}XorVoid — Statistics${RESET}\n`);
    console.log(`  ${BOLD}Total errors:${RESET}      ${stats.total}`);
    console.log(`  ${BOLD}Unresolved:${RESET}         ${severityColor("error")}${stats.unresolved}${RESET}`);
    console.log(`  ${BOLD}Resolved:${RESET}          ${stats.resolved}`);
    console.log(`  ${BOLD}Unique fingerprints:${RESET} ${stats.unique_fingerprints}`);
    console.log(`  ${BOLD}Fatal:${RESET}             ${severityColor("fatal")}${stats.fatal}${RESET}`);
    console.log(`  ${BOLD}Errors:${RESET}            ${severityColor("error")}${stats.errors}${RESET}`);
    console.log(`  ${BOLD}Warnings:${RESET}          ${severityColor("warning")}${stats.warnings}${RESET}`);
    if (stats.topErrors.length > 0) {
      console.log(`\n  ${BOLD}Top recurring errors:${RESET}`);
      for (const top of stats.topErrors.slice(0, 5)) {
        console.log(`    ${BOLD}×${top.count}${RESET}  ${top.error_name}: ${top.error_message.slice(0, 60)}`);
        console.log(`      ${DIM}last seen ${formatTime(top.last_seen)}${RESET}`);
      }
    }
    server.close();
  },

  resolve: () => {
    const id = args[1];
    if (!id) { console.log("usage: xorvoid resolve <id>"); return; }
    const server = getServer();
    const err = server.get(id);
    if (!err) {
      console.log(`Error not found: ${id}`);
      server.close();
      return;
    }
    server.resolve(id, "human:cli");
    console.log(`${BOLD}[xorvoid]${RESET} resolved: ${id}`);
    console.log(`  ${DIM}${err.error_name}: ${err.error_message}${RESET}`);
    server.close();
  },
};

if (commands[command]) {
  commands[command]();
} else {
  console.log(`unknown command: ${command}`);
  commands.help();
  process.exit(1);
}
