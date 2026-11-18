---
'@pyreon/flow': patch
---

`--pyreon-flow-*` overrides set on an ancestor now win in dark mode too. The dark palette was declared as the public variables on `.pyreon-flow` itself, and a value declared on an element beats one inherited from an ancestor, so a wrapper's override worked only in light mode. `flowStyles` now resolves each variable on the canvas element (your value if any ancestor or the element sets one, else the dark default) and hands the resolved value to everything inside it. Custom nodes and edges that read `var(--pyreon-flow-*)` still get the value in force.
