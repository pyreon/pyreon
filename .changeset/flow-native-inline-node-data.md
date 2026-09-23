---
'@pyreon/native-compiler': patch
---

A custom Flow node typed with an inline data shape, `NodeComponentProps<{ label: string }>`, now compiles on iOS and Android. It previously produced zero warnings and failed to compile on both: Swift typed `data()` as `String`, and Kotlin synthesized a class unrelated to the struct the flow's node literal used. One struct is now declared per distinct inline shape (nested objects included) and shared by the renderer and the flow. `<NodeResizer nodeId>` naming a node other than the one it is rendered in now warns, instead of silently resizing the host node natively.
