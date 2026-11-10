---
'@pyreon/lathe': patch
---

The `docs` plugin escapes spec text for Markdown and MDX alike. `@pyreon/zero-content` compiles `.md` as MDX, so a `{…}` or `<…>` in an OpenAPI title, tag, summary, parameter, media type or model description could become live JSX in the generated reference pages. Prose is now backslash-escaped, code spans and fences use a delimiter no value can close, and the generated marker moved into the frontmatter as a YAML comment, so the pages also compile as MDX at all (the HTML-comment marker made every page fail).
