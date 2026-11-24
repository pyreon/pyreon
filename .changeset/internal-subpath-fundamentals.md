---
'@pyreon/primitives': minor
'@pyreon/solid-compat': minor
'@pyreon/vite-plugin': minor
'@pyreon/lint': minor
'@pyreon/store': minor
'@pyreon/i18n': minor
'@pyreon/command': minor
'@pyreon/state-tree': minor
'@pyreon/http': minor
'@pyreon/storage': minor
'@pyreon/document': minor
'@pyreon/ambient': minor
'@pyreon/hotkeys': minor
'@pyreon/toast': minor
'@pyreon/testing': patch
'@pyreon/format': patch
---

BREAKING: `_`-prefixed test and internal helpers are no longer exported from the public entries. Each of these packages now has an `./internal` subpath that holds them. `./internal` is not public API and carries no semver promise (see "What counts as public API" on the stability page).

Moved exports, with their new specifier:

- `@pyreon/primitives`: `_resetNativeModules` → `@pyreon/primitives/internal`
- `@pyreon/solid-compat`: `_STORE_SIGNAL_CACHE` → `@pyreon/solid-compat/internal`
- `@pyreon/vite-plugin`: `_collectImportedNames`, `_compatAliasTable`, `_computeLineStarts`, `_extractBalancedArgs`, `_getCompatTarget`, `_handleSsrRequest`, `_isPyreonWorkspaceFile`, `_isTruthyEnv`, `_isUnaliasedFrameworkImport`, `_maskComments`, `_maskCommentsAndStrings`, `_maskStringsAndComments`, `_offsetToLineCol`, `_reactiveCalleeStarts`, `_requestUrlFromTarget`, `_skipStringLiteral`, `_unaliasedImportWarning` → `@pyreon/vite-plugin/internal`
- `@pyreon/lint`: `_workerEntry` → `@pyreon/lint/internal` (the parallel driver still finds its worker through the `./lint-worker` export)
- `@pyreon/store`: `__clearStoreHydrationForTesting` → `@pyreon/store/internal`
- `@pyreon/store/devtools`: `_notifyChange` → `@pyreon/store/internal`
- `@pyreon/i18n/devtools`: `_resetDevtools` → `@pyreon/i18n/internal`
- `@pyreon/state-tree/devtools`: `_resetDevtools` → `@pyreon/state-tree/internal`
- `@pyreon/command`: `_resetDefaultCommands` → `@pyreon/command/internal`
- `@pyreon/http/server`: `_resetRequestSource` → `@pyreon/http/internal`
- `@pyreon/http/json`: `_setSourceTextSupport` → `@pyreon/http/internal`
- `@pyreon/storage`: `_resetDBCache`, `_resetRegistry`, `_resetStorageListener` → `@pyreon/storage/internal`
- `@pyreon/document`: `_resetRenderers` → `@pyreon/document/internal`
- `@pyreon/hotkeys`: `_resetHotkeys` → `@pyreon/hotkeys/internal`
- `@pyreon/toast`: `_reset`, `_toasts` → `@pyreon/toast/internal`. In tests, use `clearToasts`, `getToasts`, `expectToast` and `findToast` from `@pyreon/testing/toast` instead.
- `@pyreon/ambient/testing`: `_fireAll`, `_tickerStats` → `@pyreon/ambient/internal`

`@pyreon/ambient/testing` stays the supported test kit, and its two documented hooks lose the underscore: `_resetClockState` → `resetClockState` and `_resetLocaleState` → `resetLocaleState`, both still from `@pyreon/ambient/testing`.

`@pyreon/testing/toast` now reads the toast store through `@pyreon/toast/internal`; its own API is unchanged. `@pyreon/format` follows the ambient rename internally; its API is unchanged.

Upgrade: codemod internal-exports-subpath
