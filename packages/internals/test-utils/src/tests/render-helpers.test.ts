/**
 * Coverage-focused tests for render.ts helpers
 * (getComputedTheme, renderProps).
 */
import { describe, expect, it } from 'vitest'
import { getComputedTheme, renderProps } from '../render'

describe('getComputedTheme', () => {
  it('returns $rocketstyle from a function-accessor', () => {
    const Comp = (props: Record<string, unknown>) => ({
      $rocketstyle: () => ({ color: 'red', state: props.state }),
    })
    const theme = getComputedTheme(Comp, { state: 'primary' })
    expect(theme).toEqual({ color: 'red', state: 'primary' })
  })

  it('returns $rocketstyle when it is a plain object', () => {
    const Comp = () => ({
      $rocketstyle: { color: 'blue' },
    })
    expect(getComputedTheme(Comp)).toEqual({ color: 'blue' })
  })

  it('omits props arg uses empty object', () => {
    const Comp = (props: Record<string, unknown>) => ({
      $rocketstyle: { receivedProps: props },
    })
    expect(getComputedTheme(Comp)).toEqual({ receivedProps: {} })
  })
})

describe('renderProps', () => {
  it('returns vnode.props when present', () => {
    const Comp = (props: Record<string, unknown>) => ({
      type: 'div',
      props: { class: 'x', ...props },
    })
    const result = renderProps(Comp, { id: 'btn' })
    expect(result.id).toBe('btn')
    expect(result.class).toBe('x')
  })

  it('returns vnode itself when props is absent', () => {
    const Comp = () => ({ type: 'div' })
    expect(renderProps(Comp)).toEqual({ type: 'div' })
  })

  it('handles null/undefined vnode gracefully', () => {
    const Comp = () => null as unknown
    expect(renderProps(Comp)).toBeNull()
  })
})
