---
"@pyreon/runtime-dom": minor
---

Add a zero-install in-app reactive-health overlay. Press `Ctrl+Shift+R` in any
dev build (or call `__PYREON_DEVTOOLS__.reactive.showOverlay()` / `$p.reactivity()`)
to open a floating panel that renders the live reactive graph's summary
(`N signals · M derived · K effects · E edges`) plus the health insights
`describeReactiveGraph` surfaces — `orphan-signal` (dead reactivity), `high-fanout`
(a hot hub), and `deep-chain`. It rides the auto-installed devtools hook (no Chrome
extension, no vite-plugin wiring) and tree-shakes out of production via the
`process.env.NODE_ENV` gate. Reading the graph auto-activates tracking, so it works
even if the app never called `reactive.activate()`.
