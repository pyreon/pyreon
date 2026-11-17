#!/usr/bin/env bun
/**
 * Site visual sweep — pixel proof that a pyreon.dev change moved (or did not
 * move) what the site paints.
 *
 *   capture: serve a built site (`docs/dist`, or `--build` to build it first),
 *            and screenshot a fixed page list at 320 / 375 / 768 / 1280 px in
 *            the light and the dark theme into a folder, one PNG per shot.
 *   compare: diff two capture folders and print only the shots that changed,
 *            with the number of differing pixels; `--diff <dir>` also writes a
 *            diff image (changed pixels in magenta over a faded copy).
 *
 * Determinism: software raster with a fixed colour profile, reduced motion
 * (the scroll reveals stay in their final state), every animation and
 * transition off, videos paused at their first frame, the caret hidden, lazy
 * images loaded eagerly and decoded, fonts loaded, load/idle islands (and
 * those in the first viewport) hydrated, one device pixel per CSS pixel, each
 * shot repeated until two in a row match, and a fixed content date for the
 * build (`PYREON_CONTENT_NOW`). Compare two captures made on the SAME machine (font
 * rasterisation differs between macOS and Linux): build the base, capture,
 * build the change, capture, compare. Two captures of one build compare clean
 * (that is the noise check; run it once when the page list changes).
 *
 * Usage:
 *   bun scripts/site-visual-sweep.ts capture --out <dir> [--build] [--dist docs/dist] [--port 5299]
 *        [--pages /,/docs] [--widths 320,1280] [--themes light,dark]
 *   bun scripts/site-visual-sweep.ts compare <before-dir> <after-dir> [--diff <dir>]
 *
 * Exit code: capture 0 when every shot was written; compare 0 when nothing
 * changed, 1 when a shot changed or is missing on one side.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

const REPO = resolve(import.meta.dirname, '..')
const DOCS = join(REPO, 'docs')

/**
 * Every page TYPE of the site: each marketing template once, the kit gallery
 * (every kit component), the 404, and a docs sample (home, a guide, a package
 * overview with a demo, a generated reference page).
 */
export const SWEEP_PAGES: readonly string[] = [
  '/',
  '/products',
  '/products/form',
  '/products/charts',
  '/benchmarks',
  '/why/components-run-once',
  '/compare/react',
  '/migrate',
  '/migrate/react',
  '/releases',
  '/status',
  '/community',
  '/brand',
  '/brand/kit',
  '/blog',
  '/blog/components-run-once',
  '/blog/tags/ai',
  '/showcase',
  '/open',
  '/404.html',
  '/docs',
  '/docs/getting-started',
  '/docs/reactivity',
  '/docs/form',
  '/docs/reference/core',
]
export const SWEEP_WIDTHS: readonly number[] = [320, 375, 768, 1280]
export const SWEEP_THEMES: readonly ('light' | 'dark')[] = ['light', 'dark']

/** File name of one shot: `<page>@<width>-<theme>.png` with the path flattened. */
export function shotName(path: string, width: number, theme: string): string {
  const slug = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\.html$/, '').replace(/\//g, '__')
  return `${slug}@${width}-${theme}.png`
}

/**
 * Chromium flags for repeatable pixels: software raster without partial
 * re-raster, a fixed colour profile, no LCD text. Without them the glass nav's
 * anti-aliased edges over its translucent background differ by one colour
 * level between two paints of the same page.
 */
export const DETERMINISTIC_ARGS = ['--disable-gpu', '--disable-partial-raster', '--force-color-profile=srgb', '--disable-skia-runtime-opts', '--disable-lcd-text'] as const

/** Injected before every shot: no motion, no caret, no scrollbar. */
const FREEZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
html{scrollbar-width:none}`

/**
 * Islands that hydrate on load or idle, and `visible` ones in the first
 * viewport, re-render once they are live (the nav's theme button does). Wait
 * for each to report hydrated (or broken); below-the-fold islands stay asleep,
 * the same in every capture.
 */
async function waitForEagerIslands(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('pyreon-island')).every((el) => {
          if (el.hasAttribute('data-island-hydrated') || el.hasAttribute('data-island-error')) return true
          const how = el.getAttribute('data-hydrate')
          if (how === 'idle' || how === 'load') return false
          if (how !== 'visible') return true
          const r = (el.firstElementChild ?? el).getBoundingClientRect()
          return r.height === 0 || r.top >= window.innerHeight || r.bottom <= 0
        }),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => console.warn(`[visual-sweep] ${page.url()}: an island did not hydrate within 15 s; shooting anyway`))
}

async function settle(page: Page): Promise<void> {
  await waitForEagerIslands(page)
  await page.addStyleTag({ content: FREEZE_CSS })
  await page.evaluate(() => {
    // A browser may paint any srcset candidate (it prefers one it has cached),
    // so the same page shows a sharper or softer image from run to run. Pin
    // every responsive image to its largest candidate.
    for (const el of Array.from(document.querySelectorAll<HTMLSourceElement | HTMLImageElement>('source[srcset], img[srcset]'))) {
      const largest = el.srcset.split(',').map((c) => c.trim()).at(-1)
      if (largest) el.srcset = largest
    }
    for (const img of Array.from(document.images)) img.loading = 'eager'
    for (const v of Array.from(document.querySelectorAll('video'))) {
      v.pause()
      v.currentTime = 0
    }
  })
  // The lazy images just switched to eager start loading now.
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => null)))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
}

/** Screenshot until two consecutive shots are identical (at most 4 tries), the way `toHaveScreenshot` settles. */
async function stableShot(page: Page, path: string): Promise<boolean> {
  const shoot = () => page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' })
  let prev = await shoot()
  for (let i = 0; i < 3; i++) {
    const next = await shoot()
    if (next.equals(prev)) {
      writeFileSync(path, next)
      return true
    }
    prev = next
  }
  writeFileSync(path, prev)
  return false
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function listArg(args: string[], name: string): string[] | undefined {
  return argValue(args, name)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function build(): void {
  console.log('[visual-sweep] building docs/dist (PYREON_CONTENT_NOW=2099-01-01)…')
  const r = spawnSync('nice', ['-n', '10', 'bunx', 'vite', 'build'], {
    cwd: DOCS,
    stdio: 'inherit',
    env: { ...process.env, PYREON_CONTENT_NOW: '2099-01-01' },
  })
  if (r.status !== 0) throw new Error(`[Pyreon] visual-sweep: the docs build failed (exit ${r.status}). Fix the build, then capture again.`)
}

async function waitForServer(url: string, server: ChildProcess): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`[Pyreon] visual-sweep: the static server exited (${server.exitCode}). Is the port taken? Pass --port.`)
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`[Pyreon] visual-sweep: nothing answered on ${url} within 10 s. Pass a free --port.`)
}

interface CaptureOptions {
  out: string
  dist: string
  port: number
  pages: readonly string[]
  widths: readonly number[]
  themes: readonly ('light' | 'dark')[]
}

async function captureTheme(browser: Browser, theme: 'light' | 'dark', o: CaptureOptions): Promise<number> {
  let written = 0
  const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme })
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('pyreon-theme', t)
    } catch {
      // storage blocked: the OS scheme above still picks the theme
    }
  }, theme)
  const page = await context.newPage()
  for (const width of o.widths) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of o.pages) {
      await page.goto(`http://127.0.0.1:${o.port}${path}`, { waitUntil: 'networkidle' })
      await settle(page)
      if (!(await stableShot(page, join(o.out, shotName(path, width, theme))))) console.warn(`[visual-sweep] ${path} ${width}px ${theme}: never settled; this shot is not proof`)
      written++
    }
    console.log(`[visual-sweep] ${theme} ${width}px: ${o.pages.length} page(s)`)
  }
  await context.close()
  return written
}

async function capture(o: CaptureOptions): Promise<void> {
  if (!existsSync(join(o.dist, 'index.html'))) {
    throw new Error(`[Pyreon] visual-sweep: ${o.dist} has no index.html. Build the site first (--build) or pass --dist <built dir>.`)
  }
  mkdirSync(o.out, { recursive: true })
  const server = spawn('bun', [join(REPO, 'scripts/serve-ssg.ts'), o.dist, String(o.port)], { stdio: 'ignore' })
  const browser = await chromium.launch({ args: [...DETERMINISTIC_ARGS] })
  try {
    await waitForServer(`http://127.0.0.1:${o.port}/`, server)
    let shots = 0
    for (const theme of o.themes) shots += await captureTheme(browser, theme, o)
    writeFileSync(join(o.out, 'sweep.json'), `${JSON.stringify({ pages: o.pages, widths: o.widths, themes: o.themes, shots }, null, 2)}\n`)
    console.log(`[visual-sweep] ${shots} shot(s) in ${o.out}`)
  } finally {
    await browser.close()
    server.kill()
  }
}

export interface ShotDiff {
  name: string
  /** Differing pixels, or -1 when the two shots have different sizes. */
  pixels: number
  size: string
}

/** Count differing pixels of two decoded RGBA buffers of one size; marks them in `out` when given. */
export function countDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, out?: Uint8ClampedArray): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    const same = a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]
    if (!same) n++
    if (!out) continue
    out[i] = same ? 255 - (255 - (a[i] ?? 0)) / 4 : 255
    out[i + 1] = same ? 255 - (255 - (a[i + 1] ?? 0)) / 4 : 0
    out[i + 2] = same ? 255 - (255 - (a[i + 2] ?? 0)) / 4 : 255
    out[i + 3] = 255
  }
  return n
}

/** Decode two PNGs in Chromium (no PNG dependency) and count the differing pixels. */
async function diffPair(page: Page, before: Buffer, after: Buffer, diffPath?: string): Promise<{ pixels: number; size: string; diff?: string }> {
  const res = await page.evaluate(
    async ({ a, b, wantDiff, countSrc }) => {
      const load = async (src: string) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d') as CanvasRenderingContext2D
        ctx.drawImage(img, 0, 0)
        return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) }
      }
      const A = await load(a)
      const B = await load(b)
      const size = `${A.c.width}x${A.c.height} vs ${B.c.width}x${B.c.height}`
      if (A.c.width !== B.c.width || A.c.height !== B.c.height) return { pixels: -1, size }
      const count = new Function(`return ${countSrc}`)() as (x: Uint8ClampedArray, y: Uint8ClampedArray, o?: Uint8ClampedArray) => number
      const out = wantDiff ? A.ctx.createImageData(A.c.width, A.c.height) : undefined
      const pixels = count(A.data.data, B.data.data, out?.data)
      if (!out) return { pixels, size }
      A.ctx.putImageData(out, 0, 0)
      return { pixels, size, diff: A.c.toDataURL('image/png') }
    },
    {
      a: `data:image/png;base64,${before.toString('base64')}`,
      b: `data:image/png;base64,${after.toString('base64')}`,
      wantDiff: diffPath !== undefined,
      countSrc: countDiff.toString(),
    },
  )
  if (diffPath && res.diff) writeFileSync(diffPath, Buffer.from(res.diff.split(',')[1] ?? '', 'base64'))
  return res
}

async function compare(before: string, after: string, diffDir?: string): Promise<number> {
  const pngs = (d: string) => new Set(readdirSync(d).filter((f) => f.endsWith('.png')))
  const A = pngs(before)
  const B = pngs(after)
  const names = [...new Set([...A, ...B])].sort()
  const missing = names.filter((n) => !A.has(n) || !B.has(n))
  if (diffDir) mkdirSync(diffDir, { recursive: true })
  const changed: ShotDiff[] = []
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const name of names.filter((n) => A.has(n) && B.has(n))) {
      const a = readFileSync(join(before, name))
      const b = readFileSync(join(after, name))
      if (a.equals(b)) continue
      const r = await diffPair(page, a, b, diffDir ? join(diffDir, name) : undefined)
      if (r.pixels !== 0) changed.push({ name, pixels: r.pixels, size: r.size })
    }
  } finally {
    await browser.close()
  }
  console.log(`[visual-sweep] ${names.length} shot(s) compared, ${changed.length} changed, ${missing.length} missing on one side`)
  for (const c of changed) console.log(`  ${c.name}  ${c.pixels < 0 ? `size changed (${c.size})` : `${c.pixels} px differ`}`)
  for (const m of missing) console.log(`  ${m}  only in ${A.has(m) ? before : after}`)
  return changed.length + missing.length > 0 ? 1 : 0
}

async function main(): Promise<number> {
  const [mode, ...args] = process.argv.slice(2)
  if (mode === 'compare') {
    const [before, after] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--diff')
    if (!before || !after) throw new Error('[Pyreon] visual-sweep: compare needs two capture folders: compare <before> <after> [--diff <dir>]')
    return compare(resolve(before), resolve(after), argValue(args, '--diff'))
  }
  if (mode !== 'capture') {
    console.error('Usage: bun scripts/site-visual-sweep.ts capture --out <dir> [--build] | compare <before> <after> [--diff <dir>]')
    return 2
  }
  const out = argValue(args, '--out')
  if (!out) throw new Error('[Pyreon] visual-sweep: capture needs --out <dir>.')
  if (args.includes('--build')) build()
  const themes = (listArg(args, '--themes') ?? SWEEP_THEMES).filter((t): t is 'light' | 'dark' => t === 'light' || t === 'dark')
  await capture({
    out: resolve(out),
    dist: resolve(argValue(args, '--dist') ?? join(DOCS, 'dist')),
    port: Number(argValue(args, '--port') ?? 5299),
    pages: listArg(args, '--pages') ?? SWEEP_PAGES,
    widths: (listArg(args, '--widths') ?? SWEEP_WIDTHS.map(String)).map(Number),
    themes,
  })
  return 0
}

if (import.meta.main) process.exit(await main())
