---
'@pyreon/testing': minor
---

`renderWithRouter` now creates a `'memory'` router by default, started at `route`, so a test's navigation never reads or writes the page URL and cannot leak into the next test through `location`. `mode` is typed from `createRouter`'s own option and accepts `'memory'`. Breaking for a test that asserted `window.location.hash` after `navigate()` with the old `'hash'` default: pass `mode: 'hash'`.
