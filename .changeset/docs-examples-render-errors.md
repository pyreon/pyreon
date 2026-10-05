---
"@pyreon/zero-content": patch
"@pyreon/zero": patch
"@pyreon/router": patch
"@pyreon/compiler": patch
---

Show a visible error when a loaded Example component fails to render, and keep sibling examples interactive.

Mark generated static 404 pages so the client mounts the requested route instead of hydrating a fallback from a different route. This prevents duplicated 404 content and stale fallback loader data on catch-all and dynamic routes.

Render the first resolved loader data for leaf routes without a pending component. Preserve the pending component's minimum display interval when configured.

Add a diagnostic explaining first-loader data that remains empty on affected router versions, including the upgrade path.
