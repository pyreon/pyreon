// PR-G — HMR + processor cache (audit C3 + H4 + H12)
//
// Three independent fixes, one PR:
//
//  - C3 — per-component virtual sub-modules. Compiler emits ONE
//         `import { Foo } from "virtual:zero-content/components/Foo"`
//         per referenced component instead of a barrel import. Vite
//         invalidates each sub-module separately on `src/mdx/Foo.tsx`
//         edits, so a single component change no longer cascades into
//         every `.md` page's invalidation.
//
//  - H4 — compile cache content-hash discrimination + schema-edit
//         invalidation. The cache key is keyed on FNV-1a of the
//         source; a stricter schema added to content.config.ts
//         clears the cache so dependent `.md` files re-validate.
//
//  - H12 — unified processor reuse. The remark plugin chain is
//          built ONCE per (mdxEnabled) flag and reused across every
//          call. The per-file callout-plugin context rides through a
//          module-level thread-local.

import { describe, expect, it } from 'vitest'
import {
  _resetProcessorCacheForTesting,
  compileMarkdown,
} from '../pipeline/parse'
import {
  renderPerComponentVirtual,
} from '../mdx-scan/scanner'

describe('PR-G — C3 — per-component virtual sub-modules', () => {
  it('compileMarkdown emits a per-component import for the default componentsModule', async () => {
    const result = await compileMarkdown(
      '<Callout type="tip">x</Callout>',
      '/abs/src/content/docs/a.md',
    )
    // The new shape: one import line per component, suffixed by name.
    expect(result.code).toContain(
      `import { Callout } from "virtual:zero-content/components/Callout"`,
    )
    // The old barrel-import shape MUST NOT appear.
    expect(result.code).not.toContain(
      `import { Callout } from "virtual:zero-content/components"`,
    )
  })

  it('compileMarkdown emits one separate per-component import per referenced component', async () => {
    const result = await compileMarkdown(
      '<Callout type="tip">x</Callout>\n\n<CodeGroup labels={["a"]}>y</CodeGroup>',
      '/abs/src/content/docs/b.md',
    )
    expect(result.code).toContain(
      `import { Callout } from "virtual:zero-content/components/Callout"`,
    )
    expect(result.code).toContain(
      `import { CodeGroup } from "virtual:zero-content/components/CodeGroup"`,
    )
    // Pre-fix: the barrel emitted ONE import grouping both names. Post-fix:
    // each lands on its own line.
    expect(result.code).not.toContain(
      `import { Callout, CodeGroup } from`,
    )
  })

  it('compileMarkdown respects an explicit non-default componentsModule by using it as a barrel', async () => {
    // Custom `componentsModule` opts the user out of the per-component
    // sub-module scheme (the host doesn't serve the sub-module
    // surface). Keeps test fixtures + non-Vite consumers working.
    const result = await compileMarkdown(
      '<Callout type="tip">x</Callout>',
      '/abs/src/content/docs/c.md',
      { componentsModule: './_components' },
    )
    expect(result.code).toContain(
      `import { Callout } from "./_components"`,
    )
    expect(result.code).not.toContain(
      `import { Callout } from "./_components/Callout"`,
    )
  })

  it('renderPerComponentVirtual emits a thin re-export of the barrel binding', () => {
    const body = renderPerComponentVirtual('Callout')
    // Source-of-identity is the barrel — preserves the scanner's
    // duplicate-detection + built-in override semantics + a single
    // canonical instance per component name (no double-loading).
    expect(body).toContain(`from 'virtual:zero-content/components'`)
    expect(body).toContain(`export { Callout }`)
  })
})

describe('PR-G — H12 — processor reuse', () => {
  it('compileMarkdown returns identical output across repeated calls (processor reuse)', async () => {
    _resetProcessorCacheForTesting()
    const src = '# Title\n\nParagraph.'
    const a = await compileMarkdown(src, '/abs/a.md')
    const b = await compileMarkdown(src, '/abs/a.md')
    // Both runs use the same cached processor under the hood; output
    // is byte-identical given identical inputs.
    expect(a.code).toEqual(b.code)
  })

  it('callout plugin context is correctly threaded per-file (no cross-file warning leak)', async () => {
    _resetProcessorCacheForTesting()
    // First file uses an unknown callout name — generates a warning.
    const a = await compileMarkdown(':::warng\nBody\n:::\n', '/abs/a.md')
    expect(a.warnings.length).toBeGreaterThan(0)
    // Second file (same cached processor) is clean — must NOT inherit
    // the prior file's warnings array.
    const b = await compileMarkdown('# Clean\n', '/abs/b.md')
    expect(b.warnings).toEqual([])
  })

  it('processor cache survives a reset call (rebuilds lazily)', async () => {
    _resetProcessorCacheForTesting()
    const a = await compileMarkdown('# A', '/abs/a.md')
    _resetProcessorCacheForTesting()
    const b = await compileMarkdown('# A', '/abs/a.md')
    // Reset is transparent — same output before and after.
    expect(a.code).toEqual(b.code)
  })
})

describe('PR-G — H4 — schema-edit clears compile cache', () => {
  // The compile cache (PR-B) is keyed on FNV-1a of source — it
  // intentionally does NOT include the active collection schema
  // identity. A user editing content.config.ts to add or strengthen
  // a schema would otherwise let unchanged `.md` files skip the
  // re-validate pass and silently violate the new rules.
  //
  // The fix in `plugin.ts:handleHotUpdate` (the content.config.ts
  // branch) calls `COMPILE_CACHE.clear()` BEFORE re-loading the
  // config. Hard to drive end-to-end without booting Vite, so this
  // test directly asserts the source contains the cache clear in
  // the right ordering relative to loadConfig — a structural,
  // bisect-verifiable assertion (a refactor that drops the line
  // fails the test).
  it('plugin.ts handleHotUpdate clears the compile cache on content.config edit', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const url = await import('node:url')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const src = await fs.readFile(
      path.join(here, '../plugin.ts'),
      'utf8',
    )
    // The handleHotUpdate branch for content.config must blow away
    // the compile cache so all dependent `.md` re-validate against
    // the new schema. The structural assertion: the clear call
    // appears between the `if (loadedConfig && ctx.file === ...)`
    // guard and the `loadConfig(` call.
    const guardIdx = src.indexOf(
      'if (loadedConfig && ctx.file === loadedConfig.configFile)',
    )
    const clearIdx = src.indexOf('COMPILE_CACHE.clear()', guardIdx)
    const reloadIdx = src.indexOf('loadConfig(', guardIdx)
    expect(guardIdx).toBeGreaterThan(0)
    expect(clearIdx).toBeGreaterThan(guardIdx)
    expect(reloadIdx).toBeGreaterThan(clearIdx)
  })
})
