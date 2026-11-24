/**
 * `.params()`: a caller-chosen VALUE mapped into the theme. The mapper sees one
 * value; the framework splits a responsive prop per breakpoint. The slice is
 * resolved with the dimension props (into `$rocketstyle`, memoized by value),
 * merged after state / size / variant and before `multiple`.
 */
import { ThemeCapture, getComputedTheme, initTestConfig, withThemeContext } from '@pyreon/test-utils'
import rocketstyle from '../init'

let cleanup: () => void

beforeAll(() => {
  cleanup = initTestConfig()
})

afterAll(() => cleanup())

const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }, spacing: { 1: 4, 2: 8 } }

const resolve = (Comp: unknown, props: Record<string, unknown> = {}, mode: 'light' | 'dark' = 'light') =>
  getComputedTheme(Comp, props, { theme, mode })

const cols = (n: number) => `repeat(${n}, minmax(0, 1fr))`

const makeGrid = (): any =>
  rocketstyle()({ name: 'ParamGrid', component: ThemeCapture })
    .theme({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', color: 'black' })
    .states({ primary: { color: 'state' } })
    .variants({ loud: { color: 'variant' } })
    .params({
      columns: (n: number) => ({ gridTemplateColumns: cols(n) }),
      pad: (step: 1 | 2, t: any) => ({ padding: t.spacing[step] }),
      tint: (c: string, _t: unknown, m: any) => ({ color: c, hover: { color: m('light-hover', 'dark-hover') } }),
    })
    .multiple({ accent: { color: 'look' } })

describe('.params()', () => {
  let Grid: any
  beforeAll(() => {
    Grid = makeGrid()
  })

  it('maps a single value', () => {
    expect(resolve(Grid, { columns: 3 }).gridTemplateColumns).toBe(cols(3))
    expect(resolve(Grid, { pad: 2 }).padding).toBe(8)
  })

  it('splits a breakpoint object and a mobile-first array; the theme value stays below the first breakpoint', () => {
    expect(resolve(Grid, { columns: { md: 3 } }).gridTemplateColumns).toEqual({ xs: 'minmax(0, 1fr)', md: cols(3) })
    expect(resolve(Grid, { columns: { xs: 1, lg: 4 } }).gridTemplateColumns).toEqual({ xs: cols(1), lg: cols(4) })
    expect(resolve(Grid, { columns: [1, null, 3] }).gridTemplateColumns).toEqual({ xs: cols(1), md: cols(3) })
  })

  it('passes the theme and the mode helper; pseudo groups are placed per breakpoint too', () => {
    expect(resolve(Grid, { tint: 'red' }, 'dark').hover).toEqual({ color: 'dark-hover' })
    expect(resolve(Grid, { tint: { md: 'red' } }).hover).toEqual({ color: { md: 'light-hover' } })
  })

  it('order: theme < state < variant < param < multiple', () => {
    expect(resolve(Grid, { state: 'primary', variant: 'loud' }).color).toBe('variant')
    expect(resolve(Grid, { state: 'primary', variant: 'loud', tint: 'param' }).color).toBe('param')
    expect(resolve(Grid, { state: 'primary', variant: 'loud', tint: 'param', multiple: ['accent'] }).color).toBe('look')
  })

  it('equal values share the memoized theme object; different values do not', () => {
    const a = resolve(Grid, { columns: { md: 3 } })
    expect(resolve(Grid, { columns: { md: 3 } })).toBe(a)
    expect(resolve(Grid, { columns: { md: 4 } })).not.toBe(a)
    // `1` and `'1'` are different values
    expect(resolve(Grid, { tint: 1 as never })).not.toBe(resolve(Grid, { tint: '1' }))
  })

  it('reads a signal-driven (getter) param', () => {
    let n = 2
    const props = Object.defineProperty({}, 'columns', { get: () => n, enumerable: true })
    expect(resolve(Grid, props).gridTemplateColumns).toBe(cols(2))
    n = 5
    expect(resolve(Grid, props).gridTemplateColumns).toBe(cols(5))
  })

  it('does not forward a param prop to the wrapped component', () => {
    const vnode = withThemeContext(() => Grid({ columns: 3, id: 'x' }), { theme }) as { props: Record<string, unknown> }
    expect(vnode.props.id).toBe('x')
    expect('columns' in vnode.props).toBe(false)
  })

  it('a later .params() overrides by key and keeps the rest; derived components inherit', () => {
    const Derived = Grid.params({ columns: (n: number) => ({ gridTemplateColumns: `x${n}` }) })
    expect(resolve(Derived, { columns: 2, pad: 1 })).toMatchObject({ gridTemplateColumns: 'x2', padding: 4 })
    expect(resolve(Grid, { columns: 2 }).gridTemplateColumns).toBe(cols(2)) // the original is untouched
  })

  it('two params on one property: per breakpoint, the later-declared param wins (like one media rule)', () => {
    const Box: any = rocketstyle()({ name: 'ParamBox', component: ThemeCapture }).params({
      pad: (n: number) => ({ paddingTop: n, paddingBottom: n }),
      padTop: (n: number) => ({ paddingTop: n }),
    })
    // padTop at xs only; pad from md: md is pad's (40), xs is padTop's (16).
    expect(resolve(Box, { pad: { md: 40 }, padTop: 16 })).toMatchObject({
      paddingTop: { xs: 16, md: 40 },
      paddingBottom: { md: 40 },
    })
    expect(resolve(Box, { pad: 8, padTop: 16 })).toMatchObject({ paddingTop: 16, paddingBottom: 8 })
  })

  it('a param named like a dimension or pseudo prop is a dev error', () => {
    expect(() => Grid.params({ state: () => ({}) })).toThrow(/\[Pyreon\].*`state`.*Rename the param/)
    expect(() => Grid.params({ hover: () => ({}) })).toThrow(/`hover`/)
  })
})
