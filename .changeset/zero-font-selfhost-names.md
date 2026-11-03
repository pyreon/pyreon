---
'@pyreon/zero': patch
---

Self-hosted Google Fonts no longer collide or 404 when Google serves a dynamically subset file. Files at `fonts.gstatic.com/l/font?kit=…` used to be saved under the bare name `font`: several of them overwrote each other, and with no extension a static host routed `/assets/fonts/font` to a 404. Such files now get a content-hash name with the extension read from the font bytes; normal `*.woff2` names are unchanged. Each font file is also downloaded once instead of once per weight that shares it.
