---
'@pyreon/native-compiler': patch
---

A Pyreon hook with no native lowering emitted uncompilable code, silently.

The parser lowers 28 hooks. Anything else imported from a `@pyreon/*` package
and called as `useX()` fell through to the generic `const x = <call>` emit,
which reproduces the call verbatim:

    const items = useFieldArray('tags')
    →  let items = useFieldArray("tags")      // cannot find … in scope

There is no `useFieldArray` in the Swift or Kotlin runtime, so the native build
fails — and nothing warned. 38 of the 52 hooks `@pyreon/hooks` and
`@pyreon/form` export behave this way (`useFieldArray`, `useToggle`,
`useElementSize`, `useMediaQuery`, `useWatch`, …), so the first sign of trouble
was a device build failing, or nothing at all for an app nobody type-checked.

Now warned per hook, on both targets, naming the hook, its package, the exact
error it would otherwise produce, and three ways out (a `<Web>` escape hatch, a
hook that IS lowered, or hand-rolling from signals).

Deliberately a warning rather than 38 lowerings: implementing `useElementSize`
on SwiftUI is a different project, while telling the author it will not work is
a compile away — and the PMTC arc's stated direction is that failure outside the
supported subset should be a NAMED warning, not a silent drop.

Scoped to `@pyreon/*` imports: a user's own `useThing()` is ordinary code the
compiler may handle, and warning about it would be noise. The lowered set is
declared in one place (`NATIVE_LOWERED_HOOKS`) so its complement is nameable,
with a drift test asserting every entry is genuinely referenced by the parser —
an entry that stopped being handled would silently stop warning.
