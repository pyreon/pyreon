---
'@pyreon/native-compiler': patch
---

Type a file-scope binding as a receiver. `const NAMES = ['a', 'b']` above a component typed `unknown` inside it, so every receiver-typed lowering skipped it: `NAMES.indexOf('b', 1)` and `GREETING.toUpperCase('tr')` re-emitted verbatim (neither exists on iOS or Android) with no warning, `GREETING.length` counted grapheme clusters on iOS instead of UTF-16 units, and a computed over one annotated `Any`. File-scope `const`/`let` bindings are now typed once per file — the annotation when written, otherwise the initializer's inferred type — and looked up after every narrower binding, so a local or component value of the same name still shadows them. An object literal is left untyped, since its value is a synthesized struct.

An annotated file-scope `const RATE: number = 0.5` is now declared `Double`; it was `Int = 0.5`, which neither target accepts.

The out-of-range timeline step message now names where the index came from — `option.timeline.currentIndex` (or `option.baseOption.timeline.currentIndex`) — instead of always saying `timelineIndex`.
