/**
 * Contract for `scripts/bootstrap-concurrency.ts` — how many package builds the bootstrap runs at once, and in what
 * order. An unbounded `bun run --filter=… build` over a near-full dirty set started ~88 builds at once (~23 GB peak,
 * measured) and took 16 GB CI runners down: every main CI run hung in Install until the job was killed.
 */
import { describe, expect, it } from 'vitest'
import { batches, buildConcurrency, dependencyOrder } from '../../../../../scripts/bootstrap-concurrency'

const GiB = 1024 ** 3

describe('buildConcurrency', () => {
  it('a GitHub-hosted runner (4 cores, 16 GB) builds 4 at once — bounded by cores', () => {
    expect(buildConcurrency({}, 4, 16 * GiB)).toBe(4)
  })

  it('a large machine is bounded by cores, not left unbounded', () => {
    expect(buildConcurrency({}, 16, 64 * GiB)).toBe(16)
  })

  it('a memory-poor machine is bounded by memory (1.5 GB per build)', () => {
    expect(buildConcurrency({}, 16, 6 * GiB)).toBe(4)
  })

  it('never goes below one', () => {
    expect(buildConcurrency({}, 8, 1 * GiB)).toBe(1)
  })

  it('honours PYREON_BOOTSTRAP_CONCURRENCY, and ignores a value that is not a positive integer', () => {
    expect(buildConcurrency({ PYREON_BOOTSTRAP_CONCURRENCY: '2' }, 16, 64 * GiB)).toBe(2)
    for (const bad of ['0', '-3', '1.5', 'many', '']) {
      expect(buildConcurrency({ PYREON_BOOTSTRAP_CONCURRENCY: bad }, 4, 16 * GiB)).toBe(4)
    }
  })
})

describe('dependencyOrder', () => {
  const deps = (entries: [string, string[]][]) => new Map(entries.map(([k, v]) => [k, new Set(v)]))

  it('puts a package after the dirty packages it depends on', () => {
    const order = dependencyOrder(['app', 'core', 'ui'], deps([['app', ['ui', 'core']], ['ui', ['core']]]))
    expect(order).toEqual(['core', 'ui', 'app'])
  })

  it('ignores dependencies that are not in the dirty set, and keeps independent packages in input order', () => {
    expect(dependencyOrder(['b', 'a', 'c'], deps([['b', ['zz']]]))).toEqual(['b', 'a', 'c'])
  })

  it('a cycle neither drops nor duplicates a package', () => {
    const order = dependencyOrder(['head', 'compiler', 'server'], deps([['head', ['compiler']], ['compiler', ['server']], ['server', ['head']]]))
    expect([...order].sort()).toEqual(['compiler', 'head', 'server'])
    expect(order).toHaveLength(3)
  })
})

describe('batches', () => {
  it('splits into consecutive batches of at most the given size', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(batches([1, 2], 4)).toEqual([[1, 2]])
    expect(batches([], 3)).toEqual([])
  })
})
