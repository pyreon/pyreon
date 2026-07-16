---
'@pyreon/attrs': patch
---

Fix dev-mode `data-attrs` attachment freezing every reactive prop: the debug attribute was merged with an object spread (`{ ...filteredProps, 'data-attrs': name }`), which fires compiler-emitted getter props once and collapses them to static snapshots — so attrs-wrapped components had live props in production but dead props in dev/test. The merge now copies descriptors via `mergeProps` from `@pyreon/core`, making dev behavior identical to production plus the debug attribute.
