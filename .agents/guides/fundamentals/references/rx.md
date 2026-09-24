# @pyreon/rx

- 42 signal-aware transforms (collections, set ops `intersection`/`difference`/`union` — reactive on both inputs — aggregation, operators, timing, search). `sortBy` takes an `'asc' | 'desc'` direction.
- Each is overloaded: `Signal<T[]>` in gives a `Computed` out; a plain `T[]` gives a plain value.
- `pipe(source, op1, op2, …)` collapses a chain into one computed (one node, one recompute per change, versus N for separate calls). Bench: `bun run --filter=@pyreon/rx bench`.
- `debounce`, `throttle`, `distinct`, `scan` own an eager `effect()`. Inside a component or `effectScope` it is torn down automatically (including a pending timer); elsewhere call the idempotent `.dispose()`.
