/**
 * Regression: `imagePlugin` `?optimize` / `?component` must resolve the
 * import the way Vite resolves `?url` — importer-relative + alias-aware —
 * not via cwd/`public` string math.
 *
 * Pre-fix bugs (reported on bokisch.com, @pyreon/zero@0.19.0):
 *  - `import x from './img.png?optimize'` → `load()` resolved against
 *    cwd (project root), not the importer's dir → ENOENT for the
 *    documented src-tree pattern.
 *  - `import x from '~/assets/img.png?optimize'` (alias) → arrived
 *    already-absolute and got `join(root,'public',abs)`-doubled.
 *
 * Fix: `resolveId` resolves via `this.resolve(bare, importer)` and
 * carries the ABSOLUTE path through the virtual id; `load` trusts an
 * existing absolute path and only falls back to `public/` for an
 * unresolved leading-slash web path.
 *
 * Sharp-free by construction: asserts the resolveId contract directly,
 * and exercises `load` through the SVG `?component` branch (no sharp).
 */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imagePlugin } from '../image-plugin'

let tmp: string
let importer: string

// Faithful stand-in for Vite's resolver: relative → importer-relative,
// `~img/*` alias → src/images, leading-slash public path → unresolved
// (null), exactly as Vite behaves for these shapes.
const ctx = {
  async resolve(source: string, from?: string) {
    if (source.startsWith('~img/')) {
      return { id: join(tmp, 'src/images', source.slice('~img/'.length)) }
    }
    if (source.startsWith('.') && from) {
      return { id: resolve(dirname(from), source) }
    }
    return null // `/logo.png` (public) — not a module, like Vite
  },
}

function makePlugin(svg = false) {
  const p: any = imagePlugin(svg ? { svg: true } : {})
  p.configResolved({ root: tmp, build: { outDir: 'dist' }, command: 'serve' })
  return p
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pyreon-imgresolve-'))
  await mkdir(join(tmp, 'src/components'), { recursive: true })
  await mkdir(join(tmp, 'src/images'), { recursive: true })
  importer = join(tmp, 'src/components/Hero.tsx')
  await writeFile(importer, '// importer')
  // 1x1 PNG + a real SVG so existsSync() in load() is meaningful.
  await writeFile(
    join(tmp, 'src/images/hero.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await writeFile(
    join(tmp, 'src/images/logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#6d28d9"/></svg>',
  )
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('imagePlugin resolveId — importer-relative + alias (regression)', () => {
  it('relative ?optimize carries the resolved ABSOLUTE path (not the raw ./id)', async () => {
    const p = makePlugin()
    const out = await p.resolveId.call(ctx, '../images/hero.png?optimize', importer)
    expect(out).toBe(
      `\0virtual:zero-image:${join(tmp, 'src/images/hero.png')}?optimize`,
    )
    // pre-fix this was `\0virtual:zero-image:../images/hero.png?optimize`
    expect(out).not.toContain('virtual:zero-image:../')
  })

  it('aliased ?optimize carries the resolved ABSOLUTE path (no public/ doubling)', async () => {
    const p = makePlugin()
    const out = await p.resolveId.call(ctx, '~img/hero.png?optimize', importer)
    expect(out).toBe(
      `\0virtual:zero-image:${join(tmp, 'src/images/hero.png')}?optimize`,
    )
    expect(out).not.toContain('~img/')
  })

  it('unresolved public web path (/logo.png?optimize) is preserved for the public/ fallback', async () => {
    const p = makePlugin()
    const out = await p.resolveId.call(ctx, '/logo.png?optimize', importer)
    // this.resolve → null, so the original id is kept; load() then
    // applies its `join(root,'public',…)` fallback (still correct).
    expect(out).toBe('\0virtual:zero-image:/logo.png?optimize')
  })

  it('load() resolves a relative ?component SVG via the carried abs path (sharp-free e2e)', async () => {
    const p = makePlugin(true)
    const vid = await p.resolveId.call(ctx, '../images/logo.svg?component', importer)
    expect(vid).toBe(
      `\0virtual:zero-svg:${join(tmp, 'src/images/logo.svg')}?component`,
    )
    const mod = await p.load.call(ctx, vid)
    // pre-fix: load() computed `../images/logo.svg` vs cwd → existsSync
    // false → returned null. Post-fix: carried abs path → reads file.
    expect(mod).not.toBeNull()
    expect(String(mod)).toContain('SvgComponent')
    // Proves it read THE fixture file: the `0 0 8 8` viewBox value is
    // unique to the fixture and survives both the plugin's documented
    // fill→currentColor rewrite AND the JSON.stringify quote-escaping.
    expect(String(mod)).toContain('0 0 8 8')
  })
})

describe('imagePlugin loadDevImage — dev serves /@fs/ for absolute paths (regression)', () => {
  // `placeholder: 'none'` keeps this sharp-free (the default 'blur'
  // would pull sharp into loadDevImage's generatePlaceholder).
  const devPlugin = () => {
    const p: any = imagePlugin({ placeholder: 'none' })
    p.configResolved({ root: tmp, build: { outDir: 'dist' }, command: 'serve' })
    return p
  }
  // The imagePlugin's emitDescriptor() wraps the descriptor JSON with
  // toString/valueOf/Symbol.toPrimitive helpers so the imported module
  // coerces to its URL in string contexts. We just need the JSON object
  // back for this test's assertions — extract it from the `const _d = ...`
  // literal that emitDescriptor() always emits first.
  const parse = (mod: string) => {
    const s = String(mod)
    const m = /^const _d = (\{[\s\S]*?\});\n/.exec(s)
    if (!m) throw new Error(`emitDescriptor() shape changed; could not extract descriptor JSON from:\n${s.slice(0, 200)}`)
    return JSON.parse(m[1]!) as {
      src: string
      sources: { src: string }[]
    }
  }

  it('relative import → src is /@fs/<abs>, NOT the raw filesystem path', async () => {
    const p = devPlugin()
    const vid = await p.resolveId.call(ctx, '../images/hero.png?optimize', importer)
    const abs = join(tmp, 'src/images/hero.png')
    expect(vid).toBe(`\0virtual:zero-image:${abs}?optimize`)

    const parsed = parse(String(await p.load.call(ctx, vid)))
    // THE BUG: pre-fix `src` was the bare `${abs}` (e.g.
    // `/Users/…/hero.png`) because `rawPath.startsWith('/')` is true for
    // an absolute fs path → the browser fetched
    // `http://host/Users/…/hero.png` → 404 in dev. Post-fix it must be
    // routed through Vite's `/@fs/` prefix.
    expect(parsed.src).toBe(`/@fs/${abs}`)
    expect(parsed.src).not.toBe(abs)
    expect(parsed.sources[0]?.src).toBe(`/@fs/${abs}`)
  })

  it('public-dir web path (/logo.png) is still served as-is — not over-corrected to /@fs/', async () => {
    await mkdir(join(tmp, 'public'), { recursive: true })
    await writeFile(
      join(tmp, 'public/logo.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    const p = devPlugin()
    const vid = await p.resolveId.call(ctx, '/logo.png?optimize', importer)
    expect(vid).toBe('\0virtual:zero-image:/logo.png?optimize')

    const parsed = parse(String(await p.load.call(ctx, vid)))
    // Not a real fs file → public-dir web path → served at the web root
    // unchanged (Vite serves `public/` at `/`). The fix must NOT rewrite
    // this to `/@fs/<root>/public/logo.png`.
    expect(parsed.src).toBe('/logo.png')
  })
})
