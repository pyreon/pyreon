// @vitest-environment node
//
// SSR fast path × the reactive `$element` / `$text` accessor axis. In a node
// environment `typeof document === 'undefined'` → IS_SERVER is true and
// DynamicStyled resolves the class ONCE per render, calling the accessors to
// materialize their current value (no computed, no renderEffect — the same
// contract the $rocketstyle/$rocketstate accessors already have; see
// styled-ssr-fast-path.test.tsx).
import { describe, expect, it } from 'vitest'
import { styled } from '../styled'

describe('styled — SSR fast path resolves accessor-valued $element/$text', () => {
  it('runs in a server environment (document undefined → IS_SERVER true)', () => {
    expect(typeof document).toBe('undefined')
  })

  it('resolves the class for an accessor-valued $element on the server', () => {
    const Box = styled('div')`
      color: ${({ $element }: any) => $element?.color};
    ` as any
    const vnode = Box({
      $element: () => ({ color: 'rgb(3, 6, 9)' }),
      children: 'hi',
    })
    expect(typeof vnode.props.class).toBe('string')
    expect(vnode.props.class).toMatch(/^pyr-/)
    // No reactive-update ref wrapper on the server.
    expect(vnode.props.ref).toBeUndefined()
  })

  it('resolves the class for an accessor-valued $text on the server', () => {
    const Txt = styled('span')`
      color: ${({ $text }: any) => $text?.color};
    ` as any
    const vnode = Txt({
      $text: () => ({ color: 'rgb(9, 6, 3)' }),
      children: 'hi',
    })
    expect(typeof vnode.props.class).toBe('string')
    expect(vnode.props.class).toMatch(/^pyr-/)
  })
})
