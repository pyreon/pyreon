// Every mark factory must be reachable from the entry that documents it.
//
// `waterfall` and `histogram` shipped without being exported from
// `@pyreon/charts/plot`: they existed, they lowered to native, the manifest
// listed them as importable bindings — and `import { waterfall } from
// '@pyreon/charts/plot'` was undefined. Nothing caught it, because the only
// code importing them was the native compiler's own tests, and PMTC parses
// its input rather than resolving it, so those imports never had to exist.
//
// The lock is TOTAL over the marks module rather than a list of names, so a
// mark added later has to be exported instead of silently joining them.

import { describe, expect, it } from 'vitest'
import * as marks from './marks'
import * as plot from '../plot'

/** A mark factory: `(accessor, …) => Mark`. Distinguished from the helpers by returning a `kind`. */
function isMarkFactory(name: string, value: unknown): boolean {
  if (typeof value !== 'function') return false
  // Helpers that live in the same module and are not marks.
  if (['resolveMarks', 'resolveCategories', 'normalizeCorners', 'histogram'].includes(name)) return false
  try {
    const out = (value as (a: unknown, b?: unknown) => unknown)(() => 1, () => 1)
    return typeof out === 'object' && out !== null && 'kind' in (out as Record<string, unknown>)
  } catch {
    return false
  }
}

describe('the mark surface is reachable', () => {
  it('every mark factory is exported from @pyreon/charts/plot', () => {
    const factories = Object.entries(marks).filter(([n, v]) => isMarkFactory(n, v)).map(([n]) => n)
    // Sanity: the detector must actually find the marks, or this passes vacuously.
    expect(factories.length, 'no mark factories detected — the test would pass for the wrong reason').toBeGreaterThanOrEqual(8)
    const missing = factories.filter((n) => !(n in plot))
    expect(missing, 'these marks exist but cannot be imported from the entry that documents them').toEqual([])
  })

  it('`histogram` — the spread-in form — is exported too', () => {
    // Not a mark factory (it returns a whole `{ data, x, marks }` prop set),
    // so the totality check above skips it; it is documented as importable
    // just the same, and shipped unreachable.
    expect(typeof plot.histogram).toBe('function')
  })

  it('the marks the manifest names as importable bindings all resolve', () => {
    // The manifest sentence is the promise a reader acts on; this is that
    // sentence, executed.
    for (const name of ['bars', 'line', 'area', 'points', 'stackedBars', 'groupedBars', 'waterfall', 'band', 'stackedArea']) {
      expect(typeof (plot as Record<string, unknown>)[name], `${name} is documented as importable`).toBe('function')
    }
  })
})
