---
'@pyreon/runtime-server': patch
---

SSR: `<style>` and `<script>` text inside `<svg>` / `<math>` can no longer open a tag. Raw text is only raw in the HTML namespace; in foreign content the parser tokenizes it as markup. Style text now escapes every tag-opening `<` as the CSS escape `\3c ` (same stylesheet meaning, inert in every namespace), and script text inside SVG/MathML is entity-escaped (the parser decodes it back to the same source there).
