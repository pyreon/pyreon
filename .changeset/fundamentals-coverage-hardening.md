---
'@pyreon/state-tree': patch
---

Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
defensive guards (deepMerge's non-plain-input safety net, the plain-mode
`config.state ?? {}` fallback that `model()` rejects upstream, the
`snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
`applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
