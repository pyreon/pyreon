---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Lower the public `Flow` `colorMode` prop to the SwiftUI and Compose hosts. Forced light and dark modes now override the native Flow subtree while `system` follows the device appearance, matching the web host's theme selection.
