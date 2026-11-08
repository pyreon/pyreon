---
'@pyreon/unistyle': patch
'@pyreon/elements': patch
'@pyreon/styler': patch
'@pyreon/ui-core': patch
---

Make theme-keyed style caches hit across `<PyreonUI>` mounts and Text mounts. `enrichTheme` is now memoized on the input theme object's identity (and returns an already-enriched theme unchanged), so a fresh `<PyreonUI>` with the same theme object — one per SSR request — reuses every rocketstyle, styler and unistyle cache instead of re-resolving each component once per request. `Text` now interns its `$text` style bundle and the styler's class cache keys on it, so warm Text mounts skip the CSS pipeline.
