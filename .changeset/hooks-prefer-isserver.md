---
'@pyreon/hooks': patch
'@pyreon/dnd': patch
---

Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`.

- **@pyreon/hooks** (7 sites): `useWindowResize`, `useBreakpoint`, `useScrollLock`, `useIsomorphicLayoutEffect`, `useInfiniteScroll`.
- **@pyreon/dnd** (5 sites): the SSR-guard early-returns in `useDraggable`, `useDroppable`, `useSortable`, `useFileDrop`, `useDragMonitor`.

Behavior is identical — `isServer`/`isClient` are defined as `typeof document {===,!==} 'undefined'` — but the framework now uses its own primitive instead of dogfooding the pattern its own lint rule (`pyreon/prefer-isserver`) flags. No public API change.
