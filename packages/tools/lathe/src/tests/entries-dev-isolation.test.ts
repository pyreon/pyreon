/**
 * The layered entry graph, and why `dev.ts` exists.
 *
 * A mock route table is DATA. Unlike an unused function it survives
 * minification wherever it is REACHABLE, so a barrel that merely NAMES
 * it puts every fixture in the page bundle — measured at 120 operations,
 * that was the whole table, in production. Nothing here is unsafe to
 * import; it is unsafe to import ACCIDENTALLY, which is exactly what a
 * convenience barrel does.
 *
 * That makes the isolation STRUCTURAL rather than marker-dependent: the
 * production barrel must never name `./mocks`, `./faker` or
 * `./components`, so no bundler has an edge to follow regardless of
 * whether it honours a `sideEffects` hint. Asserting the absence of the
 * NAME is therefore the load-bearing test — a size measurement would
 * pass with the marker doing the work and regress invisibly the moment
 * a consumer's config differed.
 *
 * `dev.ts` is node-safe for a second, separate reason: previews are JSX,
 * so re-exporting them made a plain node test that wanted one fake
 * object configure a JSX transform for components it never touches.
 */
import { describe, expect, it } from 'vitest'
import { emitBarrel, emitDevEntry } from '../emit/entries'
import type { IrDocument, IrOperation } from '../core/ir'

const op = (id: string, tag = 'users'): IrOperation =>
  ({ id, tag, method: 'GET', path: `/${id}`, pathParams: [], queryParams: [] }) as IrOperation

const doc = (operations: IrOperation[] = [op('getUser')]): IrDocument =>
  ({ title: 'T', version: '1', baseUrl: '', models: [], operations, notes: [] }) as IrDocument

const barrel = (plugins: string[], d = doc()) =>
  emitBarrel(d, { plugins } as never).build('// g').contents

const dev = (plugins: string[], d = doc()) =>
  emitDevEntry(d, { plugins } as never)?.build('// g').contents ?? null

const DEV_ONLY = ['./mocks', './faker', './components']

/**
 * Does the module carry an import/export EDGE to this specifier?
 *
 * A bundler follows statements, not prose — and both entries deliberately
 * NAME the dev modules in their docblocks to explain the split ("import
 * `./components` directly"). A bare substring check would forbid the
 * documentation that keeps the next person from undoing the layering.
 */
const hasEdge = (source: string, specifier: string): boolean =>
  new RegExp(
    `^\\s*(import|export)\\b[^\\n]*['"]${specifier.replace('.', '\\.')}['"]`,
    'm',
  ).test(source)

describe('the production barrel never NAMES a dev module', () => {
  it('exports the production layers', () => {
    // The control. Every absence assertion below is worthless against a
    // barrel that exports nothing.
    const out = barrel(['types', 'schemas', 'client', 'endpoints', 'queries'])
    expect(out).toContain('export')
  })

  for (const plugins of [
    ['types', 'client', 'mocks'],
    ['types', 'client', 'faker'],
    ['types', 'client', 'components'],
    ['types', 'schemas', 'client', 'endpoints', 'queries', 'mocks', 'faker', 'components'],
  ]) {
    it(`omits every dev module with plugins ${plugins.join(',')}`, () => {
      // Naming one gives a bundler an edge to follow. A fixture table is
      // DATA, so it survives minification wherever it is reachable —
      // this is the whole reason the layering exists.
      const out = barrel(plugins)
      for (const name of DEV_ONLY) {
        expect(hasEdge(out, name), `${name} must not be reachable from the barrel`).toBe(false)
      }
    })
  }

  it('prefers schemas over types when both are emitted', () => {
    // Both export the same names; exporting both is a duplicate-export
    // error in the generated module.
    const both = barrel(['types', 'schemas'])
    expect(both.match(/export \* from '\.\/(types|schemas)'/g) ?? []).toHaveLength(1)
  })

  it('exports types when schemas were NOT emitted', () => {
    expect(barrel(['types'])).toContain("'./types'")
  })

  it('exports a per-tag endpoints and queries barrel', () => {
    const out = barrel(['endpoints', 'queries'], doc([op('a', 'users'), op('b', 'posts')]))
    expect(out).toContain('users')
    expect(out).toContain('posts')
  })

  it('emits nothing for a tag with no operations', () => {
    // An empty per-tag file is an import edge to nothing.
    const out = barrel(['endpoints'], doc([]))
    expect(out).not.toContain('./endpoints/')
  })
})

describe('the dev entry gathers the fixtures, and only them', () => {
  it('exports the mock route table and the factories', () => {
    const out = dev(['mocks', 'faker'])!
    expect(out).toContain('installMocks')
    expect(hasEdge(out, './mocks'), 'a real edge, not a mention').toBe(true)
    expect(hasEdge(out, './faker')).toBe(true)
  })

  it('is NODE-SAFE — no preview components', () => {
    // Previews are JSX, so re-exporting them made a plain node test that
    // wanted one fake object configure a JSX transform for components it
    // never touches.
    const out = dev(['mocks', 'faker', 'components'])!
    expect(hasEdge(out, './components'), 'a JSX surface must not be reachable from a node-safe entry')
      .toBe(false)
  })

  it('emits NOTHING when there is nothing dev-only to gather', () => {
    // An empty dev entry is a file and an import edge for nothing.
    expect(dev(['types', 'client'])).toBeNull()
    expect(dev([])).toBeNull()
  })

  it('emits when only ONE of the two is present', () => {
    expect(dev(['mocks'])).toBeTruthy()
    expect(dev(['faker'])).toBeTruthy()
  })

  it('explains WHY it is separate, in the file itself', () => {
    // The next person to add a convenience re-export reads this file,
    // not the changelog.
    const out = dev(['mocks', 'faker'])!.toLowerCase()
    expect(out).toMatch(/tree-shak|reachable|bundle/)
  })
})

describe('output is deterministic', () => {
  it('two emits are identical', () => {
    // `lathe check` fails on output stale against the spec.
    const d = doc([op('b', 'posts'), op('a', 'users')])
    expect(barrel(['endpoints', 'queries'], d)).toBe(barrel(['endpoints', 'queries'], d))
    expect(dev(['mocks', 'faker'], d)).toBe(dev(['mocks', 'faker'], d))
  })
})
