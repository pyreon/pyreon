---
'@pyreon/native-compiler': minor
---

Warn when an object literal cannot be given a synthesized struct, instead of
silently emitting a tuple that is broken on both targets.

An object literal whose fields cannot all be typed falls back to a TUPLE, and
the two targets then fail differently — which is what kept the whole class
hidden:

- **Kotlin** emits `(id = "a", parent = null)` — named arguments with no
  constructor. Not valid Kotlin; the Gradle build dies on it.
- **Swift** emits `(id: "a", parent: nil)` typed `Any` — a labelled tuple, which
  **compiles**. Tuples are not `Codable`, so `PyreonJSON.encode` and a
  `<WebView data=>` push silently produce the wrong bytes at runtime. (A
  single-field labelled tuple does not compile at all.)

Six ordinary data-model shapes hit this with no diagnostic: an empty array
field, a `null` or `undefined` field, a nested empty array, a mixed-type array,
and an array of arrays. `{ id, parent: null }` is a tree node; `{ nodes, edges:
[] }` is a graph with no edges yet.

The warning lives at the bail site rather than pattern-matching shapes, so it
covers the class — including shapes nobody has hit yet — and names the field and
the reason. The remedy it gives is verified rather than suggested: annotating
the declaration (`signal<Shape>({ … })`, `const x: Shape = { … }`) already
lowers to a real struct on both targets, and a spec asserts it still does.

`<WebView data={…}>` with an object or array literal now lowers to JSON
directly. The value goes straight to `PyreonJSON.encode`, so a literal in that
position *is* JSON — routing it through struct synthesis was a detour that
failed on exactly the payloads JSON exists to carry. Static parts become JSON
text at compile time and runtime parts are interpolated, so live data still
flows; a non-literal value keeps the plain `encode(expr)` form.

This is what `examples/native-viz`, the `@pyreon/charts` webview example, needed:
an ECharts option object has heterogeneous nesting and empty objects, so no
struct existed for it and the Android build died on `cannot infer type for type
parameter 'T'`. It now compiles.

A literal that OMITS an optional field now constructs the declared struct
instead of a synthesized one. Both emitters indexed declared structs by their
exact sorted field-name set, so `type T = { a: string; b?: string }` with
`{ a: 'x' }` missed and fell through to synthesis — Swift then wrote
`var v: T = __Obj0(a: "x")` and refused to build, while Kotlin inferred
`__Obj0` and compiled with the wrong type, so `encode` serialized the wrong
shape. Ambiguity (two declared structs both accepting the literal) bails rather
than guessing.

The Swift validation stubs gain `accessibilityAddTraits` / `AccessibilityTraits`
and `Font.system(size:weight:design:)`, all of which real SwiftUI has and the
stub did not — so `examples/native-router-demo-ios` failed the type gate while
building fine on a device. Every shipped `native-*` example now compiles on both
targets, and a discovered (not listed) test keeps it that way.
