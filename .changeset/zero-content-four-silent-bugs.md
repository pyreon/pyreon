---
'@pyreon/zero-content': patch
---

Fix four silent failures in the content pipeline

**Every page shipped a duplicate search entry with a broken URL.** The
transform hook indexes a page under its collection-relative slug but
cached the markdown pipeline's own root-relative one. The `has(slug)`
guard therefore compared two different strings, never matched, and
stashed the same page again — once as `a`, once as `docs/a`, whose URL
resolves to `/docs/docs/a` and 404s. An SSG build transforms every page
at least twice (the outer client build plus the inner SSR sub-build), so
this affected every page of every content site, with the correct entry
sitting beside the broken one. Both paths now derive the slug from one
helper.

**Frontmatter validation was inert under Zod 4.** Zod 4 replaced
`_def.typeName` with `_def.type` and made an object schema's `shape` a
plain object rather than a function, so `isZodObjectSchema` returned
false for every schema and every collection silently fell back to the
permissive artifact — no required-key warning, no type checking, no
unknown-key squiggle. Both versions' internals are now read, and the
existing v3 spec still passes, so the support is genuinely dual.

**`:::details[Label]` rendered its label twice.** The extractor reads the
directive-label marker from either the paragraph or its first inline
child; the filter that removes that paragraph from the body checked only
the child placement. With a paragraph-marker parser the summary was
lifted correctly AND left in the content.

**A missing search index reported a DOCTYPE error.** Every static host
answers a missing file with its SPA fallback — a 200 carrying
`index.html` — so `res.ok` was true and `.json()` threw
`Unexpected token '<', "<!DOCTYPE "...`, naming a doctype for a file that
was never written. It is reachable in production: the catalog is emitted
only when at least one collection produced entries. The loader now says
what arrived and names both likely causes.
