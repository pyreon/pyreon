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
