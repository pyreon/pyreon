/**
 * A one-off look is a named modifier (`.multiple({ threeUp: { … } })`), so a
 * dimension slice has to accept every value form a `.theme()` does and win over
 * the theme the way its responsive value reads:
 *
 * - a mobile-first ARRAY survives the light/dark resolution (it used to come
 *   out as `{ 0: …, 1: … }`, which unistyle reads as a breakpoint map with no
 *   breakpoint keys, so the value was dropped);
 * - a responsive slice wins FROM ITS FIRST BREAKPOINT UP and leaves the
 *   theme's value in place below it (a plain deep merge replaced a scalar
 *   theme value with the slice's breakpoint object, losing the value below
 *   `md`, and kept a theme breakpoint above the slice's, so the theme won
 *   at `lg` over a slice that said "from `md`").
 *
 * The resolved `$rocketstyle` is what the styler renders; the CSS-level and
 * computed-style checks are in `@pyreon/ui-components`
 * (`style-modifier.browser.test.tsx`).
 */
import { ThemeCapture, getComputedTheme, initTestConfig } from '@pyreon/test-utils'
import rocketstyle from '../init'

let cleanup: () => void

beforeAll(() => {
  cleanup = initTestConfig()
})

afterAll(() => cleanup())

const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 } }

const resolve = (Comp: unknown, props: Record<string, unknown> = {}, mode: 'light' | 'dark' = 'light') =>
  getComputedTheme(Comp, props, { theme, mode })

// Built after `initTestConfig()` (the styled mock must be in place first).
const makeGrid = (): any =>
  rocketstyle()({ name: 'ModGrid', component: ThemeCapture })
  .theme({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: { xs: 4, lg: 12 }, paddingTop: 2 })
  .multiple({
    threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } },
    roomy: { gap: { md: 20 } },
    stepped: { paddingTop: [null, null, 16] },
    flat: { gap: 0 },
    tinted: { color: 'red', hover: { color: { md: 'blue' } } },
  })

describe('a responsive modifier over the theme', () => {
  let Grid: any
  beforeAll(() => {
    Grid = makeGrid()
  })

  it('keeps the theme value below the modifier breakpoint and wins from it up', () => {
    expect(resolve(Grid, { multiple: ['threeUp'] }).gridTemplateColumns).toEqual({
      xs: 'minmax(0, 1fr)',
      md: 'repeat(3, minmax(0, 1fr))',
    })
  })

  it('drops the theme breakpoints at or above the modifier one (the modifier wins at lg too)', () => {
    expect(resolve(Grid, { multiple: ['roomy'] }).gap).toEqual({ xs: 4, md: 20 })
  })

  it('reads a mobile-first array the same way (null = from the theme)', () => {
    expect(resolve(Grid, { multiple: ['stepped'] }).paddingTop).toEqual({ xs: 2, md: 16 })
  })

  it('a single value still replaces the whole responsive theme value', () => {
    expect(resolve(Grid, { multiple: ['flat'] }).gap).toBe(0)
  })

  it('merges inside a pseudo group the same way', () => {
    const rs = resolve(Grid, { multiple: ['tinted'] })
    expect(rs.color).toBe('red')
    expect(rs.hover).toEqual({ color: { md: 'blue' } })
  })

  it('without the modifier the theme is untouched', () => {
    const rs = resolve(Grid)
    expect(rs.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(rs.gap).toEqual({ xs: 4, lg: 12 })
  })

  it('a dimension whose VALUE NAMES are breakpoint names still merges per value', () => {
    // `.sizes({ sm, md, lg })` is a map of style objects, not a breakpoint map.
    const Sized: any = rocketstyle()({ name: 'ModSized', component: ThemeCapture })
      .sizes({ sm: { paddingTop: 4 }, md: { paddingTop: 8 } })
      .sizes({ sm: { color: 'red' } })
    expect(resolve(Sized, { size: 'md' }).paddingTop).toBe(8)
    expect(resolve(Sized, { size: 'sm' })).toMatchObject({ paddingTop: 4, color: 'red' })
  })

  it('falsy entries in the list (conditional composition) resolve to the SAME memoized theme', () => {
    // `multiple={['threeUp', compact() && 'dense']}`: the memo keys on the
    // resolved list, so `false` does not open a second entry (and a second
    // `$rocketstyle` identity, which the styler's class cache keys on).
    const clean = resolve(Grid, { multiple: ['threeUp'] })
    expect(resolve(Grid, { multiple: ['threeUp', false, null, undefined, ''] })).toBe(clean)
  })

  it('chained .theme() layers follow the same rule', () => {
    const Chained: any = rocketstyle()({ name: 'ModChained', component: ThemeCapture })
      .theme({ gridTemplateColumns: 'minmax(0, 1fr)' })
      .theme({ gridTemplateColumns: { md: 'repeat(2, 1fr)' } })
    expect(resolve(Chained).gridTemplateColumns).toEqual({ xs: 'minmax(0, 1fr)', md: 'repeat(2, 1fr)' })
  })
})

describe('a mobile-first array in a theme or a modifier', () => {
  let Padded: any
  beforeAll(() => {
    Padded = rocketstyle()({ name: 'ModPadded', component: ThemeCapture })
      .theme((_t: unknown, m: (a: unknown, b: unknown) => unknown) => ({
        paddingTop: [4, 8],
        color: [m('black', 'white'), null, 'red'],
      }))
      .multiple({ deep: { marginTop: [1, 2] } })
  })

  it('stays an array through the light/dark resolution, mode values resolved inside it', () => {
    expect(resolve(Padded).paddingTop).toEqual([4, 8])
    expect(resolve(Padded, {}, 'light').color).toEqual(['black', null, 'red'])
    expect(resolve(Padded, {}, 'dark').color).toEqual(['white', null, 'red'])
    expect(resolve(Padded, { multiple: ['deep'] }).marginTop).toEqual([1, 2])
  })
})
