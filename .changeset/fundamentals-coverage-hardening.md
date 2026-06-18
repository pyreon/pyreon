---
'@pyreon/state-tree': patch
'@pyreon/validation': patch
'@pyreon/validate': patch
'@pyreon/toast': patch
'@pyreon/storage': patch
'@pyreon/sync': patch
'@pyreon/dnd': patch
'@pyreon/document': patch
'@pyreon/flow': patch
'@pyreon/form': patch
'@pyreon/table': patch
'@pyreon/hotkeys': patch
'@pyreon/hooks': patch
'@pyreon/charts': patch
---

Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
defensive guards (deepMerge's non-plain-input safety net, the plain-mode
`config.state ?? {}` fallback that `model()` rejects upstream, the
`snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
`applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
