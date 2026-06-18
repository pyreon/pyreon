/**
 * Regression: the closeBundle search-index emission must resolve its output
 * directory correctly when `build.outDir` is ABSOLUTE — the shape produced by
 * @pyreon/zero's INNER SSG server build (`dist/.zero-ssg-server/`) — and must
 * skip entirely during that inner build (the outer client build owns the
 * index).
 *
 * Before the fix, `path.join(root, build.outDir)` concatenated an absolute
 * `build.outDir` onto `root`, writing the index to a doubled
 * `<root>/<root>/dist/.zero-ssg-server/…` path; and the inner build re-emitted
 * the index uselessly because nothing gated on PYREON_ZERO_SSG_INNER_BUILD.
 */
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../plugin'

// Workspace-local tmp dir (Bun's dynamic-import resolver rejects /tmp).
const WORKSPACE_TMP_ROOT = path.join(process.cwd(), 'src', 'tests', '__tmp__')

describe('content() closeBundle — search-index outDir resolution', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(WORKSPACE_TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(WORKSPACE_TMP_ROOT, 'zc-outdir-'))
    delete process.env.PYREON_ZERO_SSG_INNER_BUILD
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    delete process.env.PYREON_ZERO_SSG_INNER_BUILD
  })

  // Set up a consumer project with a `docs` (pages) collection + one page,
  // drive configResolved with an ABSOLUTE build.outDir, and populate the
  // per-collection search entries by transforming the page.
  async function setup(absOutDir: string) {
    await fs.mkdir(path.join(tmpDir, 'src', 'content', 'docs'), {
      recursive: true,
    })
    // A minimal pass-through Standard Schema — loadConfig requires every
    // collection to declare one.
    await fs.writeFile(
      path.join(tmpDir, 'content.config.js'),
      `export default { collections: { docs: { type: 'pages', schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => ({ value: v }) } } } } }`,
      'utf8',
    )
    const docFile = path.join(tmpDir, 'src', 'content', 'docs', 'hello.md')
    const body = `---\ntitle: Hello\n---\n\nSome searchable body text.\n`
    await fs.writeFile(docFile, body, 'utf8')

    // Vite creates the build outDir before closeBundle; the index writer
    // doesn't mkdir. Create BOTH the resolved dir AND the would-be doubled
    // dir so a write to either is observable (and the bisect is clean: old
    // `path.join` code writes to `doubled`, the fixed `path.resolve` to
    // `absOutDir`).
    await fs.mkdir(absOutDir, { recursive: true })
    await fs.mkdir(path.join(tmpDir, absOutDir), { recursive: true })

    const plugin = content({ highlight: false, mdxDir: tmpDir, compileJsx: false })
    const configResolved = plugin.configResolved as (
      this: unknown,
      config: unknown,
    ) => Promise<void>
    await configResolved.call({} as never, {
      root: tmpDir,
      command: 'build',
      base: '/',
      build: { outDir: absOutDir },
      logger: { warn: vi.fn() },
    })

    const transform = plugin.transform as (
      this: { error: (m: string) => void; warn: (m: string) => void },
      code: string,
      id: string,
    ) => Promise<unknown>
    await transform.call({ error: vi.fn(), warn: vi.fn() }, body, docFile)

    return plugin
  }

  const runCloseBundle = (plugin: ReturnType<typeof content>) =>
    (
      plugin.closeBundle as (this: {
        warn: (m: string) => void
        error: (m: string) => void
      }) => Promise<void>
    ).call({ warn: vi.fn(), error: vi.fn() })

  it('writes the index to the RESOLVED absolute outDir, not a doubled path', async () => {
    const absOutDir = path.join(tmpDir, 'dist', '.zero-ssg-server')
    const plugin = await setup(absOutDir)
    await runCloseBundle(plugin)

    // Lands at the resolved absolute outDir …
    expect(existsSync(path.join(absOutDir, 'search-index.json'))).toBe(true)
    // … and NOT at the old doubled `path.join(root, absOutDir)` location.
    const doubled = path.join(tmpDir, absOutDir) // join(root, absOutDir) === the bug
    expect(existsSync(path.join(doubled, 'search-index.json'))).toBe(false)
  })

  it('skips emission entirely during the inner SSG build', async () => {
    const absOutDir = path.join(tmpDir, 'dist', '.zero-ssg-server')
    const plugin = await setup(absOutDir)
    process.env.PYREON_ZERO_SSG_INNER_BUILD = '1'
    await runCloseBundle(plugin)

    const doubled = path.join(tmpDir, absOutDir)
    expect(existsSync(path.join(absOutDir, 'search-index.json'))).toBe(false)
    expect(existsSync(path.join(doubled, 'search-index.json'))).toBe(false)
  })
})
