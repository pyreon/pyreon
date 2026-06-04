/**
 * Plugin-lifecycle tests for `?font` import plugin.
 *
 * Drives `resolveId` + `load` directly against an in-memory fixture
 * dir (mirrors `image-plugin-resolve.test.ts`'s pattern — no sharp,
 * no real Vite). Asserts:
 *   - resolveId catches `?font` queries + carries the absolute path
 *   - load returns descriptor JS + side-effect CSS import
 *   - load handles the CSS virtual id (returns @font-face string)
 *   - dev mode → `/@fs/` src; build mode → `emitFile(<asset>)`
 *   - filename-inferred meta vs query-override precedence
 */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fontImportPlugin } from '../font-import-plugin'

let tmp: string
let importer: string

// Faithful Vite resolver stand-in (mirrors image-plugin-resolve.test.ts).
const ctx = {
  async resolve(source: string, from?: string) {
    if (source.startsWith('.') && from) {
      return { id: resolve(dirname(from), source) }
    }
    return null
  },
  emitFile(opts: { type: string; fileName: string; source: Buffer | Uint8Array }) {
    return `mock-handle-${opts.fileName}`
  },
}

function makePlugin(mode: 'build' | 'serve' = 'build') {
  const p: any = fontImportPlugin()
  p.configResolved({ root: tmp, build: { outDir: 'dist' }, command: mode })
  return p
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pyreon-fontimport-'))
  await mkdir(join(tmp, 'src/components'), { recursive: true })
  await mkdir(join(tmp, 'src/fonts'), { recursive: true })
  importer = join(tmp, 'src/components/Hero.tsx')
  await writeFile(importer, '// importer')
  // Write a small fixture font file (just bytes — we don't parse it).
  await writeFile(join(tmp, 'src/fonts/display-bold.woff2'), 'FAKE_WOFF2_CONTENT_DISPLAY_BOLD')
  await writeFile(join(tmp, 'src/fonts/inter-700.woff2'), 'FAKE_WOFF2_CONTENT_INTER_700')
  await writeFile(join(tmp, 'src/fonts/serif-italic.ttf'), 'FAKE_TTF_CONTENT_SERIF_ITALIC')
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('fontImportPlugin.resolveId', () => {
  it('catches `?font` query + carries absolute path', async () => {
    const p = makePlugin()
    const id = await p.resolveId.call(ctx, '../fonts/display-bold.woff2?font', importer)
    expect(id).toBe(
      `\0virtual:zero-font:${join(tmp, 'src/fonts/display-bold.woff2')}?font`,
    )
  })

  it('preserves query overrides (family/weight/style)', async () => {
    const p = makePlugin()
    const id = await p.resolveId.call(
      ctx,
      '../fonts/display-bold.woff2?font&family=Display&weight=900',
      importer,
    )
    expect(id).toBe(
      `\0virtual:zero-font:${join(tmp, 'src/fonts/display-bold.woff2')}?font&family=Display&weight=900`,
    )
  })

  it('ignores non-font imports (passes through)', async () => {
    const p = makePlugin()
    expect(await p.resolveId.call(ctx, '../foo.ts', importer)).toBeNull()
    expect(await p.resolveId.call(ctx, '../image.png?optimize', importer)).toBeNull()
  })

  it('ignores unknown font extensions', async () => {
    const p = makePlugin()
    const id = await p.resolveId.call(ctx, '../fonts/x.xyz?font', importer)
    expect(id).toBeNull()
  })

  it('accepts all five supported extensions', async () => {
    const p = makePlugin()
    for (const ext of ['woff2', 'woff', 'ttf', 'otf', 'eot']) {
      const id = await p.resolveId.call(ctx, `../fonts/x.${ext}?font`, importer)
      expect(id).toContain('\0virtual:zero-font:')
    }
  })

  it('returns CSS virtual ids as-is so they reach load()', async () => {
    const p = makePlugin()
    const cssId = '\0virtual:zero-font-face:/abs/x.woff2'
    expect(await p.resolveId.call(ctx, cssId)).toBe(cssId)
  })
})

describe('fontImportPlugin.load — main module', () => {
  it('build mode → emits hashed asset + returns descriptor JS', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(ctx, '../fonts/display-bold.woff2?font', importer)
    const mod = await p.load.call(ctx, vid)
    expect(mod).toContain('import "\\u0000virtual:zero-font-face:')
    expect(mod).toContain('"family":"display"')
    expect(mod).toContain('"weight":700') // 'bold' keyword
    expect(mod).toContain('"style":"normal"')
    expect(mod).toContain('"type":"font/woff2"')
    // In build mode, src is a Vite asset placeholder.
    expect(mod).toContain('__VITE_ASSET__')
  })

  it('dev mode → src is /@fs/<abs>', async () => {
    const p = makePlugin('serve')
    const vid = await p.resolveId.call(ctx, '../fonts/display-bold.woff2?font', importer)
    const mod = await p.load.call(ctx, vid)
    const abs = join(tmp, 'src/fonts/display-bold.woff2')
    expect(mod).toContain(`/@fs/${abs}`)
    expect(mod).not.toContain('__VITE_ASSET__')
  })

  it('descriptor exports default + has frozen toString/valueOf shape', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(ctx, '../fonts/display-bold.woff2?font', importer)
    const mod = await p.load.call(ctx, vid)
    expect(mod).toContain('export default Object.freeze(_d)')
    expect(mod).toContain('toString')
    expect(mod).toContain('valueOf')
    expect(mod).toContain('Symbol.toPrimitive')
  })

  it('filename inference: inter-700.woff2 → family=inter, weight=700', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(ctx, '../fonts/inter-700.woff2?font', importer)
    const mod = await p.load.call(ctx, vid)
    expect(mod).toContain('"family":"inter"')
    expect(mod).toContain('"weight":700')
    expect(mod).toContain('"style":"normal"')
  })

  it('filename inference: serif-italic.ttf → family=serif, style=italic, type=font/ttf', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(ctx, '../fonts/serif-italic.ttf?font', importer)
    const mod = await p.load.call(ctx, vid)
    expect(mod).toContain('"family":"serif"')
    expect(mod).toContain('"style":"italic"')
    expect(mod).toContain('"type":"font/ttf"')
  })

  it('query overrides: ?font&family=Custom&weight=500&style=italic wins over filename', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(
      ctx,
      '../fonts/display-bold.woff2?font&family=Custom&weight=500&style=italic',
      importer,
    )
    const mod = await p.load.call(ctx, vid)
    expect(mod).toContain('"family":"Custom"')
    expect(mod).toContain('"weight":500')
    expect(mod).toContain('"style":"italic"')
  })

  it('descriptor includes the @font-face string', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(ctx, '../fonts/inter-700.woff2?font', importer)
    const mod = await p.load.call(ctx, vid)
    expect(mod).toContain('@font-face')
    expect(mod).toContain("font-family: 'inter'")
    expect(mod).toContain('font-weight: 700')
  })
})

describe('fontImportPlugin.load — CSS virtual', () => {
  it('returns @font-face rule for the CSS virtual id paired with a loaded ?font module', async () => {
    const p = makePlugin('build')
    // First, load the main module so the entry is registered.
    const mainVid = await p.resolveId.call(ctx, '../fonts/display-bold.woff2?font', importer)
    await p.load.call(ctx, mainVid)
    // Then load the CSS virtual id.
    const abs = join(tmp, 'src/fonts/display-bold.woff2')
    const cssId = `\0virtual:zero-font-face:${abs}`
    const css = await p.load.call(ctx, cssId)
    expect(css).toContain('@font-face {')
    expect(css).toContain("font-family: 'display';")
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain('font-display: swap;')
    expect(css).toContain("format('woff2')")
  })

  it('returns null for an unloaded CSS virtual id (defensive)', async () => {
    const p = makePlugin('build')
    const css = await p.load.call(ctx, '\0virtual:zero-font-face:/nonexistent.woff2')
    expect(css).toBeNull()
  })
})

describe('fontImportPlugin error handling', () => {
  it('throws a clear error when the source file does not exist', async () => {
    const p = makePlugin('build')
    const vid = await p.resolveId.call(ctx, '../fonts/missing.woff2?font', importer)
    // load() is sync, so the throw is synchronous — use the sync assertion.
    expect(() => p.load.call(ctx, vid)).toThrow(/font file not found/)
  })
})
