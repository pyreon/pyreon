/**
 * The workspace alias map — derived from each package's own `exports`.
 *
 * The drift guard below is the point of this file. The map used to be two
 * hand-maintained arrays, and an unlisted subpath does not fail loudly: it
 * matches the PARENT package alias and the remainder is appended, so
 * `@pyreon/reactivity/coverage` resolved to `…/reactivity/src/index.ts/coverage`
 * and surfaced as `ENOTDIR: not a directory`. At the time this was written, 93
 * exported subpaths were missing — every test that would have imported one of
 * them was simply unable to run.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAliases } from '../aliases'

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..')

/** Every `@pyreon/*` export specifier that resolves to a TypeScript source. */
function declaredSpecifiers(): { root: string[]; subpaths: string[] } {
  const root: string[] = []
  const subpaths: string[] = []
  const packagesDir = join(REPO_ROOT, 'packages')

  for (const category of readdirSync(packagesDir)) {
    const categoryDir = join(packagesDir, category)
    if (!statSync(categoryDir).isDirectory()) continue
    for (const pkg of readdirSync(categoryDir)) {
      const dir = join(categoryDir, pkg)
      if (!statSync(dir).isDirectory()) continue
      const manifest = join(dir, 'package.json')
      if (!existsSync(manifest)) continue
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string
        exports?: Record<string, unknown>
      }
      if (!parsed.name?.startsWith('@pyreon/')) continue

      for (const [key, value] of Object.entries(parsed.exports ?? {})) {
        if (key === './package.json' || key.includes('*')) continue
        // Mirror the builder's own notion of "aliasable": a TS source that exists.
        const target = pickBun(value)
        if (!target?.endsWith('.ts') && !target?.endsWith('.tsx')) continue
        if (!existsSync(resolve(dir, target))) continue
        if (key === '.') root.push(parsed.name)
        else subpaths.push(`${parsed.name}${key.slice(1)}`)
      }
    }
  }
  return { root, subpaths }
}

function pickBun(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const conditions = value as Record<string, unknown>
  for (const c of ['bun', 'import', 'default']) {
    const found = pickBun(conditions[c])
    if (found) return found
  }
  return undefined
}

const aliases = buildAliases(REPO_ROOT)
const finds = new Set(aliases.map((a) => String(a.find)))

describe('coverage of the workspace', () => {
  it('aliases EVERY exported subpath — no silent parent-prefix fallthrough', () => {
    const { subpaths } = declaredSpecifiers()
    const missing = subpaths.filter((s) => !finds.has(s))
    expect(missing, `unaliased subpaths: ${missing.join(', ')}`).toEqual([])
    // Sanity: the sweep found real work to do, so a future refactor that makes
    // `declaredSpecifiers` return nothing cannot make this test vacuous.
    expect(subpaths.length).toBeGreaterThan(50)
  })

  it('aliases every package root', () => {
    const { root } = declaredSpecifiers()
    const missing = root.filter((s) => !finds.has(s))
    expect(missing, `unaliased packages: ${missing.join(', ')}`).toEqual([])
  })

  it('includes the subpaths whose absence caused real failures', () => {
    // Regression anchors, not decoration: `@pyreon/reactivity/coverage` is what
    // exposed the gap (Atlas' reactive-coverage panel could not be tested).
    for (const s of [
      '@pyreon/reactivity/coverage',
      '@pyreon/reactivity/lpih',
      '@pyreon/sync/yjs',
      '@pyreon/validate/mini',
      '@pyreon/testing/router',
      '@pyreon/zero/env',
    ]) {
      expect(finds.has(s), `missing alias: ${s}`).toBe(true)
    }
  })
})

describe('ordering', () => {
  it('places every subpath BEFORE its parent package', () => {
    // Vite resolves aliases in array order, first match wins, and a package
    // name is a prefix of its own subpaths. Get this wrong and every subpath
    // silently resolves to the package root.
    for (const alias of aliases) {
      const find = String(alias.find)
      const slash = find.indexOf('/', '@pyreon/'.length)
      if (slash === -1) continue
      const parent = find.slice(0, slash)
      if (!finds.has(parent)) continue
      const childIdx = aliases.findIndex((a) => String(a.find) === find)
      const parentIdx = aliases.findIndex((a) => String(a.find) === parent)
      expect(childIdx, `${find} must precede ${parent}`).toBeLessThan(parentIdx)
    }
  })
})

describe('targets', () => {
  it('points every alias at a file that exists', () => {
    const broken = aliases.filter((a) => !existsSync(String(a.replacement)))
    expect(broken.map((a) => String(a.find)), 'aliases pointing at nothing').toEqual([])
  })

  it('resolves to src, never to a built lib', () => {
    // The whole reason for the map: tests must read TypeScript source under the
    // `bun` condition, not a stale `lib/` build.
    const built = aliases.filter((a) => String(a.replacement).includes('/lib/'))
    expect(built.map((a) => String(a.find))).toEqual([])
  })
})
