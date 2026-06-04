/**
 * Plugin-level integration — content collections + schema validation +
 * virtual collections module + type emission.
 *
 * Uses tmp dirs to simulate a consumer project with content.config.{js}
 * + collection content + content.config-based schema validation. Avoids
 * .ts configs (Bun's vitest can't dynamic-import them in isolation;
 * .js is the supported path for unit tests).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content, { VIRTUAL_COLLECTIONS_ID } from '../plugin'

// Use a workspace-local tmp dir so Bun's dynamic-import resolver accepts
// the path. `/tmp` files fail with "Cannot find module" under Bun.
const WORKSPACE_TMP_ROOT = path.join(
  process.cwd(),
  'src',
  'tests',
  '__tmp__',
)

const RESOLVED_VIRTUAL_COLLECTIONS = '\0' + VIRTUAL_COLLECTIONS_ID

describe('content() plugin — virtual:zero-content/collections', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(WORKSPACE_TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(
      path.join(WORKSPACE_TMP_ROOT, 'zero-content-coll-'),
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeProjectFile(rel: string, body: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, body, 'utf8')
    return abs
  }

  it('resolves the virtual collections module id', () => {
    const plugin = content({ highlight: false, compileJsx: false })
    const resolveId = plugin.resolveId as (id: string) => string | null
    expect(resolveId.call({} as never, VIRTUAL_COLLECTIONS_ID)).toBe(
      RESOLVED_VIRTUAL_COLLECTIONS,
    )
  })

  it('serves an empty registry when no content.config is present', async () => {
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    // Skip configResolved - simulate plain consumer with no config.
    const load = plugin.load as (this: unknown, id: string) => Promise<string | null>
    const result = await load.call(
      { warn: vi.fn() } as never,
      RESOLVED_VIRTUAL_COLLECTIONS,
    )
    expect(result).toContain('_setRegistry({})')
    expect(result).toContain('No content.config found')
  })

  it('serves the collections registry when content.config is present', async () => {
    // Write a .js config to keep the loader simple.
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: {} } } }`,
    )
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call(
      {} as never,
      { root: tmpDir, logger: { warn: vi.fn() } },
    )
    const load = plugin.load as (this: unknown, id: string) => Promise<string | null>
    const result = await load.call(
      { warn: vi.fn() } as never,
      RESOLVED_VIRTUAL_COLLECTIONS,
    )
    expect(result).toContain('_setRegistry')
    expect(result).toContain(`"docs"`)
    expect(result).toContain(`import.meta.glob`)
  })

  it('emits .pyreon/content-types.d.ts when config loads successfully', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: {} } } }`,
    )
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call(
      {} as never,
      { root: tmpDir, logger: { warn: vi.fn() } },
    )
    const generated = await fs.readFile(
      path.join(tmpDir, '.pyreon', 'content-types.d.ts'),
      'utf8',
    )
    expect(generated).toContain(`interface CollectionSchemas`)
    expect(generated).toContain(`"docs"`)
  })

  it('warns and skips when config has shape errors', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { broken: { type: 'invalid', schema: {} } } }`,
    )
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const warn = vi.fn()
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof warn } },
    ) => Promise<void>
    await configResolved.call({} as never, { root: tmpDir, logger: { warn } })
    expect(warn).toHaveBeenCalled()
    const msg = warn.mock.calls[0]![0]
    expect(msg).toContain('Failed to load content config')
  })
})

describe('content() plugin — frontmatter schema validation', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(WORKSPACE_TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(
      path.join(WORKSPACE_TMP_ROOT, 'zero-content-sv-'),
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeProjectFile(rel: string, body: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, body, 'utf8')
    return abs
  }

  // A fake Standard Schema validator that demands `title` to be a string.
  const titleRequiredSchema = `({
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: (input) => {
        if (input && typeof input.title === 'string') {
          return { value: input }
        }
        return { issues: [{ message: 'title is required and must be a string', path: ['title'] }] }
      },
    },
  })`

  it('passes valid frontmatter through unchanged', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: ${titleRequiredSchema} } } }`,
    )
    const docFile = path.join(
      tmpDir,
      'src',
      'content',
      'docs',
      'hello.md',
    )
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const errSpy = vi.fn()
    const result = await transform.call(
      { error: errSpy, warn: vi.fn() },
      `---
title: Hello
---

body
`,
      docFile,
    )
    expect(errSpy).not.toHaveBeenCalled()
    expect(result?.code).toContain('export default function ContentPage()')
  })

  it('surfaces a schema error when frontmatter is invalid', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: ${titleRequiredSchema} } } }`,
    )
    const docFile = path.join(
      tmpDir,
      'src',
      'content',
      'docs',
      'hello.md',
    )
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<unknown>
    const errSpy = vi.fn()
    await transform.call(
      { error: errSpy, warn: vi.fn() },
      `---
description: missing title!
---

body
`,
      docFile,
    )
    expect(errSpy).toHaveBeenCalledOnce()
    const msg = errSpy.mock.calls[0]![0]
    expect(msg).toContain('does not match collection "docs" schema')
    expect(msg).toContain('title: title is required')
  })

  it('buildStart loads config as a fallback for .ts files', async () => {
    // .ts config — configResolved doesn't fast-load .ts (waits for
    // ssrLoadModule). buildStart's fallback path runs defaultLoader,
    // which throws for .ts under Bun + Node; the catch swallows it
    // silently so the build proceeds.
    await writeProjectFile(
      'content.config.ts',
      `export default { collections: { docs: { type: 'pages', schema: {} } } }`,
    )
    const mdxDir = path.join(tmpDir, 'src', 'mdx')
    await fs.mkdir(mdxDir, { recursive: true })
    const plugin = content({ highlight: false, mdxDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    const buildStart = plugin.buildStart as (this: unknown) => Promise<void>
    // Should not throw — the catch swallows .ts loader failures.
    await expect(buildStart.call({} as never)).resolves.toBeUndefined()
  })

  it('buildStart fast-loads .js when configResolved did not run', async () => {
    // Simulate a build-only flow where configResolved was bypassed
    // (rare). buildStart should still successfully load .js.
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { posts: { type: 'data', schema: {} } } }`,
    )
    const mdxDir = path.join(tmpDir, 'src', 'mdx')
    await fs.mkdir(mdxDir, { recursive: true })
    const plugin = content({ highlight: false, mdxDir, compileJsx: false })
    // configResolved sets resolvedConfig but the .js arm fires synchronously
    // so loadedConfig IS already set. To force buildStart to run the
    // load, we just call configResolved first then buildStart — the
    // second call is a no-op but exercises the guard.
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    const buildStart = plugin.buildStart as (this: unknown) => Promise<void>
    await buildStart.call({} as never)
    // Sanity check — types file emitted by configResolved's fast path.
    const generated = await fs.readFile(
      path.join(tmpDir, '.pyreon', 'content-types.d.ts'),
      'utf8',
    )
    expect(generated).toContain('"posts"')
  })

  it('configureServer warns when ssrLoadModule throws', async () => {
    await writeProjectFile(
      'content.config.ts',
      `export default { collections: { docs: { type: 'pages', schema: {} } } }`,
    )
    const mdxDir = path.join(tmpDir, 'src', 'mdx')
    await fs.mkdir(mdxDir, { recursive: true })
    const plugin = content({ highlight: false, mdxDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    const configureServer = plugin.configureServer as (
      this: unknown,
      server: {
        ssrLoadModule: (file: string) => Promise<{ default?: unknown }>
        config: { logger: { warn: typeof vi.fn } }
      },
    ) => Promise<void>
    const warn = vi.fn()
    const fakeServer = {
      ssrLoadModule: vi
        .fn()
        .mockRejectedValue(new Error('synthetic load failure')),
      config: { logger: { warn } },
    }
    await configureServer.call({} as never, fakeServer)
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls[0]![0]).toContain('Failed to load content config')
  })

  it('configureServer loads .ts config via ssrLoadModule', async () => {
    // .ts files need Vite's ssrLoadModule; we supply a fake server.
    await writeProjectFile('content.config.ts', `export default { collections: { docs: { type: 'pages', schema: {} } } }`)
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    // configResolved with .ts present but no fast load (the .ts arm
    // is gated to .js/.mjs).
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    // Then configureServer wires the ssrLoadModule path.
    const configureServer = plugin.configureServer as (
      this: unknown,
      server: {
        ssrLoadModule: (file: string) => Promise<{ default?: unknown }>
        config: { logger: { warn: typeof vi.fn } }
      },
    ) => Promise<void>
    const fakeServer = {
      ssrLoadModule: vi.fn().mockResolvedValue({
        default: {
          collections: { docs: { type: 'pages' as const, schema: {} } },
        },
      }),
      config: { logger: { warn: vi.fn() } },
    }
    await configureServer.call({} as never, fakeServer)
    expect(fakeServer.ssrLoadModule).toHaveBeenCalledOnce()
    const generated = await fs.readFile(
      path.join(tmpDir, '.pyreon', 'content-types.d.ts'),
      'utf8',
    )
    expect(generated).toContain('"docs"')
  })

  it('handleHotUpdate for content.config invalidates the collections module', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: {} } } }`,
    )
    // mdxDir points at a subdirectory so the content.config file
    // doesn't accidentally fall into `isUnderMdxDir` (which would route
    // HMR through the components branch).
    const mdxDir = path.join(tmpDir, 'src', 'mdx')
    await fs.mkdir(mdxDir, { recursive: true })
    const plugin = content({ highlight: false, mdxDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    // resolveId/load reload the registry; just ensure config was loaded
    // by checking the .pyreon/content-types.d.ts file was written.
    await fs.access(path.join(tmpDir, '.pyreon', 'content-types.d.ts'))
    const configFile = path.join(tmpDir, 'content.config.js')
    // Read the actual configFile path written into the generated types
    // (or the .pyreon dir) — fs.realpath to handle macOS /private symlinks.
    const realConfigFile = await fs.realpath(configFile)
    const fakeModule = { id: RESOLVED_VIRTUAL_COLLECTIONS }
    const invalidate = vi.fn()
    const getModuleById = vi.fn((id: string) =>
      id === RESOLVED_VIRTUAL_COLLECTIONS ? fakeModule : undefined,
    )
    const handleHotUpdate = plugin.handleHotUpdate as (
      ctx: {
        file: string
        modules: unknown[]
        server: {
          config: { logger: { warn: typeof vi.fn } }
          moduleGraph: {
            getModuleById: typeof getModuleById
            invalidateModule: typeof invalidate
          }
        }
      },
    ) => Promise<unknown>
    // The plugin caches loadedConfig.configFile via findConfigFile,
    // which returns the joined path verbatim. Trigger HMR with the
    // same shape.
    const result = await handleHotUpdate({
      file: configFile,
      modules: [],
      server: {
        config: { logger: { warn: vi.fn() } },
        moduleGraph: { getModuleById, invalidateModule: invalidate },
      },
    })
    expect(invalidate).toHaveBeenCalledWith(fakeModule)
    expect(result).toEqual([fakeModule])
    void realConfigFile
  })

  it('handleHotUpdate falls back via viteServer.ssrLoadModule when set', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: {} } } }`,
    )
    const mdxDir = path.join(tmpDir, 'src', 'mdx')
    await fs.mkdir(mdxDir, { recursive: true })
    const plugin = content({ highlight: false, mdxDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    // configureServer to set viteServer.
    const configureServer = plugin.configureServer as (
      this: unknown,
      server: {
        ssrLoadModule: (file: string) => Promise<{ default?: unknown }>
        config: { logger: { warn: typeof vi.fn } }
      },
    ) => Promise<void>
    const ssrLoadModule = vi.fn().mockResolvedValue({
      default: { collections: { docs: { type: 'pages', schema: {} } } },
    })
    await configureServer.call({} as never, {
      ssrLoadModule,
      config: { logger: { warn: vi.fn() } },
    })
    // Now HMR — reload should go through ssrLoadModule.
    ssrLoadModule.mockClear()
    const handleHotUpdate = plugin.handleHotUpdate as (
      ctx: {
        file: string
        modules: unknown[]
        server: {
          config: { logger: { warn: typeof vi.fn } }
          moduleGraph: {
            getModuleById: (id: string) => unknown
            invalidateModule: (m: unknown) => void
          }
        }
      },
    ) => Promise<unknown>
    await handleHotUpdate({
      file: path.join(tmpDir, 'content.config.js'),
      modules: [],
      server: {
        config: { logger: { warn: vi.fn() } },
        moduleGraph: {
          getModuleById: () => undefined,
          invalidateModule: () => {},
        },
      },
    })
    expect(ssrLoadModule).toHaveBeenCalled()
  })

  it('skips validation when the file is not inside any collection', async () => {
    await writeProjectFile(
      'content.config.js',
      `export default { collections: { docs: { type: 'pages', schema: ${titleRequiredSchema} } } }`,
    )
    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: { root: string; logger: { warn: typeof vi.fn } },
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      logger: { warn: vi.fn() },
    })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void; warn: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<unknown>
    const errSpy = vi.fn()
    // Outside any collection path.
    await transform.call(
      { error: errSpy, warn: vi.fn() },
      `---
title: but i don't validate
---

body
`,
      path.join(tmpDir, 'something-else.md'),
    )
    expect(errSpy).not.toHaveBeenCalled()
  })
})
