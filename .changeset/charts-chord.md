---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

Adds `<ChordChart>` — flows between categories as ribbons across a circle.

It takes sankey's `{ nodes, links }` verbatim, so moving a spec between the two
is a one-word edit. The difference is what the layout encodes: a sankey lays
flows on an axis, so it reads a direction and wants an acyclic graph; a chord
closes the circle and drops both, which makes a flow that goes BOTH ways
(imports and exports, migration between regions, a confusion matrix) its
ordinary case rather than its awkward one.

Lowers to SwiftUI and Jetpack Compose like its neighbours, compile-proven on
both real toolchains.
