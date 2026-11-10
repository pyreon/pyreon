---
'@pyreon/rich-text': patch
---

The engine-free serializer behind the pre-mount and server `editor.html()` now applies `isUnsafeUrl` to every link href it writes, so stored JSON content can no longer come back out as a live `javascript:` / `data:` link (the mounted TipTap Link extension already blanked these; the two paths now agree). The HTML importer (`htmlToJson`) judges the entity-decoded href and drops an unsafe link mark. Heading levels are clamped to 1–6.
