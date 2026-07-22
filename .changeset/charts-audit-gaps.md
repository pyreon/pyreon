---
'@pyreon/charts': minor
---

Audit-gap release — reactive theme, escape hatches, and mount fast path:

- **Reactive theme**: `theme` now accepts an accessor (`theme: () => (dark() ? 'dark' : null)`) — a flip disposes + re-inits the instance with the current option, group, and event handlers preserved (ECharts has no in-place theme swap; dispose+re-init is the mechanism, as in vue-echarts). Plain values stay static; a same-value re-run never swaps.
- **`getCore()` + `connect()` exported** — unblocks `registerMap` (map charts were advertised but unusable without it), `registerTheme`, `getInstanceByDom`, and linked charts via the new `group` config + `connect(groupId)`.
- **`initOptions` passthrough** to `core.init` (`useDirtyRect`, `useCoarsePointer`, `pointerSize`, …) and full `SetOptionOpts` on reactive updates (adds `silent`, `transition`).
- **`autoresize: boolean | { throttle }`** — opt out of the ResizeObserver or throttle resize storms (default unchanged: on, unthrottled).
- **Cached-modules synchronous mount fast path**: once the needed ECharts modules are cached (2nd..Nth chart), the instance is created in the same task — no wrapper-imposed microtask delay (no blank-frame flicker). First mounts keep the lazy-load path.
- New tests: theme-swap semantics (5 specs), GC-observable dispose-leak lock (WeakRef + --expose-gc), autoresize config, sync-mount fast path.
