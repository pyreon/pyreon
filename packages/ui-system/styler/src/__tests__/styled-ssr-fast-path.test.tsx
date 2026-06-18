// @vitest-environment node
//
// SSR fast path for DynamicStyled. In a node environment `typeof document ===
// 'undefined'`, so `IS_SERVER` is true and the reactive branch skips the
// computed subscription + ref closure + renderEffect (all client-only dead
// weight server-side — `el` never fires, no signal changes within one render).
// These tests run in the `node` environment (per the directive above), unlike
// the rest of the styler suite which runs in happy-dom (client path).
import { describe, expect, it } from 'vitest'
import { styled } from '../styled'

describe('styled — SSR fast path (node env)', () => {
  it('runs in a server environment (document undefined → IS_SERVER true)', () => {
    expect(typeof document).toBe('undefined')
  })

  it('resolves the class for a reactive ($rocketstyle) styled component on the server', () => {
    const Box = styled('div')`
      color: ${({ $rocketstyle }: any) => $rocketstyle.color};
      padding: 8px;
    ` as any
    const vnode = Box({
      $rocketstyle: () => ({ color: 'rgb(1, 2, 3)' }),
      $rocketstate: () => ({ x: 1 }),
      children: 'hi',
    })
    expect(typeof vnode.props.class).toBe('string')
    expect(vnode.props.class).toMatch(/^pyr-/)
  })

  it('does NOT attach the reactive-update ref wrapper on the server (the client path does)', () => {
    // The client path sets `finalProps.ref` to a closure that captures the
    // mounted element for the renderEffect's classList toggle. The SSR fast
    // path skips that entirely — so when the consumer passes no ref, the
    // emitted vnode has none. This is the behavioural distinguisher: reverting
    // the fast path makes the server run the client branch, which attaches a
    // ref function here.
    const Box = styled('div')`color: ${({ $rocketstyle }: any) => $rocketstyle.color};` as any
    const vnode = Box({
      $rocketstyle: () => ({ color: 'red' }),
      $rocketstate: () => ({}),
      children: 'x',
    })
    expect(vnode.props.ref).toBeUndefined()
  })

  it('preserves a user-supplied class alongside the resolved class', () => {
    const Box = styled('div')`color: ${({ $rocketstyle }: any) => $rocketstyle.color};` as any
    const vnode = Box({
      $rocketstyle: () => ({ color: 'blue' }),
      $rocketstate: () => ({}),
      class: 'extra',
      children: 'x',
    })
    expect(vnode.props.class).toMatch(/^pyr-\w+ extra$/)
  })

  it('resolves a STATIC (non-accessor) $rocketstyle/$rocketstate on the server', () => {
    // Plain-object dimension props (not function accessors) take the
    // `isReactiveRS ? $rs() : $rs` static arm in the SSR fast path.
    const Box = styled('div')`color: ${({ $rocketstyle }: any) => $rocketstyle.color};` as any
    const vnode = Box({
      $rocketstyle: { color: 'rgb(9, 9, 9)' },
      $rocketstate: { state: 's' },
      children: 'static',
    })
    expect(vnode.props.class).toMatch(/^pyr-/)
    expect(vnode.children).toEqual(['static'])
  })

  it('forwards an ARRAY of children in the SSR fast path', () => {
    const Box = styled('div')`color: ${({ $rocketstyle }: any) => $rocketstyle.color};` as any
    const vnode = Box({
      $rocketstyle: () => ({ color: 'red' }),
      $rocketstate: () => ({}),
      children: ['a', 'b'],
    })
    expect(vnode.children).toEqual(['a', 'b'])
  })

  it('emits no children when none are provided in the SSR fast path', () => {
    const Box = styled('div')`color: ${({ $rocketstyle }: any) => $rocketstyle.color};` as any
    const vnode = Box({
      $rocketstyle: () => ({ color: 'red' }),
      $rocketstate: () => ({}),
    })
    expect(vnode.children).toEqual([])
  })
})
