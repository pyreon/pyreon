/**
 * Plugin-level MDX integration — the full transform pipeline with
 * scanning + virtual module + validation wired together.
 *
 * Uses a temporary src/mdx/ directory to simulate the convention scan
 * and asserts the plugin's resolveId/load and transform hooks behave
 * as documented.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content, { VIRTUAL_COMPONENTS_ID } from '../plugin'

const RESOLVED_VIRTUAL = '\0' + VIRTUAL_COMPONENTS_ID

describe('content() plugin — virtual:zero-content/components', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-plugin-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(rel: string, body: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, body, 'utf8')
    return abs
  }

  it('resolves the virtual module id', () => {
    const plugin = content({ mdxDir: tmpDir })
    const resolveId = plugin.resolveId as (id: string) => string | null
    expect(resolveId.call({} as never, VIRTUAL_COMPONENTS_ID)).toBe(RESOLVED_VIRTUAL)
    expect(resolveId.call({} as never, 'some-other-module')).toBeNull()
  })

  it('serves an empty virtual module when src/mdx/ does not exist', async () => {
    const plugin = content({ mdxDir: tmpDir })
    const load = plugin.load as (this: unknown, id: string) => Promise<string | null>
    const result = await load.call({ warn: vi.fn() } as never, RESOLVED_VIRTUAL)
    expect(result).toContain('No src/mdx/ components found')
  })

  it('returns null when loading any other module id', async () => {
    const plugin = content({ mdxDir: tmpDir })
    const load = plugin.load as (this: unknown, id: string) => Promise<string | null>
    expect(await load.call({} as never, '/abs/x.tsx')).toBeNull()
  })

  it('serves discovered components from src/mdx/', async () => {
    await writeFile('Playground.tsx', 'export const Playground = () => null')
    await writeFile('CustomCard.tsx', 'export const CustomCard = () => null')
    const plugin = content({ mdxDir: tmpDir })
    const load = plugin.load as (this: unknown, id: string) => Promise<string | null>
    const result = await load.call({ warn: vi.fn() } as never, RESOLVED_VIRTUAL)
    expect(result).toContain('Playground')
    expect(result).toContain('CustomCard')
    expect(result).toContain('export default __components')
  })

  it('emits this.warn() on duplicate component names', async () => {
    await writeFile('a/Foo.tsx', 'export const Foo = () => null')
    await writeFile('b/Foo.tsx', 'export const Foo = () => null')
    const plugin = content({ mdxDir: tmpDir })
    const warn = vi.fn()
    const load = plugin.load as (this: unknown, id: string) => Promise<string | null>
    await load.call({ warn } as never, RESOLVED_VIRTUAL)
    expect(warn).toHaveBeenCalledOnce()
    const msg = warn.mock.calls[0]![0]
    expect(msg).toContain('Duplicate component name "Foo"')
  })
})

describe('content() plugin — transform with validation', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-tx-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(rel: string, body: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, body, 'utf8')
    return abs
  }

  it('accepts built-in component references without error', async () => {
    const plugin = content({ highlight: false, mdxDir: tmpDir })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const errSpy = vi.fn()
    const warnSpy = vi.fn()
    const result = await transform.call(
      { error: errSpy, warn: warnSpy },
      '<Callout type="tip">x</Callout>',
      '/abs/x.md',
    )
    expect(errSpy).not.toHaveBeenCalled()
    expect(result!.code).toContain('<Callout type="tip">')
  })

  it('accepts scanned components without error', async () => {
    await writeFile('Playground.tsx', 'export const Playground = () => null')
    const plugin = content({ highlight: false, mdxDir: tmpDir })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const errSpy = vi.fn()
    const result = await transform.call(
      { error: errSpy, warn: vi.fn() },
      '<Playground>x</Playground>',
      '/abs/x.md',
    )
    expect(errSpy).not.toHaveBeenCalled()
    expect(result!.code).toContain('<Playground>')
  })

  it('accepts components brought in by per-md hoisted imports', async () => {
    const plugin = content({ highlight: false, mdxDir: tmpDir })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const errSpy = vi.fn()
    const md = `import LocalThing from './LocalThing'

<LocalThing>x</LocalThing>
`
    const result = await transform.call(
      { error: errSpy, warn: vi.fn() },
      md,
      '/abs/x.md',
    )
    expect(errSpy).not.toHaveBeenCalled()
    expect(result!.code).toContain('<LocalThing>')
  })

  it('surfaces unknown component with did-you-mean suggestion', async () => {
    const plugin = content({ highlight: false, mdxDir: tmpDir })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<unknown>
    const errSpy = vi.fn()
    await transform.call(
      { error: errSpy, warn: vi.fn() },
      '<Calout type="tip">typo</Calout>',
      '/abs/src/content/x.md',
    )
    expect(errSpy).toHaveBeenCalledOnce()
    const msg = errSpy.mock.calls[0]![0]
    expect(msg).toContain('Unknown component <Calout />')
    expect(msg).toContain('Did you mean <Callout />?')
    // shortId trims path to src/...
    expect(msg).toContain('src/content/x.md')
  })

  it('surfaces unknown component without suggestion when nothing close', async () => {
    const plugin = content({ highlight: false, mdxDir: tmpDir })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<unknown>
    const errSpy = vi.fn()
    await transform.call(
      { error: errSpy, warn: vi.fn() },
      '<NeverSeenBefore>x</NeverSeenBefore>',
      '/abs/x.md',
    )
    expect(errSpy).toHaveBeenCalledOnce()
    const msg = errSpy.mock.calls[0]![0]
    expect(msg).toContain('No close match found')
  })

  it('falls back to process.cwd()/src/mdx when no mdxDir + no configResolved', async () => {
    // No options.mdxDir set + no configResolved → plugin uses
    // process.cwd() + 'src/mdx'. Just check the transform still works
    // (no scan returns empty because cwd's src/mdx doesn't exist).
    const plugin = content({ highlight: false })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const errSpy = vi.fn()
    const result = await transform.call(
      { error: errSpy, warn: vi.fn() },
      '<Callout type="tip">x</Callout>',
      '/abs/x.md',
    )
    expect(errSpy).not.toHaveBeenCalled()
    expect(result!.code).toContain('<Callout')
  })

  it('configResolved drives the scan root from config.root', async () => {
    await writeFile('src/mdx/Foo.tsx', 'export const Foo = () => null')
    const plugin = content({ highlight: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string },
    ) => void
    configResolved.call({} as never, { root: tmpDir })

    const load = plugin.load as (
      this: unknown,
      id: string,
    ) => Promise<string | null>
    const result = await load.call(
      { warn: vi.fn() } as never,
      RESOLVED_VIRTUAL,
    )
    expect(result).toContain('Foo')
  })
})

describe('content() plugin — handleHotUpdate', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-hmr-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(rel: string, body: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, body, 'utf8')
    return abs
  }

  it('invalidates the virtual module when an mdx file changes', async () => {
    await writeFile('Foo.tsx', 'export const Foo = () => null')
    const plugin = content({ mdxDir: tmpDir })
    // Prime the scan cache.
    const load = plugin.load as (
      this: unknown,
      id: string,
    ) => Promise<string | null>
    await load.call({ warn: vi.fn() } as never, RESOLVED_VIRTUAL)

    const fakeModule = { id: RESOLVED_VIRTUAL }
    const invalidate = vi.fn()
    const getModuleById = vi.fn((id: string) =>
      id === RESOLVED_VIRTUAL ? fakeModule : undefined,
    )
    const handleHotUpdate = plugin.handleHotUpdate as (
      ctx: {
        file: string
        modules: unknown[]
        server: {
          moduleGraph: { getModuleById: typeof getModuleById; invalidateModule: typeof invalidate }
        }
      },
    ) => Promise<unknown>
    const changedFile = path.join(tmpDir, 'Foo.tsx')
    const result = await handleHotUpdate({
      file: changedFile,
      modules: [{ id: changedFile }],
      server: { moduleGraph: { getModuleById, invalidateModule: invalidate } },
    })
    expect(invalidate).toHaveBeenCalledWith(fakeModule)
    expect(result).toEqual([fakeModule, { id: changedFile }])
  })

  it('returns undefined when changed file is outside mdx dir', async () => {
    const plugin = content({ mdxDir: tmpDir })
    const handleHotUpdate = plugin.handleHotUpdate as (
      ctx: {
        file: string
        modules: unknown[]
        server: { moduleGraph: { getModuleById: () => unknown; invalidateModule: () => void } }
      },
    ) => Promise<unknown>
    const result = await handleHotUpdate({
      file: '/some/other/path/x.ts',
      modules: [],
      server: { moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} } },
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when the virtual module is not in the graph', async () => {
    await writeFile('Foo.tsx', 'export const Foo = () => null')
    const plugin = content({ mdxDir: tmpDir })
    const handleHotUpdate = plugin.handleHotUpdate as (
      ctx: {
        file: string
        modules: unknown[]
        server: { moduleGraph: { getModuleById: () => unknown; invalidateModule: () => void } }
      },
    ) => Promise<unknown>
    const result = await handleHotUpdate({
      file: path.join(tmpDir, 'Foo.tsx'),
      modules: [],
      server: { moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} } },
    })
    expect(result).toBeUndefined()
  })
})
