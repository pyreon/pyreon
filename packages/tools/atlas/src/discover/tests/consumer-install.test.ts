/**
 * Resolution in an INSTALLED consumer workspace.
 *
 * ── Why a separate file from `config-resolution` ──────────────────────────
 *
 * Those tests build the shapes by hand. These pin the three things that only
 * appear once the package is genuinely INSTALLED somewhere — and all three
 * shipped broken while every fixture test passed, because a tool running from
 * the same workspace as its target never meets them:
 *
 *   1. An isolated install (bun, pnpm) links a dependency at a content-addressed
 *      store directory, and the package's OWN dependencies sit as SIBLINGS
 *      inside that store. Hand back the link and the resolver walks up from the
 *      consuming package instead, never reaches the store, and the module's
 *      transitive imports fail.
 *
 *   2. The framework is declared by ATLAS, not by the project. No package in a
 *      consumer workspace depends on `@pyreon/runtime-dom`, so a resolver that
 *      only looks at project packages cannot find it — and the generated build
 *      entry, which is Atlas's own UI code, imports exactly that.
 *
 *   3. A virtual module's imports resolve against the Vite ROOT, which in a
 *      monorepo declares nothing.
 *
 * Verified end to end by installing a packed Atlas into a separate workspace:
 * before, `atlas build` died with `Rolldown failed to resolve import
 * "@pyreon/runtime-dom"` and `atlas dev` served an HTML shell whose catalog
 * module failed with `Failed to resolve import "@pyreon/core"` — a dev server
 * that returns 200 and shows an error.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFromWorkspace, workspaceResolvePlugin } from '../workspace-packages'

let root: string
/** An importer Atlas owns — its generated build entry. */
const ATLAS_IMPORTER = '/proj/node_modules/.atlas-build/entry.js'
const write = (relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-consumer-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The layout an isolated install produces: a link into a content store. */
const isolatedInstall = (pkg: string): void => {
  const store = `node_modules/.store/${pkg.replace('/', '+')}/node_modules/${pkg}`
  write(`${store}/package.json`, JSON.stringify({ name: pkg, exports: { import: './lib/index.js' } }))
  write(`${store}/lib/index.js`, `export const x = 1 // ${pkg}`)
  write('packages/app/package.json', JSON.stringify({ name: '@c/app' }))
  mkdirSync(join(root, 'packages/app/node_modules', pkg, '..'), { recursive: true })
  symlinkSync(join(root, store), join(root, 'packages/app/node_modules', pkg), 'dir')
}

describe('an isolated install links into a content store', () => {
  it('returns the REAL path, not the symlink', () => {
    // The bug: handing back `packages/app/node_modules/@pyreon/core` means the
    // resolver walks up from `packages/app`, never reaches the store, and the
    // module's own imports fail with `Cannot find module '@pyreon/reactivity'
    // imported from …/@pyreon/core/lib/index.js`.
    isolatedInstall('@pyreon/core')
    const resolved = resolveFromWorkspace('@pyreon/core', [join(root, 'packages/app')])
    expect(resolved).toBeDefined()
    expect(resolved).toContain('.store')
    expect(resolved).not.toContain(join('packages', 'app', 'node_modules'))
  })

  it('lands where the package SIBLINGS live, so transitive imports resolve', () => {
    // The property that actually matters: a sibling of the resolved file must be
    // reachable by ordinary upward resolution.
    isolatedInstall('@pyreon/core')
    const store = 'node_modules/.store/@pyreon+core/node_modules'
    write(`${store}/@pyreon/reactivity/package.json`, JSON.stringify({ name: '@pyreon/reactivity' }))
    const resolved = resolveFromWorkspace('@pyreon/core', [join(root, 'packages/app')])
    expect(resolved).toContain(join('.store', '@pyreon+core', 'node_modules'))
  })
})

describe('workspaceResolvePlugin', () => {
  it('resolves a bare specifier the PROJECT declares, for an Atlas-owned importer', () => {
    // The root manifest matters: without `workspaces` there are no package
    // directories to search, and this would pass through Atlas's own copy
    // instead — proving nothing about the project path it claims to test.
    write('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }))
    isolatedInstall('@acme/only-the-project-has-this')
    const plugin = workspaceResolvePlugin(root)
    const resolved = plugin.resolveId('@acme/only-the-project-has-this', ATLAS_IMPORTER)
    expect(resolved).toBeDefined()
  })

  it('leaves relative, absolute and VIRTUAL ids alone', () => {
    // A virtual id (`\0virtual:atlas/catalog`) belongs to the plugin that owns
    // it; claiming it here would break the module it stands for.
    const plugin = workspaceResolvePlugin(root)
    expect(plugin.resolveId('./local', ATLAS_IMPORTER)).toBeUndefined()
    expect(plugin.resolveId('/abs', ATLAS_IMPORTER)).toBeUndefined()
    expect(plugin.resolveId('\0virtual:atlas/catalog', ATLAS_IMPORTER)).toBeUndefined()
  })

  it('returns undefined for a package nothing declares', () => {
    const plugin = workspaceResolvePlugin(root)
    expect(plugin.resolveId('not-installed-anywhere', ATLAS_IMPORTER)).toBeUndefined()
  })

  it('runs AFTER ordinary resolution — it is a FALLBACK, not an override', () => {
    // This assertion started life as `toBe('pre')` and that was the bug.
    //
    // Answering first wins even when Vite would have resolved fine, and the id
    // handed back is a symlinked `node_modules` path while Vite reaches the
    // package's real location. Two ids for one file loads the framework TWICE
    // and the workbench dies with `props.model.view.set(...) is not a function`.
    // The axe-audit e2e caught it; `realpathSync` did not save it either (on
    // macOS it rewrites `/tmp` to `/private/tmp`, diverging from the other side).
    //
    // Running last means Rollup only consults this when nothing else could
    // resolve — which is the entire job.
    expect(workspaceResolvePlugin(root).enforce).toBe('post')
  })

  it('declines for a PROJECT file — those belong to ordinary resolution', () => {
    // A component that cannot resolve an import has a real dependency bug worth
    // surfacing, and silently resolving it from some other package hides it.
    const plugin = workspaceResolvePlugin(root)
    expect(plugin.resolveId('@pyreon/core', join(root, 'packages/app/src/Button.tsx'))).toBeUndefined()
  })

  it('finds a package only ATLAS declares, for the generated entry', () => {
    // No consumer package depends on `@pyreon/runtime-dom` — Atlas does. The
    // generated build entry is Atlas's own UI code and imports it, so Atlas's
    // directory has to be a resolution base or the build cannot link.
    const plugin = workspaceResolvePlugin(root)
    expect(plugin.resolveId('@pyreon/core', ATLAS_IMPORTER)).toBeDefined()
  })

  it('treats the project atlas.config as Atlas-owned', () => {
    // It carries the `wrapper`, so the static build pulls it into the bundle —
    // and it sits at the repo ROOT, where ordinary resolution finds nothing.
    const plugin = workspaceResolvePlugin(root)
    expect(plugin.resolveId('@pyreon/core', join(root, 'atlas.config.ts'))).toBeDefined()
  })
})
