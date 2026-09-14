---
'@pyreon/native-compiler': patch
---

Seven real bugs found while raising branch coverage 82.65% -> 93.31%, all bisect-verified:

- A sparse array literal (`[1, , 2]`, valid TS) crashed the whole `transform()` with an uncaught `TypeError` and no filename or line. Lowered to the `undefined` identifier, matching how `undefined` is represented everywhere else in the parser.
- A computed object key (`{ [k]: v }`) in `parse-theme.ts` and `parse-rocketstyle.ts` was emitted under its VARIABLE NAME instead of being skipped, silently reading `k` as a literal theme/dimension key.
- An unresolvable `<Text>` `color`/`fontWeight`/`textAlign` value (`'rebeccapurple'`, `'ultralight'`, `'justify'`) was accepted and then silently dropped by the emitter with zero warning.
- A degenerate `'0 / N'` `aspectRatio` (zero or negative width) emitted a real `0` ratio, collapsing the view, instead of being rejected like the number and plain-string forms already are.
- `@pyreon/validate`'s wrapper-less `s` DSL could not lower ANY nested schema shape (`s.object({ addr: s.object({...}) })`, `s.array(s.object({...}))`) — a synthesized re-entry wrapper built an `Identifier` callee literally named `null` instead of the required `MemberExpression`, dropping the field and then the whole schema.
- A CSS template segment containing an escape oxc cannot interpret (`\2014`, the ordinary CSS em-dash) silently dropped every OTHER property declaration sharing that segment, because a `TemplateLiteral` splits into quasis only at interpolation boundaries.

Several further findings are locked as self-retiring `it.fails` specs naming the fix rather than papered over (a Swift-only value-const inliner substituting through a shadowing parameter; a nested-struct name-collision in the type-path registry; `swift-stubs.ts`/`kotlin-stubs.ts` missing real SDK members and rejecting emits that compile against the real toolchains) — tracked as follow-up work.
