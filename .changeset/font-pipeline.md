---
'@pyreon/primitives': minor
---

Custom fonts in the multiplatform asset pipeline: `<Text font="Name">` / `<Heading font="Name">` render a bundled `.ttf`/`.otf` from the shared `assets/` dir. iOS bakes the font's PostScript name (read from the sfnt name table — `Font.custom` rejects the filename and silently falls back otherwise); Android resolves `res/font` at runtime; web sets `font-family`.
