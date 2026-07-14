---
"@pyreon/toast": patch
"@pyreon/mcp": patch
---

docs(toast): source-verified mistakes[] for the flagship `toast()` API (4 → 8).
Added four footguns verified by reading toast.ts: `toast.loading()` never
auto-dismisses (created with `duration: 0` — must be resolved via update/dismiss/
remove or `toast.promise`); `duration: 0` means PERSISTENT not instant (the timer
is skipped for `duration <= 0`; use `toast.remove` to clear now); `toast.update()`
only changes message/type/duration/description (NOT icon/action); `toast.promise()`
returns the ORIGINAL promise so a rejection still propagates (add your own catch),
and its success/error may be functions receiving the resolved value/error. The
existing summary (dismiss soft vs remove hard, methods list) verified accurate —
no doc bug. Regenerates the MCP api-reference toast region + snapshot (mistakes
4 → 8). Docs/manifest only — no runtime behavior change.
