import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleWebHostScript } from '../web-host-bundle'
import { assertPluginShape } from '../plugin-shape'

// The bundler behind package-owned web-host pages. The shape that matters is the TWO-directory resolution: an editor
// package's own dependencies resolve from the package (an isolated install exposes them only there), the optional
// peers from the app — and only the ENTRY falls back, never an import made from inside a package.

const here = resolve(__dirname, '..') // a directory under the repo, so `esbuild` resolves from it

describe('bundleWebHostScript', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-webhost-bundle-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function addPackage(dir: string, name: string, source: string, deps: Record<string, string> = {}) {
    const p = join(dir, 'node_modules', name)
    mkdirSync(p, { recursive: true })
    writeFileSync(join(p, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js', dependencies: deps }))
    writeFileSync(join(p, 'index.js'), source)
  }

  it('bundles an entry to one self-contained IIFE', async () => {
    const pkgDir = join(root, 'pkg')
    addPackage(pkgDir, 'fake-engine', `export const Engine = 'engine-from-package'`)
    const out = await bundleWebHostScript({
      source: `import { Engine } from 'fake-engine'; globalThis.__E = Engine`,
      resolveDirs: [here, pkgDir],
    })
    expect(out).toContain('engine-from-package')
    expect(out).not.toMatch(/\bimport\s*\{/)
    // Self-contained: evaluating it assigns the global with no module system.
    const g = globalThis as { __E?: string }
    delete g.__E
    runInThisContext(out)
    expect(g.__E).toBe('engine-from-package')
  })

  it('resolves an entry import from the SECOND directory when the first cannot satisfy it (a peer the app chose)', async () => {
    const appDir = join(root, 'app')
    addPackage(appDir, 'fake-grammar', `export const Grammar = 'grammar-from-app'`)
    const out = await bundleWebHostScript({
      source: `import { Grammar } from 'fake-grammar'; window.__G = Grammar`,
      resolveDirs: [here, appDir],
    })
    expect(out).toContain('grammar-from-app')
  })

  it('the FIRST directory wins when both can satisfy the import', async () => {
    const a = join(root, 'a')
    const b = join(root, 'b')
    addPackage(a, 'dup', `export const V = 'from-first'`)
    addPackage(b, 'dup', `export const V = 'from-second'`)
    const out = await bundleWebHostScript({ source: `import { V } from 'dup'; window.__V = V`, resolveDirs: [here, a, b] })
    expect(out).toContain('from-first')
    expect(out).not.toContain('from-second')
  })

  it('an import made from INSIDE a package resolves from that package, never from the fallback directory', async () => {
    const appDir = join(root, 'app')
    // `outer` imports `inner`. The app dir ALSO has an `inner`, a different one; outer's own must win.
    addPackage(join(root, 'pkg'), 'inner', `export const I = 'inner-of-outer'`)
    addPackage(join(root, 'pkg'), 'outer', `import { I } from 'inner'; export const O = I`)
    addPackage(appDir, 'inner', `export const I = 'inner-of-app'`)
    // `outer` is reachable only through the entry fallback to the package directory.
    const out = await bundleWebHostScript({
      source: `import { O } from 'outer'; window.__O = O`,
      resolveDirs: [here, join(root, 'pkg'), appDir],
    })
    expect(out).toContain('inner-of-outer')
    expect(out).not.toContain('inner-of-app')
  })

  it('without a bundler it fails with the install instruction instead of an opaque resolution error', async () => {
    await expect(
      bundleWebHostScript({ source: `window.__X = 1`, resolveDirs: [join(root, 'no-bundler-here')] }),
    ).rejects.toThrow(/neither `esbuild` nor `rolldown` resolves from this app.*bun add -d esbuild/s)
  })

  it('needs at least one directory', async () => {
    await expect(bundleWebHostScript({ source: '', resolveDirs: [] })).rejects.toThrow(/at least one resolve directory/)
  })
})

describe('plugin shape: webHosts', () => {
  it('must be a function', () => {
    expect(() => assertPluginShape({ name: '@acme/x', apiVersion: 2, webHosts: 'nope' } as never)).toThrow(/webHosts must be a function/)
    expect(() => assertPluginShape({ name: '@acme/x', apiVersion: 2, webHosts: () => [] } as never)).not.toThrow()
  })
})
