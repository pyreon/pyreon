// The compiler's grammar-tag table must agree with the grammar the web ships.
//
// `GRAMMAR_MARK_TAGS` is the compiler's copy of a set that is really owned by
// `@pyreon/charts`' grammar. When `stackedArea` was added, the compiler's copy
// got a `Layer` entry and the web grammar did not get a `Layer` component —
// so the same source compiled natively and rendered nothing in a browser. A
// copy of a set in a package that cannot import the original is exactly where
// that happens, so the agreement is asserted rather than assumed.
//
// The charts package is not a dependency of this one (and should not become
// one for a test), so the expected table is written out here and the charts
// side asserts the same shape from its own end in
// `packages/fundamentals/charts/src/engine/grammar-parity.test.tsx`. Two
// declarations, one contract, both checked — and the pair is what fails when
// someone adds a mark to one side only.
import { describe, expect, it } from 'vitest'
import { GRAMMAR_MARK_TAGS, PLOT_MARK_KINDS } from '../chart-hosts'

/** Mirrors `GRAMMAR_TAG_KINDS` in the charts package's grammar-parity test. */
const EXPECTED: Readonly<Record<string, string>> = {
  Bar: 'bars',
  Line: 'line',
  Area: 'area',
  Dot: 'points',
  Layer: 'stackedArea',
  Band: 'band',
}

describe('GRAMMAR_MARK_TAGS', () => {
  it('matches the grammar the charts package ships', () => {
    expect(GRAMMAR_MARK_TAGS).toEqual(EXPECTED)
  })

  it('every tag lowers to a kind the mark table can build', () => {
    // A tag mapping to a kind no mark factory produces would desugar into an
    // emit for a Series kind the engine never renders.
    const kinds = new Set(Object.values(PLOT_MARK_KINDS))
    // `Bar` covers bars/stacked/grouped/waterfall through its own props, so
    // its base kind is what the table names.
    const unbuildable = Object.values(GRAMMAR_MARK_TAGS).filter((k) => !kinds.has(k))
    expect(unbuildable, 'these tags desugar to a kind PLOT_MARK_KINDS cannot produce').toEqual([])
  })
})
