---
'@pyreon/flow': patch
---

Fix: clicking the minimap did nothing in real (vite-plugin-compiled) apps.
`<MiniMap>` resolved its instance with a prop-derived `const`, which the
compiler inlines into the click handler — so at click time it re-ran
`useContext(FlowContext)` outside the setup frame, got `null` and threw.
The panel rendered fine, which is why every existing test passed.
