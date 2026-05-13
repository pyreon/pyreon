---
'@pyreon/storage': patch
---

Fix `useStorage` / `useSessionStorage` / `useCookie` / `useMemoryStorage` / `useIndexedDB` post-hydration rendering. Storage signals delegate `.direct` / `.subscribe` / `.peek` to a base signal but never forwarded the internal `_v` field that the compiler-emitted `_bindText` fast path reads. Result: JSX `<strong>{() => theme()}</strong>` rendered `<strong>light</strong>` correctly during SSR but the strong went empty post-hydration and stayed empty even after `.set()` calls — localStorage was updated, the DOM was not. Now forwards `_v` via getter so the fast path reads the live value from the underlying signal on every read. Bisect-verified at unit (6 specs) and real-Chromium e2e (4 specs).
