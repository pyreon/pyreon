---
"@pyreon/mcp": minor
---

Two new MCP tools for AI coding assistants (T2.5.3 + T2.5.4). `get_pattern({ name })` fetches a "how do I do X in Pyreon" pattern body from `docs/patterns/<name>.md` — 8 foundational patterns ship today (dev-warnings, controllable-state, ssr-safe-hooks, signal-writes, keyed-lists, reactive-context, event-listeners, form-fields). `get_anti_patterns({ category? })` parses `.claude/rules/anti-patterns.md` and returns per-category listings with detector tags surfaced inline. Complements the reactive `validate` tool from T2.5.2: patterns + anti-patterns are proactive (called BEFORE writing code), `validate` is reactive (called AFTER). Both tools walk up from `process.cwd()` to locate the source files so they work across worktrees and monorepo layouts; a helpful miss message prints when running outside the Pyreon repo.
