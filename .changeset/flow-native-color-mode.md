---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Close native Flow host and chrome parity gaps. `colorMode` now reaches SwiftUI and Compose, reactive Background/Controls/MiniMap props no longer silently fall back to defaults, standalone `<Controls instance={flow}>` lowers with functional lock state and child content, and the exported `FlowProps` type cannot drift from the component's canonical props.
