---
'@pyreon/core': patch
'@pyreon/head': patch
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/a11y': patch
'@pyreon/form': patch
'@pyreon/i18n': patch
'@pyreon/permissions': patch
'@pyreon/query': patch
'@pyreon/toast': patch
'@pyreon/coolgrid': patch
'@pyreon/elements': patch
'@pyreon/rocketstyle': patch
'@pyreon/styler': patch
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
---

Whole-class bundle-size fix: every module-level `nativeCompat(X)` STATEMENT (28 sites across 16 packages) converted to the `/* @__PURE__ */` assignment form. Inside a built lib's shared chunk the bare statement is an unremovable side effect that retains the component's body in every consumer bundle that never imports it — measured ~1.2KB gz of dead transition machinery in a mount-only app from runtime-dom's three sites alone; the sweep applies the same fix to ErrorBoundary, HeadProvider, Router components, RouteAnnouncer, Form components, providers across i18n/permissions/query (6 sites)/toast's Toaster, and the ui-system providers. Marker semantics are unchanged (`nativeCompat` returns the same fn; live-probed and locked by the existing native-marker suites). Two new locks: a lib-level tree-shake spec (mount-only bundle must not contain transition machinery, with a positive control) and a repo-wide census guard that fails on any new bare statement.
