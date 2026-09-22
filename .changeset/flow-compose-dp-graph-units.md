---
"@pyreon/flow": patch
---

The Compose flow renderer now measures graph and viewport units in dp, the way the SwiftUI renderer uses points and the web uses CSS px. It used device pixels, so a 150-unit node was only ~57dp wide on a 420dpi phone, and its 48dp resizer hit targets covered the whole node: a tap on the node landed on a resizer and never selected it. Node sizes, handles, resizers, reconnect controls, edge labels, toolbars, the edge canvas, the background pattern and the minimap all convert through the density at the view boundary; the engine is unchanged.
