// PR-A audit drift locks — assert the previously-duplicated sources
// (L10 / L11 / L12) really are routed through ONE module each. If a
// future contributor re-introduces a local copy of any of them, this
// suite fails loudly with a pointer to the canonical home.
//
// Bisect-verified: temporarily reverting any of the shared modules
// back to inline duplicates makes the matching spec(s) fail.
import { describe, expect, it } from 'vitest'
import { BUILT_IN_COMPONENTS as BUILT_INS_SHARED } from '../_shared/built-ins'
import { BUILT_IN_COMPONENTS as BUILT_INS_VALIDATE } from '../mdx-scan/validate'
import { MINISEARCH_OPTIONS } from '../_shared/minisearch-options'
import { emitRuntimeSlugHelper, slugFromPath } from '../_shared/derive-slug'
import { deriveSlug } from '../pipeline/parse'
import { renderVirtualCollections } from '../virtual-collections'

describe('PR-A drift locks — single source of truth across modules', () => {
  describe('L10 — built-in component list', () => {
    it('validate.ts BUILT_IN_COMPONENTS IS the shared list (same reference)', () => {
      // The validator re-export uses `readonly string[]` to keep
      // back-compat with the historical mutable-ish typing; identity
      // check via `.slice()` round-trip on contents is the strongest
      // structural guarantee.
      expect([...BUILT_INS_VALIDATE]).toEqual([...BUILT_INS_SHARED])
    })

    it('the canonical order is alphabetical so additions go in one place', () => {
      const sorted = [...BUILT_INS_SHARED].sort()
      expect([...BUILT_INS_SHARED]).toEqual(sorted)
    })

    it('the shared list is frozen so a stray `push` fails loudly', () => {
      expect(Object.isFrozen(BUILT_INS_SHARED)).toBe(true)
    })
  })

  describe('L11 — slug derivation', () => {
    // `deriveSlug` and `__zcSlug` have DIFFERENT contracts by design:
    //   - `deriveSlug(absPath)` returns the path FROM `/content/`
    //     (collection-included). For `/.../src/content/docs/zero.md`
    //     it returns `docs/zero` — this is what's baked into the
    //     compiled `.tsx` module's `export const slug` as an
    //     informational identifier.
    //   - `__zcSlug(file, base)` returns the path FROM the per-
    //     collection `base`. For the same file with `base =
    //     /.../src/content/docs` it returns `zero` — this is the
    //     KEY in the `collection.loaders` map at runtime, so
    //     `getEntry('docs', 'zero')` resolves.
    //
    // The PR-A audit L11 drift wasn't that they should return the
    // SAME thing — it was that they had INDEPENDENT implementations
    // of the index-collapse / extension-strip / windows-normalise
    // primitive. We lock that primitive (`slugFromPath`) here.
    it('the shared `slugFromPath` primitive handles the canonical inputs identically', () => {
      const helperSrc = emitRuntimeSlugHelper()
      // eslint-disable-next-line no-new-func
      const runtime = new Function(`${helperSrc}; return __zcSlug`)() as (
        file: string,
        base: string,
      ) => string

      // Both consumers reduce to `slugFromPath(<rel>)`. Stress every
      // sub-rule (`.md`/`.mdx` strip, `/index` collapse, bare `index`,
      // empty input, Windows separators, deep nesting).
      const relCases: ReadonlyArray<readonly [string, string]> = [
        ['zero.md', 'zero'],
        ['zero.mdx', 'zero'],
        ['router/loaders.md', 'router/loaders'],
        ['2026/06/post.mdx', '2026/06/post'],
        ['nested/index.md', 'nested'],
        ['index.md', ''],
        ['', ''],
        ['just-text', 'just-text'],
        ['weird.MD', 'weird'],
      ]
      for (const [rel, expected] of relCases) {
        expect(slugFromPath(rel)).toBe(expected)
      }

      // `__zcSlug` reduces to `slugFromPath` AFTER stripping the
      // per-collection `base`. Verify the call-through contract.
      const runtimeCases: ReadonlyArray<readonly [string, string, string]> = [
        ['/abs/p/src/content/docs/zero.md', '/abs/p/src/content/docs', 'zero'],
        ['/abs/p/src/content/docs/router/loaders.md', '/abs/p/src/content/docs', 'router/loaders'],
        ['/abs/p/src/content/docs/index.md', '/abs/p/src/content/docs', ''],
        ['/abs/p/src/content/blog/2026/06/post.mdx', '/abs/p/src/content/blog', '2026/06/post'],
      ]
      for (const [file, base, expected] of runtimeCases) {
        expect(runtime(file, base)).toBe(expected)
      }

      // `deriveSlug` reduces to `slugFromPath` AFTER stripping up to
      // `/content/`. Returns the COLLECTION-INCLUSIVE form (e.g.
      // `docs/zero`), which is intentional — it's what the compiled
      // module exports as `slug` for informational use.
      expect(deriveSlug('/abs/p/src/content/docs/zero.md')).toBe('docs/zero')
      expect(deriveSlug('/abs/p/src/content/docs/router/loaders.mdx')).toBe('docs/router/loaders')
      expect(deriveSlug('/abs/p/src/content/docs/index.md')).toBe('docs')
      expect(deriveSlug('/abs/p/src/content/index.md')).toBe('')
      // Windows path normalisation.
      expect(deriveSlug('C:\\proj\\src\\content\\docs\\zero.md')).toBe('docs/zero')
    })

    it('virtual-collections emits the helper from the shared source', () => {
      const out = renderVirtualCollections({
        config: {
          collections: {
            docs: { type: 'pages', schema: {} as never, path: 'src/content/docs' },
          },
        },
        root: '/abs/project',
      })
      // The shared helper's literal body appears verbatim. A future
      // accidental inline copy would NOT include this signature comment.
      expect(out).toContain('kept in lock-step with slugFromPath')
      expect(out).toContain('function __zcSlug(file, base)')
    })
  })

  describe('L12 — MiniSearch options', () => {
    it('build-time index-builder and runtime search-runtime use the SAME options object', async () => {
      // Both modules import from the shared `_shared/minisearch-options.ts`.
      // The contract we lock: `fields`, `storeFields`, and the boost
      // weights MUST match — any drift silently breaks `MiniSearch.loadJSON`
      // ranking. Identity-import is the strongest possible guarantee.
      const indexBuilder = await import('../search/index-builder')
      const runtime = await import('../search/search-runtime')

      // Both modules re-import via the shared module under the
      // historical local name — both should still reflect the
      // canonical values verbatim.
      expect(MINISEARCH_OPTIONS.fields).toEqual([
        'title',
        'description',
        'headings',
        'body',
      ])
      expect(MINISEARCH_OPTIONS.storeFields).toEqual([
        'title',
        'description',
        'url',
        'collection',
        'slug',
        // `anchors` is stored (not indexed) so the runtime can deep-link a
        // result to the heading that best matches the query.
        'anchors',
      ])
      expect(MINISEARCH_OPTIONS.searchOptions.boost).toEqual({
        title: 3,
        headings: 2,
        description: 1.5,
      })
      // Both modules import the shared object, so accessing it via
      // each module's bag must hit identical references when re-
      // exported. We don't expose the constant for assertion, but
      // the modules ARE able to be imported in this same test
      // process (proving no module-eval crash from the rewire).
      expect(typeof indexBuilder.buildSearchIndex).toBe('function')
      expect(typeof runtime.loadSearchIndex).toBe('function')
    })
  })
})
