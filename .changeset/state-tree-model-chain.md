---
'@pyreon/native-compiler': minor
'@pyreon/state-tree': patch
---

Lower `model().views().actions()` — `@pyreon/state-tree` was 1:1-inverted on native

The source that compiled natively was the source that is wrong on web, and the
canonical web source did not compile. Two halves, each independently broken.

**The chain.** The web API is a builder — `model({ state }).views(f).actions(f)
.create()`. The recognizer matched only the bare `model({ state }).create()`,
so every model with an action — that is, every model that can change — fell
through to a verbatim emit:

```swift
private let cart = model((state: __Obj0(count: 0)))
  .actions({ `self` in (__Obj1(increment: "")) }).create()
```

`model` exists on neither target, and the action became a `String` field.
Zero warnings on either target, so the failure surfaced as `cannot find 'model'
in scope` / `unresolved reference 'model'` inside generated code, naming
nothing about what was unsupported. A model with no actions cannot mutate its
own state, so the one shape that did lower was the shape a real model never has.

**The read.** A model's state field is a signal, so the web read is
`cart.total()`. That emitted `…shared.total()` — calling an `Int`. The only
form that compiled was `cart.total`, which on web renders the accessor function
rather than its value. The emit already lowered the *write*
(`cart.total.set(1)` → `total = 1`): it knew the field was a signal when
written and forgot when read.

Views now emit as computed properties (Swift `var doubled: Int { total * 2 }`,
Kotlin `val doubled get() = total * 2`), actions as methods, and member bodies
address state through the factory's `self` the same way a component body
addresses its props param. This mirrors `defineStore`, which had already solved
every hard part — the model recognizer simply stopped at state.

Two smaller fixes ride along, both consequences of the state seed having been
stored as a raw literal plus a three-value type tag rather than the `TypeIR` /
`ExprIR` the store uses: a fractional seed (`{ total: 2.5 }`) emitted
`var total: Int = 2.5`, and an unsupported builder step now declines by name
instead of falling through to the verbatim emit.

Still deferred, and still declining loudly: `.asHook()`,
`.create(initialOverride)`, the two-step `const M = model(...); M.create()`
form, `getSnapshot` / `onPatch`, and nested field-models. The emitted model is
a singleton, so multiple instances of one definition remain out of scope — the
two-step form is the only way to reach them, and it declines.

The web arm that measures the semantics the emit mirrors lives in
`@pyreon/state-tree`'s `native-parity.test.ts`; the native specs compile
through real `swiftc` and `kotlinc`.
