---
'@pyreon/router': patch
---

A memory router no longer claims the global route-HMR hook (`globalThis.__pyreon_hmr_swap__`). Its routes are not the page's (a component workbench's preview, an embedded widget), and creating one after the page's router took route-component HMR away from the page: every edit fell back to a full reload.
