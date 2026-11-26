---
'@pyreon/router': patch
---

The dev warning for a plain internal `<a href>` now honours `data-allow-reload` on an ancestor as well as on the anchor, so a host can mark a region whose links are not the router's (embedded CMS markup, a component workbench's preview).
