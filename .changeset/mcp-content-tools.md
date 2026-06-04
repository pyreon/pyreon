---
'@pyreon/mcp': minor
---

`get_content_collection` + `get_content_entry` MCP tools. Lets AI agents navigate a `@pyreon/zero-content` corpus structurally — enumerate collections, list every entry's slug + title, drill into one entry's frontmatter + heading outline — without scraping `import.meta.glob` patterns or reading raw markdown files one at a time.

## get_content_collection

- No args → lists every declared collection across all `content.config.{ts,mts,js,mjs}` in the project (one bullet each: name, type, entry count, content dir).
- With `name` → returns that collection's metadata + every entry's slug + title + path.

## get_content_entry

- `collection: string` + `slug: string` → returns the entry's relative path, frontmatter (parsed key→value), heading outline (level + text, code-fence-aware), and source size in bytes.
- Missing-slug case returns nearest-match suggestions filtered against the collection's known slugs.

## Implementation

Pure syntactic walker — reuses `parseContentConfig` + `findContentConfigs` + `deriveSlug` + `readFrontmatter` + `readTitleFromFrontmatter` from `@pyreon/compiler`'s content audit (same module that powers `pyreon doctor --check-content`). No runtime dep on `@pyreon/zero-content`. Works on any project that ships a `content.config.{ts,mts,js,mjs}` declaring `defineCollection({...})` shapes.

64 unit specs in `content.test.ts` (collection enumeration, entry detail, frontmatter parsing, heading outline + fence-aware extraction, error paths) + 5 server-roundtrip specs in `content-server.test.ts` (empty-project + arg validation). 531/531 MCP specs pass. `tools/list` payload stays under the 1,300 token regression budget.
