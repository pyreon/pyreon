---
'@pyreon/compiler': patch
'@pyreon/mcp': patch
---

New `detectPyreonPatterns` code `static-early-return-conditional`: flags `if (loading()) return <Skeleton/>` at the top of a component body when the condition reads a tracked `signal()`/`computed()` binding. Components run ONCE — the branch is evaluated exactly once at mount and the component is pinned to it forever (verified end-to-end: the compiler emits the shape unchanged with zero warnings, and TS2774 does not cover it because the signal IS called). The message prescribes `<Show when={() => loading()} fallback={…}>` or a returned reactive accessor. Signal-binding-gated only (helper-call / props / env conditions stay unflagged); the `return null` shape stays with `static-return-null-conditional`, so the two codes never double-fire. Surfaced automatically by MCP `validate`, `pyreon check`, and `pyreon doctor`. Also fixes stale manifest prose (detector count 14 → 16; the "every diagnostic reports `fixable: false`" invariant claim, superseded when `migratePyreonCode` shipped).
