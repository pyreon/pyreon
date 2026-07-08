import { describe, expect, it } from 'vitest'
import { topoSortByWorkspaceDeps } from '../../../../../scripts/publish-order'

/**
 * Regression: publish leaf-first so a dependent is never published carrying a
 * `^X.Y.Z` range on a sibling that hasn't published yet (the dangling-constraint
 * window that made `bun install` unresolvable). See scripts/publish-order.ts.
 */
describe('topoSortByWorkspaceDeps — leaf-first publish order', () => {
  const idx = (names: string[], name: string) => names.indexOf(name)

  it('publishes a dependency BEFORE its dependent (the feature→form case)', () => {
    // Real-world shape: input is directory/alphabetical order, where the
    // dependent `feature` sorts BEFORE its dep `form` — the exact bug.
    const input = [
      { name: '@pyreon/feature', deps: ['@pyreon/form', '@pyreon/query'] },
      { name: '@pyreon/form', deps: ['@pyreon/reactivity'] },
      { name: '@pyreon/query', deps: ['@pyreon/reactivity'] },
      { name: '@pyreon/reactivity', deps: [] },
    ]
    const out = topoSortByWorkspaceDeps(input).map((n) => n.name)

    expect(idx(out, '@pyreon/reactivity')).toBeLessThan(idx(out, '@pyreon/form'))
    expect(idx(out, '@pyreon/reactivity')).toBeLessThan(idx(out, '@pyreon/query'))
    expect(idx(out, '@pyreon/form')).toBeLessThan(idx(out, '@pyreon/feature'))
    expect(idx(out, '@pyreon/query')).toBeLessThan(idx(out, '@pyreon/feature'))
    // Every package still present exactly once.
    expect(out).toHaveLength(4)
    expect(new Set(out).size).toBe(4)
  })

  it('the vite-plugin → reactivity case (cross-category) resolves deps-first', () => {
    const input = [
      { name: '@pyreon/vite-plugin', deps: ['@pyreon/compiler', '@pyreon/reactivity'] },
      { name: '@pyreon/compiler', deps: [] },
      { name: '@pyreon/reactivity', deps: [] },
    ]
    const out = topoSortByWorkspaceDeps(input).map((n) => n.name)
    expect(idx(out, '@pyreon/reactivity')).toBeLessThan(idx(out, '@pyreon/vite-plugin'))
    expect(idx(out, '@pyreon/compiler')).toBeLessThan(idx(out, '@pyreon/vite-plugin'))
  })

  it('ignores foreign deps not in the publish set', () => {
    const input = [
      { name: '@pyreon/x', deps: ['react', 'vite', '@pyreon/reactivity'] },
      { name: '@pyreon/reactivity', deps: ['@vitus-labs/tools'] },
    ]
    const out = topoSortByWorkspaceDeps(input).map((n) => n.name)
    expect(out).toEqual(['@pyreon/reactivity', '@pyreon/x'])
  })

  it('is stable — independent packages keep their input order', () => {
    const input = [
      { name: '@pyreon/a', deps: [] },
      { name: '@pyreon/b', deps: [] },
      { name: '@pyreon/c', deps: [] },
    ]
    expect(topoSortByWorkspaceDeps(input).map((n) => n.name)).toEqual([
      '@pyreon/a',
      '@pyreon/b',
      '@pyreon/c',
    ])
  })

  it('is cycle-safe (peer-dep cycle does not recurse forever)', () => {
    const input = [
      { name: '@pyreon/a', deps: ['@pyreon/b'] },
      { name: '@pyreon/b', deps: ['@pyreon/a'] },
    ]
    const out = topoSortByWorkspaceDeps(input).map((n) => n.name)
    expect(out).toHaveLength(2)
    expect(new Set(out)).toEqual(new Set(['@pyreon/a', '@pyreon/b']))
  })
})
