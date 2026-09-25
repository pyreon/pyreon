---
'@pyreon/styler': patch
'@pyreon/runtime-server': patch
'@pyreon/unistyle': patch
'@pyreon/rocketstyle': patch
'@pyreon/zero': patch
---

String-mode SSR no longer leaks CSS between requests. The styler's server rule buffer was never reset, so a page's `<style>` carried every rule an earlier request had inserted (ssr-showcase `/posts/1`: 2,850 B, then 12,710 B after one `/sections` request), and prerendered page CSS depended on prerender order. `runWithRequestContext` is now a styler request scope, render sites that hand out a cached class mark it used (`sheet.markUsed`), and module-level `keyframes` / static `createGlobalStyle` rules are emitted to every request. `ssg.cssMode: 'asset'` now writes one file per distinct rule set instead of linking every page to the first page's CSS.
