# XorVoid

**AI-powered error tracking that fixes errors before you see them.**

*Sentry tells you what broke. XorVoid fixes it.*

## What is XorVoid?

XorVoid is a local-first error tracking system with an AI agent that automatically:
1. Captures errors (drop-in `@sentry/node` replacement, writes to local SQLite)
2. Reads the stack trace + source code (via `@fraziym/axodex` code-graph)
3. Identifies the root cause
4. Writes a fix
5. Runs tests (via `@fraziym/axotest`)
6. Opens a PR

**You review a PR, not a dashboard full of red.**

## CLI

```bash
xorvoid list              # list recent errors
xorvoid show <id>         # show error details + AI analysis
xorvoid fix <id>          # trigger AI auto-fix for an error
xorvoid watch             # live tail of incoming errors
xorvoid dashboard         # open the local web dashboard
```

## SDK (drop-in @sentry/node replacement)

```typescript
import { init, captureException } from '@fraziym/xorvoid';

init({ dsn: 'local://.xorvoid' });  // writes to SQLite, no cloud

try {
  riskyOperation();
} catch (e) {
  captureException(e);  // captured locally, agent starts fixing
}
```

## Architecture

```
Error occurs in your app
    ↓
@fraziym/xorvoid SDK captures it (local SQLite via built-in node:sqlite, no network, zero runtime deps)
    ↓
XorVoid agent wakes (powered by @fraziym/axoniz)
    ↓
@fraziym/axodex provides code-graph (call paths, ownership, change history)
    ↓
Agent writes fix → @fraziym/axotest verifies → PR opened
    ↓
@fraziym/xorgis verifies the fix has no new vulnerabilities (optional)
```

## Dependencies

| Package | Role |
|---|---|
| `@fraziym/axoniz` | AI agent engine (the brain) |
| `@fraziym/axodex` | Code-graph intelligence (the eyes) |
| `@fraziym/axotest` | Test verification (optional) |
| `@fraziym/xorgis` | Security verification of fixes (optional) |

## Pricing

- **Free**: unlimited error capture (local SQLite), 5 AI fixes/month
- **Pro** ($25/mo): unlimited AI auto-fixes (bring your own LLM key), team dashboard, integrations
- **Business** ($75/mo): hosted AI compute, error economics, fix policies, SSO
- **Enterprise**: on-prem air-gapped, custom agents, SLA on fix time

## License

MIT
