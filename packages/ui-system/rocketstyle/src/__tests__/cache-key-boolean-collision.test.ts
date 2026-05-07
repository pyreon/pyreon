/**
 * Bug reproduction: under `useBooleans: true`, `_resolveRsEntry`'s cache
 * key reads `propsRec[dimName]` directly (e.g. `propsRec.state`). Boolean
 * shorthand props like `<X primary />` populate `propsRec.primary` (NOT
 * `propsRec.state`), so the cache key for the `state` slot is `undefined`
 * → `''` regardless of which boolean variant was passed.
 *
 * Result: `<X primary />` and `<X secondary />` produce identical cache
 * keys and share the cached entry. The first-resolved variant's
 * `$rocketstyle` wins for all subsequent renders.
 */
import { initTestConfig, withThemeContext } from '@pyreon/test-utils'
import rocketstyle from '../init'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

const ThemeCapture: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => ({
  type: 'div',
  props: rest,
  $rocketstyle: typeof $rocketstyle === 'function' ? $rocketstyle() : $rocketstyle,
  $rocketstate: typeof $rocketstate === 'function' ? $rocketstate() : $rocketstate,
})
ThemeCapture.displayName = 'ThemeCapture'

describe('rocketstyle — cache-key collision under useBooleans:true', () => {
  it('different boolean variants produce different $rocketstyle (NOT collide)', () => {
    const Button: any = rocketstyle({ useBooleans: true })({
      name: 'BoolButton',
      component: ThemeCapture,
    }).states(() => ({
      primary: { color: 'red' },
      secondary: { color: 'blue' },
    }))

    // Render with primary=true. Captures the $rocketstyle resolved
    // for state='primary'.
    const a = withThemeContext(() => Button({ primary: true }))

    // Render with secondary=true. Should resolve to state='secondary'
    // and produce DIFFERENT $rocketstyle.
    const b = withThemeContext(() => Button({ secondary: true }))

    // Bug: a.$rocketstyle === b.$rocketstyle (same cached entry).
    // Fix: a.$rocketstyle.color === 'red', b.$rocketstyle.color === 'blue'.
    expect(a.$rocketstate.state).toBe('primary')
    expect(b.$rocketstate.state).toBe('secondary')
    expect(a.$rocketstyle.color).toBe('red')
    expect(b.$rocketstyle.color).toBe('blue')
  })
})
