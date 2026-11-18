---
'@pyreon/loom': patch
---

`loom build --base <path>` output now works when served from that path. The base reached Vite but not zero, so the prerendered modulepreloads and the view tabs pointed at the site root. Served from the base, the chunks 404'd and the page was blank. The base now goes to zero as well, and the tabs are built from Vite's resolved base.
