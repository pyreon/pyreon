---
'@pyreon/native-compiler': patch
---

The flagship device-proven example used native-only idioms and a wrong import.

`examples/native-counter-ios/src/Counter.tsx` — the kitchen-sink example with 19
passing XCUITests — does not typecheck. Measured: 40 TypeScript errors. It
compiles for native anyway because PMTC matches component and hook NAMES and
never resolves imports, and this example is one of four with no typechecked web
sibling, so nothing caught any of it.

Four independent problems, all fixed here:

  - `onMount` was imported from `@pyreon/reactivity`, which does not export it;
    it lives in `@pyreon/core`. A second wrong import in the same file, the
    sibling of the `useDatabase`-from-`@pyreon/primitives` one.
  - `Button`, `Stack`, `Inline` and `Press` were used but never imported —
    33 of the 40 errors.
  - `<VStack>` is a SwiftUI name, not one of the 15 canonical primitives. It
    lowers correctly (`VStack` on Swift, `Column` on Kotlin) but has no web
    equivalent and is exported from nowhere, so its presence made the file
    native-only by construction.
  - `onClick` is not the canonical prop; the primitives take `onPress`.
    `ButtonProps` rejects `onClick` outright.

SAFE BY PROOF, not by inspection: the emitted Swift and Kotlin are BYTE-IDENTICAL
before and after, verified per target. Identical bytes cannot behave differently
on a device, so the 19 XCUITests cannot regress — and the full device suite was
run to confirm rather than assumed.

This takes the file from 40 errors to 8. The remainder are NOT example bugs and
are deliberately left:

  - `rocketstyle({ component })` is missing the required `name` (2).
  - `<Press onLongPress>` without `onPress`, which `PressProps` requires (1) —
    arguably too strict for a long-press-only target, but that is an API
    decision, not an example fix.
  - A reactive accessor among MULTIPLE children (5). That one is a framework
    type asymmetry, not this file's fault: the JSX runtime types children as
    `VNodeChild | VNodeChild[]`, while the primitives' `ChildrenProp` is bare
    `VNodeChild`, whose array arm is `VNodeChildAtom[]` — atoms only. So an
    accessor is legal as a SOLE child and rejected among multiple, making
    `<Text>Count: {count}</Text>` fail on the canonical primitives while the
    identical shape on a `<div>` compiles. Widening `ChildrenProp` to match the
    runtime was tried and REVERTED: it breaks 11 internal `h()` call sites in
    the primitives' own web implementations, so the narrow type is load-bearing
    there and this needs a considered change rather than a one-line widening.

The example is not yet typecheck-clean, and this change does not add a typecheck
script claiming it is. Giving `counter` / `finance` / `analytics` / `viz`
typechecked web siblings remains the gate that would have caught all of this at
author time.
