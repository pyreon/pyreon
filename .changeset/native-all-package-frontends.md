---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': patch
'@pyreon/a11y': patch
'@pyreon/attrs': patch
'@pyreon/charts': patch
'@pyreon/coolgrid': patch
'@pyreon/core': patch
'@pyreon/dnd': patch
'@pyreon/elements': patch
'@pyreon/feature': patch
'@pyreon/flow': patch
'@pyreon/form': patch
'@pyreon/hooks': patch
'@pyreon/hotkeys': patch
'@pyreon/http': patch
'@pyreon/i18n': patch
'@pyreon/kinetic': patch
'@pyreon/kinetic-presets': patch
'@pyreon/machine': patch
'@pyreon/permissions': patch
'@pyreon/primitives': patch
'@pyreon/query': patch
'@pyreon/reactivity': patch
'@pyreon/rocketstyle': patch
'@pyreon/router': patch
'@pyreon/rx': patch
'@pyreon/sized-map': patch
'@pyreon/state-tree': patch
'@pyreon/storage': patch
'@pyreon/store': patch
'@pyreon/styler': patch
'@pyreon/sync': patch
'@pyreon/table': patch
'@pyreon/toast': patch
'@pyreon/ui-core': patch
'@pyreon/url-state': patch
'@pyreon/validate': patch
'@pyreon/validation': patch
---

Complete package-owned native compilation with optional plugins for reactivity, attrs, styler, rocketstyle and kinetic-presets. Factory recognition and native rewrites live in their owning packages; generic state, JSX, theme and style operations remain shared compiler services. The CLI discovers each package independently, and the multiplatform contract gate requires a published plugin for every package that advertises native lowering.

Programmatic native compilation must load the owning package plugins. Style factory definitions now use generic module items instead of the former styledComponents, rocketstyleComponents and attrsComponents parse-result arrays. Reactivity aliases bind to core state operations, while the kinetic factory consumes the preset package's own imported vocabulary. Mark native compiler peers optional in a11y and sync so web consumers do not install compiler tooling.

Upgrade: update the compiler and package plugins together to the next minor release. Plugin descriptors must pin `apiVersion: 2`; API 1 (including old plugins importing the legacy runtime version constant) is rejected before compilation. Migrate style definition arrays to generic module items. The workspace fixed release group advances every optional compiler peer to the same minor.

Discover installed runtime and peer plugin dependencies without traversing dependency development tools. Plain Mode imports activate the reactivity owner before generated signal/computed imports are compiled.
