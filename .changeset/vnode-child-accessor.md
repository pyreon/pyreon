---
'@pyreon/core': patch
'@pyreon/toast': patch
---

A reactive accessor was legal as a SOLE child and rejected among MULTIPLE children.

```tsx
<Text>{count}</Text>          // ✅ sole child — hits the accessor arm
<Text>Count: {count}</Text>   // ❌ two children — hits the atoms-only arm
```

`VNodeChild`'s array arm was `VNodeChildAtom[]` — atoms only — so an accessor
could not appear alongside anything else. That is the most common reactive
pattern there is, and it failed on the canonical `@pyreon/primitives` while the
IDENTICAL shape on a DOM element compiled, because the JSX runtime already types
children as `VNodeChild | VNodeChild[]`.

`mountChild` has always mounted accessors anywhere in a children array. Only the
type disagreed, which is why nothing broke at runtime and nothing caught it.

FIXED AT THE ROOT, and the first attempt is worth recording because the failure
was the useful signal. Widening `ChildrenProp` in the primitives broke ELEVEN
internal `h()` call sites; that read like "the narrow type is load-bearing" but
actually meant "you are patching a symptom". Widening `VNodeChild` itself needed
ZERO call-site changes. 11 vs 0 is the tell.

Two honest consequences:

  - `VNodeChildAccessor`'s RETURN needed the same widening, or `suspense.ts`
    could not express its own children (`h(Fragment, null, () => …)`).
    Deliberately `() => VNodeChildAtom | VNodeChild[]` and NOT `() => VNodeChild`
    — the latter would also permit an accessor returning an accessor, which the
    runtime renders as a function rather than unwrapping.
  - `@pyreon/toast`'s `resolve` carried a comment asserting "a reactive child
    callback may not RETURN an accessor (it must yield an atom)". This change
    makes that untrue, so the type was widened to match and the comment
    corrected rather than cast past.

Blast radius measured, not assumed: the pre-fix run isolated every failure to
ONE real file (toaster.tsx) — the rest were downstream consumers reporting the
same line. Whole-monorepo typecheck is clean, `@pyreon/core` 625/625,
`@pyreon/toast` 130/130.

This clears 5 of the 8 remaining type errors in the flagship native counter
example, which is how the asymmetry was found.
