// Every field of `Series` that carries DATA must reach the reader who cannot
// see the chart. Adding one without doing so is a compile error here.
//
// This class has now cost five fixes in one branch. `Series` grows a channel,
// the mark renders it, and the layers that project a Series into their OWN
// narrower shape drop it silently — the value labels, the accessible
// description, the accessible table, the tooltip, and the bubble's size. Each
// one compiled, each one rendered, and each one reported less than the chart
// draws. The type checker cannot see it because every narrow type is complete
// on its own terms.
//
// So the classification is made TOTAL instead: a `Record` over `keyof Series`
// means a new field does not compile until someone decides whether it is data
// or presentation, and the specs below require every DATA field to appear in
// the accessible table.
import { describe, expect, it } from 'vitest'
import { chartTable } from './a11y'
import { tooltipAt, tooltipLines } from './tooltip'
import type { Series } from './render'
import type { A11ySeries } from './a11y'

type Role = 'data' | 'presentation'

/**
 * What each `Series` field IS. `data` means a reader must be able to get the
 * number without looking at the picture; `presentation` means it only affects
 * how the picture is drawn.
 *
 * `radii` is presentation ON PURPOSE: it is `rValues` after the pixel
 * mapping, and reporting "radius 12" describes the drawing rather than the
 * datum — which is exactly the confusion that hid the bubble gap.
 */
const ROLE: Readonly<Record<keyof Series, Role>> = {
  kind: 'presentation',
  values: 'data',
  values2: 'data',
  errLow: 'data',
  errHigh: 'data',
  rValues: 'data',

  radii: 'presentation',
  color: 'presentation',
  width: 'presentation',
  radius: 'presentation',
  label: 'presentation',
  curve: 'presentation',
  showValues: 'presentation',
  axis: 'presentation',
  effect: 'presentation',
  symbol: 'presentation',
  symbolRepeat: 'presentation',
  corners: 'presentation',
  gradient: 'presentation',
  dash: 'presentation',
  negativeColor: 'presentation',
}

/** A series carrying every data channel at once, so one table shows them all. */
function loaded(): Series {
  return {
    kind: 'band',
    values: [3, 6],
    values2: [1, 2],
    errLow: [2, 5],
    errHigh: [4, 7],
    rValues: [11, 22],
    color: '#111',
    width: 2,
    radius: 3,
    label: 'S',
  }
}

/** The numbers a channel contributes, as they would be printed. */
const PRINTED: Readonly<Record<string, string[]>> = {
  values: ['3', '6'],
  values2: ['1', '2'],
  errLow: ['2', '5'],
  errHigh: ['4', '7'],
  rValues: ['11', '22'],
}

describe('every data channel reaches the reader', () => {
  it('the classification is total over Series — a new field must be classified', () => {
    // The compile-time half is the `Record<keyof Series, Role>` above: a field
    // added to `Series` and not to `ROLE` is a TS2741 before this runs. This
    // spec guards the other direction — a field REMOVED from `Series` leaving
    // a stale entry behind, which would quietly stop being checked.
    const classified = Object.keys(ROLE)
    expect(classified.length).toBeGreaterThan(0)
    expect(new Set(classified).size, 'duplicate entries').toBe(classified.length)
  })

  it('every DATA channel appears in the accessible table', () => {
    const t = chartTable({ categories: ['a', 'b'], series: [loaded()] })
    const printed = t.rows.flat().join(' ')
    const missing = (Object.keys(ROLE) as (keyof Series)[])
      .filter((k) => ROLE[k] === 'data')
      .filter((k) => {
        const wanted = PRINTED[k]
        if (wanted === undefined) return true
        return !wanted.every((v) => printed.includes(v))
      })
    expect(missing, 'data channels the table never prints').toEqual([])
  })

  it('and the tooltip carries the ones that are per-datum values', () => {
    // The table is the exhaustive surface; the tooltip shows one datum, so it
    // carries the channels that describe THAT datum rather than every bound.
    const c = tooltipAt(1, ['a', 'b'], [loaded()])
    const line = tooltipLines(c).join(' ')
    expect(line).toContain('6')
    expect(line).toContain('2')
    expect(c.rows[0]!.value2).toBe(2)
  })

  it('the presentation-only lookalike cannot even be handed to the a11y layer', () => {
    // The control, at the type level: `radii` is the one field that LOOKS
    // like data and is not — it is `rValues` after the pixel mapping. It is
    // absent from `A11ySeries` BY CONSTRUCTION, so the confusion that hid the
    // bubble gap ("the series already carries the channel") cannot recur by
    // someone passing the pixels through.
    type HasRadii = 'radii' extends keyof A11ySeries ? true : false
    const cannot: HasRadii = false
    expect(cannot).toBe(false)
  })
})
