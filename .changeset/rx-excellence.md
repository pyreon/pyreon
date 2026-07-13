---
"@pyreon/rx": minor
---

Excellence pass: fix a timer leak, add `flatMap`/`countBy`, extend `combine`/`zip`/`pipe` typing, and add a competitor bench.

- **Fix (leak class I)**: `debounce`/`throttle` now clear their pending `setTimeout` when their owning `effectScope` is disposed (component unmount), not only on an explicit `dispose()`. Previously a component that unmounted mid-debounce left a timer that fired post-unmount, mutating a subscriber-less signal. The effect's returned cleanup now owns timer cancellation in one place.
- **`distinct`/`scan` lifecycle**: both now return `& { dispose() }` (matching `debounce`/`throttle`) so standalone usage can release the eager `effect()`; inside a component/`effectScope` they remain auto-torn-down. All four dispose handles are idempotent.
- **New transforms (39 total, up from 37)**: `flatMap` (map + flatten one level) and `countBy` (per-bucket counts, the counting companion to `groupBy`), both overloaded `Signal<T[]> → Computed` / `T[] → plain`.
- **Wider typed overloads**: `combine` (up to 6 sources), `zip` (up to 4 arrays), `pipe` (up to 7 transforms) — the runtime already supported N; the added overloads remove the "falls back to `any`" type gap.
- **Docs**: fixed the README `search` example (`{ keys }` → positional `['name','email']`); softened the `debounce`/`throttle` "never auto-cleaned" claim (they ARE auto-cleaned in a component scope); documented the `pipe` 1-node-vs-N-node composition win with exact node/recompute counts.
- **Bench**: `bun run --filter=@pyreon/rx bench` now reports (A) the deterministic `pipe`-vs-naive composition structure (1 node / 1 recompute vs N / N) and (B) per-op re-derive cost against the fair signal-based peers — hand-written Pyreon `computed` and Solid `createMemo` — with RxJS reframed as a scale-context row, not the peer (it's a push-stream library, not pull-based signal derivation).
