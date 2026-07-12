---
'@pyreon/hooks': minor
'@pyreon/mcp': patch
---

`@pyreon/hooks` excellence pass — 4 new hooks (36 → 40) + doc/impl drift eliminated.

**New hooks** (each SSR-safe, self-cleaning, tested — happy-dom + true-node SSR arms):

- **`useCounter(initial?, { min?, max? })`** — reactive numeric counter (`inc`/`dec`/`set`/`reset`), min/max clamping. The numeric companion to `useToggle`. Zero wrapper overhead over a raw signal, and the fastest counter primitive measured (1.36–1.62× vs Solid `createSignal` / Preact signals — see the new `bench:hooks`).
- **`useWindowScroll()`** — reactive `{ x, y }` scroll offset (passive listener) + SSR-safe `scrollTo`.
- **`useDocumentVisibility()`** — reactive Page Visibility (`'visible' | 'hidden'`) to pause work when the tab is hidden.
- **`useIdle(timeoutMs?, opts?)`** — reactive user-idle detection; flips back on the next activity event.

**Drift eliminated** — the shipped implementations were correct and consumer-validated, but the README + manifest + generated MCP `api-reference` had drifted to an aspirational, runtime-broken API. Docs now match the code:

- `useControllableState` — `defaultValue` is a PLAIN value (was documented as a getter, which wouldn't typecheck).
- `useEventListener` — signature is `(event, handler, options?, target?)` (was documented target-first); `target` is resolved once at setup (the "re-binds reactively" claim was false).
- `useFocusTrap` — signature is `(getEl)`; it is ref-gated (inert while `getEl()` is null), with no `active` flag and no focus-return (that is the separate `useFocusReturn`).
- `useInfiniteScroll` — returns `{ ref, triggered }` with `{ threshold, loading, hasMore, direction }` options (was documented as `{ sentinelRef, isLoading }` / `{ rootMargin, enabled }`).
- `useClipboard` / `useDialog` — corrected return shapes (`copy` resolves `boolean`; `useDialog.open` is the state signal, openers are `show`/`showModal`).
- Stale "(planned)" lint-rule caveat replaced with the shipped `pyreon/no-raw-addeventlistener` / `pyreon/no-raw-setinterval` rules.

`useIsomorphicLayoutEffect` simplified (removed a no-op `isClient ? onMount : onMount` ternary — `onMount` is already isomorphic).
