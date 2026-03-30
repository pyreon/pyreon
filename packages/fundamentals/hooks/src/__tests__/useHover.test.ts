import { describe, expect, it } from 'vitest'
import { useHover } from '../useHover'

describe('useHover', () => {
  it('initializes with hovered=false', () => {
    const { hovered } = useHover()
    expect(hovered()).toBe(false)
  })

  it('sets hovered to true on mouseEnter', () => {
    const { hovered, props } = useHover()
    props.onMouseEnter()
    expect(hovered()).toBe(true)
  })

  it('sets hovered to false on mouseLeave', () => {
    const { hovered, props } = useHover()
    props.onMouseEnter()
    expect(hovered()).toBe(true)
    props.onMouseLeave()
    expect(hovered()).toBe(false)
  })

  it('toggles hover state correctly through multiple cycles', () => {
    const { hovered, props } = useHover()
    props.onMouseEnter()
    expect(hovered()).toBe(true)
    props.onMouseLeave()
    expect(hovered()).toBe(false)
    props.onMouseEnter()
    expect(hovered()).toBe(true)
    props.onMouseLeave()
    expect(hovered()).toBe(false)
  })

  it('calling mouseLeave when already not hovered is safe', () => {
    const { hovered, props } = useHover()
    props.onMouseLeave()
    expect(hovered()).toBe(false)
  })

  it('calling mouseEnter multiple times stays true', () => {
    const { hovered, props } = useHover()
    props.onMouseEnter()
    props.onMouseEnter()
    expect(hovered()).toBe(true)
  })

  it('returns props object with onMouseEnter and onMouseLeave', () => {
    const { props } = useHover()
    expect(typeof props.onMouseEnter).toBe('function')
    expect(typeof props.onMouseLeave).toBe('function')
  })

  it('returns stable handler references', () => {
    const { props } = useHover()
    const enter = props.onMouseEnter
    const leave = props.onMouseLeave
    expect(props.onMouseEnter).toBe(enter)
    expect(props.onMouseLeave).toBe(leave)
  })
})
