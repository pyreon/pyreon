---
'@pyreon/zero': patch
---

Fix route-group special files being silently clobbered: `(group)/_layout.tsx` (and `_error` / `_loading` / `_404` inside groups) landed on the same route-tree node as the parent directory's specials because `parseFilePath` stripped `(group)` segments from `dirPath` — the group layout rendered nothing (RouterView → RouterView → page, no layout DOM). Group segments now survive in the tree key while staying URL-invisible, sibling groups are fully isolated, `placeRoute` warns loudly on any same-slot overwrite, and i18n `prefix-except-default` now duplicates group layouts per locale (root-ness is keyed on `dirPath === ''`, not `urlPath === '/'`).
