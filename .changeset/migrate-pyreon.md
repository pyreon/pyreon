---
'@pyreon/compiler': minor
'@pyreon/mcp': minor
---

feat: `migrate_pyreon` — auto-fix the mechanically-safe Pyreon footguns

Closes the documented gap that kept every `detectPyreonPatterns` diagnostic `fixable: false` ("no migrate_pyreon tool yet"). New `migratePyreonCode(source, filename?)` in `@pyreon/compiler` + the `migrate_pyreon` MCP tool (parallel to `migrate_react`) rewrite Pyreon-footgun → correct-Pyreon for the three UNAMBIGUOUS, purely-mechanical codes:

- `signal-write-as-call` — `sig(v)` → `sig.set(v)`
- `for-with-key` — `<For key={k}>` → `<For by={k}>`
- `as-unknown-as-vnodechild` — `x as unknown as VNodeChild` → `x`

Every other footgun (props-destructured, on-click-undefined, raw-add-event-listener, …) needs human judgement and is returned in `remaining`, untouched. The codemod is span-based (exact `getStart`/`getEnd`), applied back-to-front, non-overlapping, and idempotent — so an agent can apply the result verbatim. This makes those three `detectPyreonPatterns` codes report `fixable: true` (kept in sync via the new `AUTO_FIXABLE_PYREON_CODES` set); every other code stays `fixable: false`.
