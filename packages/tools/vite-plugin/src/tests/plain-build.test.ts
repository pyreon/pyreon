// @vitest-environment happy-dom
/**
 * Plain Mode — REAL `vite build` end-to-end.
 *
 * The other plain-mode specs drive the transform hook directly with a mocked
 * plugin context. This one is the production shape: a committed fixture app
 * (a `'use plain'` `.ts` store + a `.tsx` component importing it) is built by
 * an in-process `vite.build()` with the real plugin — buildStart pre-scan,
 * cross-module signal resolution, plain pre-pass, JSX transform, bundling —
 * and the EMITTED BUNDLE is then executed in happy-dom: mount, click,
 * early-return flip, effect log. If any layer of the pipeline mis-composes,
 * this is the spec that sees it.
 *
 * Lib-needing (the build resolves `@pyreon/*` via the node condition → `lib/`),
 * like the rocketstyle-collapse suite in this package.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pyreon from '../index'

const FIXTURE = join(import.meta.dirname, '__fixtures__/plain-app')

// bun's isolated store exposes only this package's DECLARED deps to the
// fixture dir, so the app's `@pyreon/*` imports are aliased to the built
// workspace `lib/` — the same node-condition artifacts a real consumer gets.
// Array form, EXACT subpaths first: a bare `@pyreon/core` find would
// prefix-match `@pyreon/core/plain` and rewrite it into lib/index.js/plain.
const PKGS = join(import.meta.dirname, '../../../..')
const ALIASES = [
  { find: '@pyreon/core/plain', replacement: join(PKGS, 'core/core/lib/plain.js') },
  { find: '@pyreon/core/jsx-runtime', replacement: join(PKGS, 'core/core/lib/jsx-runtime.js') },
  { find: '@pyreon/core/jsx-dev-runtime', replacement: join(PKGS, 'core/core/lib/jsx-dev-runtime.js') },
  { find: '@pyreon/core', replacement: join(PKGS, 'core/core/lib/index.js') },
  { find: '@pyreon/runtime-dom', replacement: join(PKGS, 'core/runtime-dom/lib/index.js') },
  { find: '@pyreon/reactivity', replacement: join(PKGS, 'core/reactivity/lib/index.js') },
]

let outDir: string
let bundlePath: string
let bundleSource: string

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'pyreon-plain-build-'))
  await build({
    root: FIXTURE,
    logLevel: 'silent',
    resolve: { alias: ALIASES },
    plugins: [pyreon()],
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: join(FIXTURE, 'src/main.ts'),
        formats: ['cjs'],
        fileName: 'plain-app',
      },
    },
  })
  bundlePath = join(outDir, 'plain-app.cjs')
  bundleSource = readFileSync(bundlePath, 'utf-8')
}, 120_000)

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

describe('plain-mode fixture through a real vite build', () => {
  it('the bundle carries no plain markers — the dialect fully compiled away', () => {
    expect(bundleSource).not.toContain('@pyreon/core/plain')
    expect(bundleSource).not.toContain('use plain')
    // The did-not-compile guard must not be reachable from this bundle.
    expect(bundleSource).not.toContain('reached the runtime')
  })

  it('the emitted wiring is classic Pyreon', () => {
    expect(bundleSource).toMatch(/\.set\(/)
  })

  it('the executed bundle mounts, flips the early return, clicks, and logs the effect', async () => {
    // Node's REAL require, not vitest's module runner — the bundle is a
    // self-contained CJS artifact in a temp dir the runner will not resolve.
    const require = createRequire(import.meta.url)
    const mod = require(bundlePath) as {
      boot: (el: HTMLElement) => void
      bump: () => void
      finish: () => void
      effectLog: Array<number | string>
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    mod.boot(container)

    // Early return: component-body state pins the loading branch until flipped.
    expect(container.querySelector('p.loading')).not.toBeNull()
    mod.finish()
    expect(container.querySelector('p.loading')).toBeNull()
    const btn = container.querySelector('#bump') as HTMLElement & {
      __ev_click?: (e: unknown) => void
    }
    expect(btn).not.toBeNull()
    expect(btn.textContent).toBe('0')

    // Cross-module write through the plain store's exported setter.
    mod.bump()
    expect(btn.textContent).toBe('1')
    // Destructured props in <Row> stay live through the derived chain.
    expect(container.querySelector('li.row')!.textContent).toBe('double: 2')

    // The compiled click handler drives the same signal.
    btn.__ev_click?.({ target: btn })
    expect(btn.textContent).toBe('2')
    expect(container.querySelector('li.row')!.textContent).toBe('double: 4')

    // Total tracking: the first effect run took the 'idle' branch and never
    // read `double` — the subscription must exist anyway, so both bumps
    // re-ran it with the derived value.
    expect(mod.effectLog[0]).toBe('idle')
    expect(mod.effectLog).toContain(2)
    expect(mod.effectLog).toContain(4)
  })
})
