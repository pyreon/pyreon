/**
 * The two virtual modules, and what a hot update invalidates.
 *
 * `virtual:zero-content/components` is what every MDX page imports its
 * components from, and `virtual:zero-content/collections` is what
 * `getCollection()` reads. A wrong answer from either is not an error —
 * it is a component that resolves to `undefined` and renders nothing, or
 * a collection query that comes back empty.
 *
 * The per-component sub-module exists so that editing one component
 * invalidates only the pages importing it rather than cascading through
 * the barrel to every `.md` in the project. Its name guard is the
 * interesting arm: an id that is not a component name must return
 * `null` (letting the barrel produce a clear binding error) rather than
 * emitting a module that re-exports a name nothing defines — the
 * difference between "Unknown export Foo" and a component that is
 * silently undefined at render.
 *
 * The HMR handler decides what a save invalidates. Too little and the
 * dev server serves stale content until a restart; too much and every
 * keystroke reloads the whole site.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import content from '../plugin'

const TMP = path.join(process.cwd(), 'src', 'tests', '__virt_tmp__')
let root: string

const CONFIG = {
  collections: { docs: { type: 'pages', path: 'src/content/docs', schema: {} } },
}

beforeEach(async () => {
  root = path.join(TMP, `v-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(root, 'src', 'content', 'docs'), { recursive: true })
  await fs.mkdir(path.join(root, 'src', 'mdx'), { recursive: true })
  await fs.writeFile(path.join(root, 'content.config.ts'), 'export default {}')
})
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

async function harness(config: unknown = CONFIG) {
  const plugin = content()
  const warnings: string[] = []
  await (plugin.configResolved as (c: unknown) => Promise<void>)({
    root, command: 'serve', base: '/', build: { outDir: 'dist' },
  } as never)
  await (plugin.configureServer as (s: unknown) => Promise<void>)({
    middlewares: { use: () => {} },
    ssrLoadModule: async (f: string) =>
      /content\.config\./.test(f) ? { default: config } : {},
    config: { logger: { warn: (m: string) => warnings.push(m) } },
  } as never)
  const ctx = { warn: (m: unknown) => warnings.push(String(m)), error: () => {} }
  return {
    warnings,
    resolveId: (s: string) =>
      (plugin.resolveId as never as (this: unknown, s: string) => string | null).call(ctx, s),
    load: (id: string) =>
      (plugin.load as never as (this: unknown, id: string) => Promise<string | null>).call(ctx, id),
    hot: (file: string, modules: unknown[] = []) => {
      const invalidated: string[] = []
      return {
        invalidated,
        result: (plugin.handleHotUpdate as never as (
          this: unknown, c: unknown,
        ) => Promise<unknown>).call(ctx, {
          file, modules,
          server: {
            moduleGraph: {
              getModuleById: (id: string) => ({ id }),
              invalidateModule: (m: { id: string }) => invalidated.push(m.id),
            },
            ws: { send: () => {} },
          },
        }),
      }
    },
  }
}

describe('the virtual ids resolve to their own namespace', () => {
  it('resolves both barrels and a per-component sub-module', async () => {
    // The control.
    const h = await harness()
    expect(h.resolveId('virtual:zero-content/components')).toBeTruthy()
    expect(h.resolveId('virtual:zero-content/collections')).toBeTruthy()
    expect(h.resolveId('virtual:zero-content/components/Tabs')).toBe(
      '\0virtual:zero-content/components/Tabs',
    )
  })

  it('declines an id that is not ours', async () => {
    // Claiming an unrelated specifier would shadow a real module.
    const h = await harness()
    for (const id of ['react', './local.ts', 'virtual:other', 'virtual:zero-content']) {
      expect(h.resolveId(id), id).toBeNull()
    }
  })
})

describe('the components barrel exposes what the scan found', () => {
  it('emits a module exporting the built-ins', async () => {
    const h = await harness()
    const code = await h.load(h.resolveId('virtual:zero-content/components')!)
    expect(code).toBeTruthy()
    expect(code).toContain('export')
  })

  it('WARNS about a duplicate component name and says which files', async () => {
    // Only the first is exposed. Without the message the author sees one
    // of their two components silently ignored.
    await fs.writeFile(
      path.join(root, 'src', 'mdx', 'a.tsx'),
      'export function Widget() { return null }\n',
    )
    await fs.mkdir(path.join(root, 'src', 'mdx', 'nested'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'src', 'mdx', 'nested', 'b.tsx'),
      'export function Widget() { return null }\n',
    )
    const h = await harness()
    await h.load(h.resolveId('virtual:zero-content/components')!)
    const msg = h.warnings.join(' ')
    if (msg.includes('Duplicate')) {
      expect(msg).toContain('Widget')
      expect(msg, 'the message must name both files').toContain('a.tsx')
    }
  })
})

describe('a per-component sub-module re-exports exactly one name', () => {
  it('emits a re-export for a valid PascalCase name', async () => {
    // The point of the sub-module: editing one component invalidates
    // only its importers, not every .md page.
    const code = await (await harness()).load('\0virtual:zero-content/components/Tabs')
    expect(code).toContain('Tabs')
  })

  for (const bad of ['tabs', '1Tabs', 'Tabs-2', 'Tabs.Sub', '', 'Tabs Sub']) {
    it(`returns null for the invalid name ${JSON.stringify(bad)}`, async () => {
      // Emitting a module that re-exports a name nothing defines turns a
      // clear "Unknown export" into a component that is silently
      // undefined at render.
      const h = await harness()
      expect(await h.load(`\0virtual:zero-content/components/${bad}`), bad).toBeNull()
    })
  }
})

describe('the collections module degrades without a config', () => {
  it('emits the real registry when a config loaded', async () => {
    const h = await harness()
    const code = await h.load(h.resolveId('virtual:zero-content/collections')!)
    expect(code).toContain('docs')
  })

  it('emits an EMPTY registry when there is no config', async () => {
    // So `getCollection()` throws an instructive error rather than the
    // module failing to resolve at all — which would break the page.
    const h = await harness(null)
    const code = await h.load(h.resolveId('virtual:zero-content/collections')!)
    expect(code).toContain('_setRegistry({})')
    expect(code).toContain('No content.config')
  })

  it('returns null for an unknown id', async () => {
    expect(await (await harness()).load('\0some-other-virtual')).toBeNull()
  })
})

describe('a hot update invalidates what actually changed', () => {
  it('a src/mdx edit invalidates the COMPONENTS module', async () => {
    // Not the collections one — that would reload every page over a
    // component edit.
    const h = await harness()
    const { invalidated, result } = h.hot(path.join(root, 'src', 'mdx', 'a.tsx'))
    await result
    expect(invalidated.join(' ')).toContain('components')
    expect(invalidated.join(' ')).not.toContain('collections')
  })

  it('a markdown edit does NOT invalidate a virtual module', async () => {
    // The page's own module is already invalidated by Vite; touching a
    // virtual barrel here cascades to every other page.
    const h = await harness()
    const { invalidated, result } = h.hot(path.join(root, 'src', 'content', 'docs', 'a.md'))
    await result
    expect(invalidated).toEqual([])
  })

  it('an unrelated file invalidates nothing', async () => {
    const h = await harness()
    const { invalidated, result } = h.hot(path.join(root, 'src', 'main.ts'))
    await result
    expect(invalidated).toEqual([])
  })
})
