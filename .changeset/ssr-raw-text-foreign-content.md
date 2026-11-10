---
'@pyreon/runtime-server': patch
'@pyreon/compiler': patch
---

SSR: `<script>` and `<style>` text is escaped for the namespace the HTML parser will actually be in. Raw text is only raw in the HTML namespace; inside `<svg>` / `<math>` the parser tokenizes it as markup and decodes entities, so there both are now entity-escaped (which round-trips exactly). The renderer tracks the namespace through the tree — `<svg>`, `<math>` and `<foreignObject>` (back to HTML only from SVG), compared case-insensitively — and the compiled `ssrTemplate` path passes each child hole under a baked `<svg>` / `<math>` / `<foreignObject>` the path of those tags (`_escSole(x, "s")`), in both compiler backends. In the HTML namespace, a `<script>` also neutralises the end tag of an enclosing raw-text or RCDATA element (`</noscript`, `</textarea`, `</title`, `</iframe`, `</noembed`, `</noframes`, `</xmp`), and `<style>` escapes every tag-opening `<` as the CSS escape `\3c `.
