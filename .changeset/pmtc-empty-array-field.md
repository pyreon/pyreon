---
'@pyreon/native-compiler': minor
---

Warn on an un-annotated object literal with an empty array field, instead of
emitting something structurally wrong on both targets.

`const g = signal({ nodes: [{ id: 'a' }], edges: [] })` cannot be given a
synthesized struct: an empty array literal carries no element type, and guessing
one would be contradicted by the first non-empty assignment. The emit fell back
to a tuple, and the two targets then failed differently — which is what kept
this hidden:

- **Kotlin** emitted `(nodes = listOf(...), edges = listOf())` — named arguments
  with no constructor. Not valid Kotlin; the Gradle build dies on it.
- **Swift** emitted `(nodes: [...], edges: [])` typed `Any` — a labelled tuple,
  which **compiles**. Tuples are not `Codable`, so `PyreonJSON.encode` and a
  `<WebView data=>` push silently produce the wrong bytes at runtime. Compiling
  and being wrong is worse than not compiling.

The warning names the offending field and gives a remedy that is verified rather
than suggested: annotating the declaration (`signal<Graph>({ … })` or
`const g: Graph = { … }`) already lowers correctly today — the annotation
supplies the element type and both targets emit a real
`Graph(nodes = …, edges = listOf())`. Seeding the array with one element works
too. A test asserts the remedy still lowers to a struct, so the message cannot
start recommending something that no longer works.
