// The ROLLDOWN half of `bundleWebHostScript`. An app that has rolldown but not esbuild (a Vite 8 app whose esbuild was
// pruned) takes this path, and `web-host-bundle.test.ts` never reached it: it resolves from a directory under the repo,
// where esbuild is installed and wins. Here the first resolve directory holds ONLY a link to the repo's real rolldown,
// so the same contracts — one self-contained IIFE, entry-only fallback across directories, a package's own imports
// resolved from that package — are proven against the second bundler.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bundleWebHostScript } from '../web-host-bundle'

// The repo's isolated store keeps rolldown at node_modules/.bun/rolldown@<v>/node_modules/rolldown.
function findRolldown(): string | undefined {
  const store = resolve(__dirname, '../../../../../node_modules/.bun')
  if (!existsSync(store)) return undefined
  const dir = readdirSync(store).find((d) => d.startsWith('rolldown@'))
  const pkg = dir ? join(store, dir, 'node_modules', 'rolldown') : undefined
  return pkg && existsSync(pkg) ? pkg : undefined
}

const rolldownPkg = findRolldown()

describe.skipIf(!rolldownPkg)('bundleWebHostScript through rolldown (no esbuild installed)', () => {
  let root: string
  let bundlerDir: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-webhost-rolldown-'))
    bundlerDir = join(root, 'bundler')
    mkdirSync(join(bundlerDir, 'node_modules'), { recursive: true })
    symlinkSync(rolldownPkg!, join(bundlerDir, 'node_modules', 'rolldown'), 'dir')
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  function addPackage(dir: string, name: string, source: string) {
    const p = join(dir, 'node_modules', name)
    mkdirSync(p, { recursive: true })
    writeFileSync(join(p, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js' }))
    writeFileSync(join(p, 'index.js'), source)
  }

  it('the harness really has no esbuild to fall back on', () => {
    // If esbuild were resolvable here the test below would silently exercise the esbuild path again.
    expect(() => createRequire(join(bundlerDir, 'noop.js')).resolve('esbuild')).toThrow()
  })

  it('bundles an entry to one self-contained IIFE, falling back to a later directory for the entry import', async () => {
    const pkgDir = join(root, 'pkg')
    addPackage(pkgDir, 'fake-engine', `export const Engine = 'engine-via-rolldown'`)
    const out = await bundleWebHostScript({
      source: `import { Engine } from 'fake-engine'; globalThis.__RD = Engine`,
      resolveDirs: [bundlerDir, pkgDir],
      minify: false,
    })
    expect(out).toContain('engine-via-rolldown')
    expect(out).not.toMatch(/\bimport\s*\{/)
    const g = globalThis as { __RD?: string }
    delete g.__RD
    runInThisContext(out)
    expect(g.__RD).toBe('engine-via-rolldown')
  })

  it('an import made from INSIDE a package resolves from that package, never from the fallback directory', async () => {
    const pkg = join(root, 'pkg2')
    const appDir = join(root, 'app2')
    addPackage(pkg, 'inner', `export const I = 'inner-of-outer'`)
    addPackage(pkg, 'outer', `import { I } from 'inner'; export const O = I`)
    addPackage(appDir, 'inner', `export const I = 'inner-of-app'`)
    const out = await bundleWebHostScript({
      source: `import { O } from 'outer'; globalThis.__RO = O`,
      resolveDirs: [bundlerDir, pkg, appDir],
    })
    expect(out).toContain('inner-of-outer')
    expect(out).not.toContain('inner-of-app')
  })

  it('an entry import nothing can resolve FAILS the build, as it does under esbuild', async () => {
    // Regression: rolldown treats an unresolved import as EXTERNAL, so this used to "succeed" with
    // `(function(e){globalThis.__X=e.X})(not_installed_anywhere)` — a page that throws a ReferenceError only once it is
    // running inside the native WebView.
    await expect(
      bundleWebHostScript({ source: `import { X } from 'not-installed-anywhere'; globalThis.__X = X`, resolveDirs: [bundlerDir] }),
    ).rejects.toThrow(/imports 'not-installed-anywhere', which resolves from none of/)
  })
})
