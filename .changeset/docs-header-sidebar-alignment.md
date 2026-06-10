---
'@pyreon/docs': patch
---

Docs page header now uses the `docs-shell` grid columns (`280px 1fr auto`) so the brand logo sits ABOVE the sidebar column with `padding-left: 1.25rem` matching the sidebar's left padding. The brand visually anchors the sidebar instead of floating at the centered 1240px container edge. Landing page header behavior unchanged — keeps the centered max-width 1240px layout aligned with `.px-landing`. Selector uses `.docs-shell:has(.docs-aside)` to gate on the docs context (sidebar rendered) so non-docs pages keep their existing layout. Mobile (≤920px) reverts to the standard centered-container layout since the sidebar becomes an off-canvas drawer.
