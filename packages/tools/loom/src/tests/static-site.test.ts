/**
 * `loom build` — the static-site emit.
 *
 * The expensive assertions here are the ones a green build would otherwise
 * hide. zero's SSG summary reports pages ATTEMPTED, not pages that rendered:
 * the run that produced a 356-byte empty `index.html` still printed
 * "5 prerendered pages" and exited 0. So these specs read the emitted FILES
 * and assert real content, never the build's own report of itself.
 *
 * The build is slow (a full Vite + SSG pass), so it runs ONCE for the whole
 * file and every spec reads its output.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDir, NO_BUILD_DEPS } from '../build/static-site'

const VIEWS = ['matrix', 'cycles', 'impact', 'manifests'] as const

describe('appDir', () => {
  it('locates the bundled zero app from THIS module, not from cwd', () => {
    // The scanned project does not depend on loom, so a bare specifier
    // resolves nowhere — the app has to be found relative to the install.
    const dir = appDir()
    expect(existsSync(join(dir, 'index.html'))).toBe(true)
    expect(existsSync(join(dir, 'src', 'routes', 'index.tsx'))).toBe(true)
  })

  it('ships a route file per view, so each gets its own URL', () => {
    const routes = join(appDir(), 'src', 'routes')
    for (const v of VIEWS) expect(existsSync(join(routes, `${v}.tsx`))).toBe(true)
  })
})

describe('the missing-dependency message', () => {
  it('names every package and says scan needs none of them', () => {
    // `loom scan` is the CI gate; the whole optional-peer design exists so it
    // keeps working with none of these installed.
    for (const pkg of ['vite', '@pyreon/vite-plugin', '@pyreon/zero']) {
      expect(NO_BUILD_DEPS).toContain(pkg)
    }
    expect(NO_BUILD_DEPS).toMatch(/loom scan.*does not need/s)
  })
})

// The full build is gated on the toolchain being present — but a skipped
// suite must never masquerade as coverage, so the guard is asserted below.
const CAN_BUILD = (() => {
  try {
    require.resolve('vite')
    return true
  } catch {
    return false
  }
})()

const PKG_ROOT = resolve(__dirname, '..', '..')
const BIN = join(PKG_ROOT, 'bin', 'loom.js')
// The spawn resolves the BUILT `lib/`, not `src/` — an edit to
// `src/build/static-site.ts` is invisible here until `bun scripts/bootstrap.ts`
// runs. Bisect this file as: edit source → bootstrap → run.
const BUILT = existsSync(join(PKG_ROOT, 'lib', 'cli.js'))

describe.skipIf(!CAN_BUILD || !BUILT)('the emitted site', () => {
  let out: string
  let built = false

  beforeAll(() => {
    // SPAWNED, and the inherited environment is deliberately left ALONE.
    //
    // vitest sets `NODE_ENV=test`, which a child inherits, and Vite derives
    // `isProduction` from NODE_ENV. So this spawn runs `loom build` under the
    // exact hostile condition the build now defends against — which is the
    // point: `buildStaticSite` forces NODE_ENV=production, and sanitising the
    // env here would MASK a regression of that fix instead of catching it.
    // The "is a PRODUCTION build" spec below is what reads the verdict.
    //
    // Spawning rather than importing matters for two reasons:
    //
    // 1. Memory. Before the build forced NODE_ENV, this suite peaked at
    //    ~3.9 GB — just under node's ~4 GB old-space cap — so under `Coverage
    //    (Full)` (4 packages in parallel) the worker died. vitest attributes a
    //    dead worker to whichever spec was in flight, which is how this
    //    surfaced as a `STACK_TRACE_ERROR` in `strip-equivalence`, the
    //    longest-running spec in the package and entirely innocent. A child
    //    process also hands its memory back on exit.
    //
    // 2. `loom build` is what a consumer runs. Calling `buildStaticSite`
    //    directly skips the bin, the arg parsing and the built `lib/` — the
    //    surface this repo has already shipped a total no-op through once
    //    (`pyreon-lint` 0.43.0). See testing.md "Test the shipped ENTRY".
    //
    // Per the subprocess discipline: assert the EXIT CODE, never stdout. The
    // real assertions read the emitted files off disk, which is deterministic.
    out = join(tmpdir(), `loom-site-test-${process.pid}`)
    const repoRoot = join(appDir(), '..', '..', '..', '..')
    execFileSync('node', [BIN, 'build', repoRoot, `--out=${out}`], { stdio: 'pipe' })
    built = true
  }, 240_000)

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true })
  })

  it('built at all', () => {
    expect(built).toBe(true)
  })

  it('emits a page per view, each with REAL prerendered content', () => {
    // Not "the file exists" and not the build's own count: the failure this
    // guards against emitted all five files, one of them a 356-byte shell.
    for (const path of ['index.html', ...VIEWS.map((v) => `${v}/index.html`)]) {
      const file = join(out, path)
      expect(existsSync(file), `${path} missing`).toBe(true)
      const html = readFileSync(file, 'utf8')
      expect(html, `${path} has no rendered canvas`).toContain('data-testid="loom-canvas"')
      expect(html.length, `${path} is a shell`).toBeGreaterThan(10_000)
    }
  })

  it('records no prerender errors', () => {
    // zero writes this artifact and still exits 0, so nothing surfaces a
    // failed page unless something reads it.
    const errors = join(out, '_pyreon-ssg-errors.json')
    if (!existsSync(errors)) return
    const parsed = JSON.parse(readFileSync(errors, 'utf8')) as { errors?: unknown[] }
    expect(parsed.errors ?? []).toEqual([])
  })

  it('the view tabs are real links, which is what makes the URLs mean anything', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toContain('href="/matrix"')
    expect(html).toContain('href="/cycles"')
  })

  it('bakes the report in rather than fetching it — the output works from file://', () => {
    const html = readFileSync(join(out, 'cycles', 'index.html'), 'utf8')
    expect(html).not.toContain('/@loom/report.json')
  })

  it('is a PRODUCTION build even though the spawn inherited NODE_ENV=test', () => {
    // The regression lock for `buildStaticSite`'s NODE_ENV override, and the
    // reason the spawn above does not sanitise its environment.
    //
    // `vite build` only sets NODE_ENV when it is UNSET, so a stray value from
    // the caller's shell (vitest's `test` here, `development` for a real user)
    // makes Vite build non-production and every
    // `process.env.NODE_ENV !== 'production'` branch in Pyreon ships. Measured
    // cost on this build: 3894 MB against 952 MB, which is what took the
    // package over node's ~4 GB cap and killed the `Coverage (Full)` worker —
    // and, worse, it meant every spec in this file asserted on a build no
    // consumer ever gets.
    //
    // The observable is a core dev-only lifecycle warning: emitted in a
    // non-production build, folded away in a production one.
    const dir = join(out, 'assets')
    const js = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('')
    // An empty corpus must not read as a pass.
    expect(js.length).toBeGreaterThan(10_000)
    expect(js).not.toContain('called outside component setup')
  })
})

describe('the build guard', () => {
  it('vite IS resolvable here — the specs above are not silently skipped', () => {
    expect(CAN_BUILD).toBe(true)
  })

  it('the built lib IS present — the spawned build is not silently skipped', () => {
    // Both halves of the skipIf get asserted, or a missing `lib/` would turn
    // the whole emitted-site suite into a green no-op. Run
    // `bun scripts/bootstrap.ts` if this fails.
    expect(BUILT).toBe(true)
  })
})
