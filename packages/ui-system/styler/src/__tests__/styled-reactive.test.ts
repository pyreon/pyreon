import type { VNode } from '@pyreon/core'
import { pushContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'
import { ThemeContext } from '../ThemeProvider'

describe('DynamicStyled reactive class path', () => {
  afterEach(() => {
    sheet.reset()
  })

  function withTheme(fn: () => void) {
    // Push a reactive ThemeContext so useThemeAccessor() works inside Comp
    pushContext(new Map([[ThemeContext.id, () => ({}) as any]]))
    fn()
  }

  it('creates a VNode with class when $rocketstyle is a function accessor', () => {
    const modeSig = signal<'light' | 'dark'>('light')
    const rsAccessor = () => ({
      color: modeSig() === 'light' ? 'red' : 'blue',
    })
    const rsStateAccessor = () => ({ state: 'default' })

    const Comp = styled('div')`
      color: ${(p: any) => p.$rocketstyle?.color ?? 'black'};
    `

    let vnode: VNode | null = null
    withTheme(() => {
      vnode = Comp({ $rocketstyle: rsAccessor, $rocketstate: rsStateAccessor }) as VNode
    })

    expect(vnode).toBeTruthy()
    // The VNode has a class from initial resolve
    expect(vnode!.props.class).toBeTruthy()
    expect(typeof vnode!.props.class).toBe('string')
    expect(vnode!.props.class).toContain('pyr-')
  })

  it('static $rocketstyle (plain object) also resolves correctly', () => {
    const Comp = styled('div')`
      color: ${(p: any) => p.$rocketstyle?.color ?? 'black'};
    `

    let vnode: VNode | null = null
    withTheme(() => {
      vnode = Comp({ $rocketstyle: { color: 'green' }, $rocketstate: { state: 'x' } }) as VNode
    })

    expect(vnode).toBeTruthy()
    expect(vnode!.props.class).toBeTruthy()
    expect(typeof vnode!.props.class).toBe('string')
  })

  it('ref callback is wired when reactive path is active', () => {
    const rsAccessor = () => ({ color: 'red' })
    const rsStateAccessor = () => ({ state: 'default' })

    const Comp = styled('div')`
      color: ${(p: any) => p.$rocketstyle?.color};
    `

    let vnode: VNode | null = null
    withTheme(() => {
      vnode = Comp({ $rocketstyle: rsAccessor, $rocketstate: rsStateAccessor }) as VNode
    })

    // The reactive path wires a ref callback for classList mutation
    expect(typeof vnode!.props.ref).toBe('function')
  })
})
