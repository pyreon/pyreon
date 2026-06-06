---
'@pyreon/zero-content': patch
---

PR-G — HMR + processor cache (audit C3+H4+H12)

Three independent fixes:

- **C3**: per-component virtual sub-modules. Compiled markdown emits
  `import { Foo } from "virtual:zero-content/components/Foo"` per
  referenced component instead of a barrel import. Edits to
  `src/mdx/Foo.tsx` now invalidate only pages that import Foo,
  instead of cascading through every `.md` page.

- **H4**: schema-edit clears the compile cache. The cache key is
  content-based; a stricter schema added to `content.config.ts`
  would otherwise let unchanged `.md` files skip re-validation.
  `handleHotUpdate` now clears the cache before reloading.

- **H12**: remark/unified processor reuse. Pre-fix every
  `compileMarkdown` call built a fresh processor (parse + frontmatter
  + gfm + directive + callout + codegroup + optional mdx). Two
  processors (mdx-enabled / mdx-disabled) are now cached at module
  scope; the per-file `remarkCallout` context (`{ source, warnings }`)
  rides through a module-level thread-local set immediately before
  `processor.run`.

8 new specs cover the three contracts; bisect-verified.
