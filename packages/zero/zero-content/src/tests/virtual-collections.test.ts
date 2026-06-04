/**
 * Virtual collections module renderer — pure function tested against
 * sample configs. The plugin integration tests cover the full runtime
 * loop separately.
 */
import { describe, expect, it } from 'vitest'
import { renderVirtualCollections } from '../virtual-collections'
import { renderContentTypes } from '../type-emit/content-types'

describe('renderVirtualCollections', () => {
  it('emits an empty registry when no collections are defined', () => {
    const out = renderVirtualCollections({
      config: { collections: {} },
      root: '/abs/proj',
    })
    expect(out).toContain('_setRegistry({})')
    expect(out).toContain('No collections defined')
  })

  it('emits one import.meta.glob per collection', () => {
    const out = renderVirtualCollections({
      config: {
        collections: {
          docs: { type: 'pages', schema: {} },
          blog: { type: 'data', schema: {} },
        },
      },
      root: '/abs/proj',
    })
    expect(out).toContain(
      `const __docs_modules = import.meta.glob("/src/content/docs/**/*.{md,mdx}")`,
    )
    expect(out).toContain(
      `const __blog_modules = import.meta.glob("/src/content/blog/**/*.{md,mdx}")`,
    )
  })

  it('honours an explicit collection path override', () => {
    const out = renderVirtualCollections({
      config: {
        collections: {
          docs: { type: 'pages', schema: {}, path: 'content/d' },
        },
      },
      root: '/abs/proj',
    })
    expect(out).toContain(
      `import.meta.glob("/content/d/**/*.{md,mdx}")`,
    )
  })

  it('wraps each collection in a registry entry with type + loaders', () => {
    const out = renderVirtualCollections({
      config: {
        collections: {
          docs: { type: 'pages', schema: {} },
        },
      },
      root: '/abs/proj',
    })
    expect(out).toContain('"docs": {')
    expect(out).toContain('name: "docs"')
    expect(out).toContain('type: "pages"')
    expect(out).toContain('loaders: Object.fromEntries(')
  })
})

describe('renderContentTypes', () => {
  it('emits an empty CollectionSchemas augmentation when no names', () => {
    const out = renderContentTypes({
      configFile: '/abs/proj/content.config.ts',
      collectionNames: [],
      root: '/abs/proj',
    })
    expect(out).toContain(`declare module '@pyreon/zero-content'`)
    expect(out).toContain('interface CollectionSchemas {')
  })

  it('emits one type entry per collection', () => {
    const out = renderContentTypes({
      configFile: '/abs/proj/content.config.ts',
      collectionNames: ['docs', 'blog'],
      root: '/abs/proj',
    })
    expect(out).toContain(
      `"docs": StandardSchemaV1.InferOutput<typeof ContentConfig.default.collections["docs"]["schema"]>`,
    )
    expect(out).toContain(
      `"blog": StandardSchemaV1.InferOutput<typeof ContentConfig.default.collections["blog"]["schema"]>`,
    )
  })

  it('writes an import of the schema helper', () => {
    const out = renderContentTypes({
      configFile: '/abs/proj/content.config.ts',
      collectionNames: ['docs'],
      root: '/abs/proj',
    })
    expect(out).toContain(
      `import type { StandardSchemaV1 } from '@pyreon/zero-content/schema'`,
    )
  })

  it('imports the user content config relatively from .pyreon/', () => {
    const out = renderContentTypes({
      configFile: '/abs/proj/content.config.ts',
      collectionNames: ['docs'],
      root: '/abs/proj',
    })
    // Generated file lives in /abs/proj/.pyreon/ — the relative
    // path back to the config is "../content.config".
    expect(out).toContain(
      `import type * as ContentConfig from "../content.config"`,
    )
  })
})
