---
'@pyreon/native-compiler': patch
---

Fix two PMTC emit bugs that made `<Modal>` non-functional and `<Link>`
unassertable on iOS, and close the capability matrix's Core-UI row.

Both bugs emitted **valid Swift that `swiftc -typecheck`ed clean**, which is
exactly the class R1-R3 cannot see. They were found by the established method —
write the code an author would actually write, then run it on a device.

**`<Modal>` never presented on iOS.** The emit anchored `.sheet(isPresented:)`
to an `EmptyView()` host. `EmptyView` contributes nothing to the render tree, so
there is no view for SwiftUI to attach the presentation to and the modifier is
silently inert. An XCUITest accessibility dump after tapping the open button
showed no sheet, no dialog and no modal body anywhere in the hierarchy. Now
anchored to a zero-sized `Color.clear`, which is a real view and therefore a
valid presentation anchor, with `.frame(width: 0, height: 0)` keeping it
layout-neutral so no surrounding stack shifts.

This was iOS-only. Compose reaches `<Modal>` by a different mechanism —
`if (open) { Dialog(onDismissRequest = …) { … } }`, a conditionally-composed
real node with no anchoring requirement — so the Kotlin emit was already correct
and is unchanged. Same family as the documented `<Inline>` asymmetry (a
shrinking SwiftUI HStack vs a non-wrapping Compose Row): when the two targets
reach a primitive through different mechanisms, only a per-target device check
settles it.

**`<Link>` dropped its `data-testid`.** `<Link>` is a special-case emitter that
builds `PyreonLink(...) { ... }` and returns BEFORE the generic modifier tail
where `data-testid` becomes `.accessibilityIdentifier` / `Modifier.testTag`. The
identifier was silently discarded, so the element could not be selected by
XCUITest or `onNodeWithTag` at all — it was structurally *unassertable*, which is
the likeliest reason it sat in the matrix's "not individually asserted" list. You
cannot assert on an element you cannot select. Fixed on both backends; Swift also
emits `.accessibilityElement(children: .contain)` because `PyreonLink` wraps its
label and SwiftUI flattens a plain wrapper out of the accessibility tree (the
same trap already documented for `VStack`/`ScrollView`). `.contain` rather than
`.combine` keeps the child label individually queryable. A Link with no
`data-testid` emits byte-identically to before.

**Core-UI row closed (0.8 → 0.95, +1.5 weighted points, ≈52% → ≈54%).** The four
primitives the row itself named as gaps — Modal/Toggle/Scroll/Link — are now
device-asserted on a real simulator: Toggle flips an observable text, Modal
presents and dismisses a sheet body, Scroll's container is queryable with its
child still individually queryable, and Link navigates through `PyreonLink`. The
row keeps 0.05 rather than claiming 1.0: `Layer`/`Spacer`/`Heading` have no
dedicated behavioural assertion, and the four new assertions are iOS-only (the
Compose halves emit and typecheck; the Android device assertions are follow-ups).

Bisect-verified at the device layer, both fixes, with restore: reverting the
Modal host to `EmptyView()` failed `test_modalPresentsAndDismisses`; reverting
the Link identifier emit failed `test_linkNavigatesToAbout`; restored, both pass.
Full suites green — counter-ios 22 tests / 0 failures, router-demo-ios 4 / 0.
