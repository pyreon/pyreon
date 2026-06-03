/**
 * Branch-coverage tests for components.ts ThemeCapture/BaseComponent
 * function-value resolution + ?? fallback paths.
 */
import { describe, expect, it } from 'vitest'
import { BaseComponent, ThemeCapture } from '../components'

describe('components — function-accessor resolution', () => {
  it('ThemeCapture resolves $rocketstyle/$rocketstate when they are functions', () => {
    const rs = { color: 'red' }
    const state = { mode: 'hover' }
    const result = ThemeCapture({
      $rocketstyle: () => rs,
      $rocketstate: () => state,
    })
    expect(result.$rocketstyle).toBe(rs)
    expect(result.$rocketstate).toBe(state)
  })

  it('BaseComponent resolves accessor + uses default `none` for missing pseudo states', () => {
    // $rocketstate is a function returning an object WITHOUT pseudo,
    // exercising the L38/L39/L40 `?? 'none'` fallbacks AND the L3
    // function-accessor branch.
    const result = BaseComponent({
      children: [],
      $rocketstate: () => ({ mode: 'rest' }),
    })
    expect(result.props['data-hover']).toBe('none')
    expect(result.props['data-focus']).toBe('none')
    expect(result.props['data-pressed']).toBe('none')
  })

  it('BaseComponent reads pseudo state when provided', () => {
    const result = BaseComponent({
      children: [],
      $rocketstate: { pseudo: { hover: true, focus: false, pressed: true } },
    })
    expect(result.props['data-hover']).toBe('true')
    expect(result.props['data-focus']).toBe('false')
    expect(result.props['data-pressed']).toBe('true')
  })
})
