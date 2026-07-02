---
'@pyreon/reactivity': patch
---

perf(reactivity): −24% production bundle (9,254 → 7,014 B gz) — dev-tools machinery now fully tree-shakes

The public dev-tools readers (`getReactiveGraph`, `getFireSummaries`, `getReactiveFires`, `getUpdateCause`, `describeReactiveGraph`, `getReactiveTrace`) are provably empty in production (the registry only fills under dev gates) — but as public exports they pinned ~2.2 KB gz of registry/stack-parse machinery into every whole-entry production bundle. Their bodies are now wrapped in dev-block guards that bundlers drop at parse time (an early prod-return only kills the bytes at minify time, AFTER tree-shaking's symbol-usage analysis — the machinery survived), and the `FinalizationRegistry` is `/* @__PURE__ */`-annotated so it DCEs once its dev-gated `register` call sites fold.

Zero behavior change: in dev everything works exactly as before (675-test suite green); in production the readers return the same vacuous values they always did (`{nodes: [], edges: []}` / `[]` / `null`) — they just no longer ship the dead machinery behind them. Pure formatters (`formatUpdateCause`, `formatGraphDescription`) stay available in prod (a dev-captured cause can legitimately be formatted in a prod process, e.g. error-report tooling). Bundle budget ratcheted down 9,472 → 7,232 B so the win can't silently regress.
