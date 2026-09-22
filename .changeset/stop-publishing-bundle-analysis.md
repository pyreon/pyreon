---
'@pyreon/a11y': patch
'@pyreon/atlas': patch
'@pyreon/charts': patch
'@pyreon/cli': patch
'@pyreon/code': patch
'@pyreon/compiler': patch
'@pyreon/config': patch
'@pyreon/core': patch
'@pyreon/create-multiplatform': patch
'@pyreon/dnd': patch
'@pyreon/document': patch
'@pyreon/feature': patch
'@pyreon/flow': patch
'@pyreon/form': patch
'@pyreon/head': patch
'@pyreon/hotkeys': patch
'@pyreon/http': patch
'@pyreon/i18n': patch
'@pyreon/lathe': patch
'@pyreon/lint': patch
'@pyreon/loom': patch
'@pyreon/machine': patch
'@pyreon/mcp': patch
'@pyreon/native-cli': patch
'@pyreon/native-compiler': patch
'@pyreon/permissions': patch
'@pyreon/preact-compat': patch
'@pyreon/primitives': patch
'@pyreon/query': patch
'@pyreon/react-compat': patch
'@pyreon/reactivity': patch
'@pyreon/rich-text': patch
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
'@pyreon/rx': patch
'@pyreon/server': patch
'@pyreon/sized-map': patch
'@pyreon/solid-compat': patch
'@pyreon/state-tree': patch
'@pyreon/storage': patch
'@pyreon/store': patch
'@pyreon/storybook': patch
'@pyreon/svelte-compat': patch
'@pyreon/sync': patch
'@pyreon/table': patch
'@pyreon/testing': patch
'@pyreon/toast': patch
'@pyreon/url-state': patch
'@pyreon/validate': patch
'@pyreon/validation': patch
'@pyreon/virtual': patch
'@pyreon/vite-plugin': patch
'@pyreon/vue-compat': patch
---

Stop publishing the build's bundle-analysis report.

`vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
54 packages published it: every install downloaded a build report (258 KB for
`@pyreon/charts`) that is not part of the package. Their `files` now exclude
`lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
must exclude the report, and the live `npm pack --dry-run` probe fails if the
tarball carries one.
