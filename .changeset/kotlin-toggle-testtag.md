---
'@pyreon/native-compiler': patch
---

Fix `emitKotlinToggle` silently dropping `data-testid` — the `<Link>` bug's
Toggle sibling. The special-case emitter returned before the generic modifier
tail, so a `<Toggle data-testid>` emitted a Compose `Switch` with no
`Modifier.testTag`, making the element unselectable by `onNodeWithTag` at
all (the Swift half already chained its modifiers). A Toggle without
`data-testid` emits byte-identically to before. The kotlinc validate stub's
`Switch` also gains the `modifier` param the real Material signature has —
its absence made the stub a subset that rejected the corrected (valid) emit.

Device-bisect-verified on a real emulator: reverting the emit makes the new
Compose instrumented assertion fail with `could not find … TestTag =
'core-toggle'`; restored, counter-android runs 19/19.
