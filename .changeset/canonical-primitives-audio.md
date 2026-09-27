---
'@pyreon/native-compiler': patch
'@pyreon/primitives': patch
'@pyreon/cli': patch
'@pyreon/lint': patch
'@pyreon/mcp': patch
---

`<Audio>` is now a member of the compiler's canonical primitive set. It was lowered on both targets but missing from `CANONICAL_PRIMITIVES`, so an `<Audio>` the emitter could not read (a non-literal `src`) fell through to generic emit with no warning, while the same `<Video>` warned. A new test checks that the set matches `@pyreon/primitives`' exports, and the per-primitive typecheck suite now compiles `<Audio>` and `<Video>` too (it had pinned the count at 15).

Docs: the primitive count, which had drifted to 15, 16 and 18 in different places while the package exports 17, is corrected everywhere and now checked by `check-doc-claims`. The primitives manifest fixes `<Scroll>`'s prop name (`axis`, not `direction`) and the `<Link>`, `<Layer>` and `<Modal>` descriptions, and notes that `justify`/`wrap` and `<Link external>` are ignored on iOS and Android. The `prefer-canonical-primitive` lint message no longer quotes a count.
