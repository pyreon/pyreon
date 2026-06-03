---
"@pyreon/core": patch
"@pyreon/head": patch
"@pyreon/reactivity": patch
"@pyreon/router": patch
"@pyreon/runtime-dom": patch
"@pyreon/runtime-server": patch
"@pyreon/server": patch
"@pyreon/charts": patch
"@pyreon/dnd": patch
"@pyreon/document": patch
"@pyreon/form": patch
"@pyreon/hooks": patch
"@pyreon/hotkeys": patch
"@pyreon/i18n": patch
"@pyreon/state-tree": patch
"@pyreon/storage": patch
"@pyreon/store": patch
"@pyreon/toast": patch
"@pyreon/url-state": patch
"@pyreon/elements": patch
"@pyreon/rocketstyle": patch
"@pyreon/styler": patch
"@pyreon/ui-core": patch
"@pyreon/zero": patch
---

fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
with a hardcoded version literal that the release process never bumped — so the
duplicate-instance sentinel reported `0.24.6` for packages actually shipping
`0.28.x`. The version is diagnostic-only (detection keys on module location, not
version), but its diagnostic VALUE is exactly to surface a version skew between
two installed copies — which a frozen literal silently defeats.

Name + version are now derived from each package's own `package.json`
(`import { name, version } from '../package.json' with { type: 'json' }`), so the
diagnostic is always accurate and can never drift on release. The build inlines
the strings (no `package.json` bloat); dev reads the live file. No new tooling
needed — drift is structurally impossible.
