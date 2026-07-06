---
"@pyreon/runtime-dom": minor
---

Add an **Activity ("why did X update?") tab** to the reactive dev overlay
(`Ctrl+Shift+R`). Alongside the existing **Health** view (graph-wiring insights),
the overlay now surfaces the runtime causal view: the recent reactive fires
(newest first, from `getReactiveFires`) plus the causal chain that explains the
most recent one (`getUpdateCause` / `formatUpdateCause`) — e.g.

```text
Why did total (derived) update?
  qty (signal) changed
  → total (derived) recomputed   ← explained
```

This is the inverse of React DevTools' "why did this render?": instead of a
whole-component re-render reason, it reconstructs the exact
signal→computed→effect chain from the dependency graph. Reading the fires
auto-activates tracking; the overlay reopens on the Health tab.
