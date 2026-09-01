---
'@pyreon/native-compiler': minor
---

PMTC: annotated arrow parameters carry their types into the emit — `(p: Pt) => …` now emits the Swift typed closure form `{ (p: Pt) -> … in }` and the Kotlin typed lambda `{ p: Pt -> … }` when every parameter is annotated AND the arrow is a standalone let-bound closure (callback arguments keep the bare form — the call site supplies inference, and a typed form there can disagree with the receiver's element type), resolving the swiftc "cannot infer closure parameter type" class on callback-taking engine code. The block-body arrow constructor previously dropped the annotation (single-expression arrows kept it), so a multi-statement annotated callback silently lost its types.
