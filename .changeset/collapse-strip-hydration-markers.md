---
'@pyreon/vite-plugin': patch
---

Rocketstyle-collapse resolver: strip the SSR renderer's `<!--$-->…<!--/$-->` hydration range markers from the captured HTML before baking the `_rsCollapse` template. A collapse bake is a static cloneNode template that is never range-hydrated — the markers would be dead comment nodes cloned into every mount.
