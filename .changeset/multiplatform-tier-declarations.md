---
'@pyreon/compiler': patch
'@pyreon/core': patch
'@pyreon/head': patch
'@pyreon/primitives': patch
'@pyreon/reactivity': patch
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
'@pyreon/server': patch
'@pyreon/sized-map': patch
'@pyreon/a11y': patch
'@pyreon/charts': patch
'@pyreon/code': patch
'@pyreon/dnd': patch
'@pyreon/document': patch
'@pyreon/feature': patch
'@pyreon/flow': patch
'@pyreon/form': patch
'@pyreon/hooks': patch
'@pyreon/hotkeys': patch
'@pyreon/http': patch
'@pyreon/i18n': patch
'@pyreon/machine': patch
'@pyreon/permissions': patch
'@pyreon/query': patch
'@pyreon/rich-text': patch
'@pyreon/rx': patch
'@pyreon/state-tree': patch
'@pyreon/storage': patch
'@pyreon/store': patch
'@pyreon/sync': patch
'@pyreon/table': patch
'@pyreon/toast': patch
'@pyreon/url-state': patch
'@pyreon/validate': patch
'@pyreon/validation': patch
'@pyreon/virtual': patch
'@pyreon/atlas': patch
'@pyreon/lint': patch
'@pyreon/loom': patch
'@pyreon/mcp': patch
'@pyreon/testing': patch
'@pyreon/attrs': patch
'@pyreon/connector-document': patch
'@pyreon/coolgrid': patch
'@pyreon/document-primitives': patch
'@pyreon/elements': patch
'@pyreon/kinetic-presets': patch
'@pyreon/kinetic': patch
'@pyreon/rocketstyle': patch
'@pyreon/styler': patch
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
'@pyreon/zero-content': patch
'@pyreon/zero': patch
---

Every package manifest now declares its MULTIPLATFORM story as data:
`multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
(a discriminated union — `web-only` REQUIRES the rationale sentence). The
assignments transcribe the classification the multiplatform docs and the PMTC
compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
`check-multiplatform-tier` gate (validate-fast family) holds the contract:
a manifest without a tier, a published package with neither manifest nor
explicit exemption, a `web-only` without a rationale, or a stale generated
tier table all fail CI — so a new package can never again silently default
to web-only while the ecosystem advertises "one codebase, three targets".

No runtime change in any package: manifests are docs-pipeline inputs and are
stripped from published tarballs; every generated surface (llms, MCP
api-reference, reference pages) is byte-identical.
