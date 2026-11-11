---
'@pyreon/server': patch
---

An island with `hydrate: 'visible'` (or `prefetch: 'visible'`) now hydrates when its `<pyreon-island>` element is styled `display: contents`. Such an element generates no box, so an IntersectionObserver never reported it as intersecting and the island stayed server HTML forever. The observer now watches the island's element children when the island itself has no box.
