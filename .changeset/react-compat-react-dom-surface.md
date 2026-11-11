---
'@pyreon/react-compat': patch
---

`@pyreon/react-compat/dom`, the compat-mode target of both `react-dom` and `react-dom/client`, now exports React 19's public surface of both: `hydrateRoot`, `createPortal`, `flushSync`, `unstable_batchedUpdates`, `version`, the legacy `hydrate` / `unmountComponentAtNode` (and `render` now replaces a previous tree in the same container), and the resource hints `preconnect` / `prefetchDNS` / `preload` / `preloadModule` / `preinit` / `preinitModule`. `findDOMNode`, `useFormStatus` and `requestFormReset` throw a `[Pyreon]` error naming the replacement instead of failing as a missing import.
