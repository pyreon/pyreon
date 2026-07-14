---
"@pyreon/document": patch
"@pyreon/mcp": patch
---

docs(document): document the 17 JSX primitives + the renderer extension API in the manifest — `Heading`, `Text`, `Table`, `List`/`ListItem`, `Code`, `Link`, `Image`, `Button`, the structural set (`Page`/`Section`/`Row`/`Column`/`Divider`/`Spacer`/`Quote`/`PageBreak`), and `registerRenderer`/`unregisterRenderer`/`isDocNode`. All signatures, defaults, and footguns are source-verified (Heading `level` defaults to 1; `ListItem` discards every prop except `children`; `Table` cells are scalar `string | number` with data in props not children; `Button` has no `onClick`/`variant` and requires `href`; `registerRenderer` silently overwrites; `isDocNode` is a structural-only guard; a plain-object child throws). Regenerates the MCP api-reference + docs-site reference page.
