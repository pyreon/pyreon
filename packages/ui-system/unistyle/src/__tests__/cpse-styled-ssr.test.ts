/**
 * cpseStyled SSR input-shape proof (node-env).
 *
 * The SSR serializer is proven separately (runtime-server `ssr.test.ts` —
 * `normalizeStyle` preserves `--` custom properties). This proves the OTHER
 * half: cpseStyled emits the right SSR INPUT — a value-agnostic shared class +
 * an inline custom-property style object carrying the converted value. The two
 * together = end-to-end SSR parity, without forcing a runtime-server dep into
 * unistyle.
 */
import { describe, expect, it } from 'vitest'
import { cpseVarName } from '../cpse'
import { cpseStyled } from '../cpse-styled'

interface CpseVNode {
  props: { class?: string; style?: Record<string, string>; id?: string }
}

describe('cpseStyled SSR input shape', () => {
  it('emits a shared class + inline --u var with the converted value', () => {
    const Box = cpseStyled('div')
    const vnode = Box({ styles: { padding: 36 }, id: 'x' }) as unknown as CpseVNode
    expect(typeof vnode.props.class).toBe('string')
    expect(vnode.props.class!.length).toBeGreaterThan(0)
    expect(vnode.props.style![cpseVarName('padding')]).toBe('2.25rem') // 36/16
    expect(vnode.props.id).toBe('x') // rest forwarded
  })

  it('two instances with distinct values share ONE class, carry distinct inline values', () => {
    const Box = cpseStyled('div')
    const a = Box({ styles: { padding: 8 } }) as unknown as CpseVNode
    const b = Box({ styles: { padding: 64 } }) as unknown as CpseVNode
    expect(a.props.class).toBe(b.props.class) // value-agnostic → same class
    const v = cpseVarName('padding')
    expect(a.props.style![v]).toBe('0.5rem')
    expect(b.props.style![v]).toBe('4rem')
  })
})

describe('cpseStyled input-shape edges', () => {
  it('a FUNCTION styles prop (dynamic accessor) resolves like the static form', () => {
    const Box = cpseStyled('div')
    const stat = Box({ styles: { padding: 36 } }) as unknown as CpseVNode
    const dyn = Box({ styles: () => ({ padding: 36 }) } as never) as unknown as CpseVNode
    expect(dyn.props.class).toBe(stat.props.class) // same value-agnostic class
    expect(dyn.props.style![cpseVarName('padding')]).toBe('2.25rem')
  })

  it('merges a user class after the value-agnostic class', () => {
    const Box = cpseStyled('div')
    const v = Box({ styles: { padding: 8 }, class: 'extra' } as never) as unknown as CpseVNode
    expect(v.props.class).toMatch(/ extra$/)
  })

  it('missing / empty styles produce NO class and NO vars (nothing to extract)', () => {
    const Box = cpseStyled('div')
    const none = Box({}) as unknown as CpseVNode
    expect(none.props.class).toBe('')
    const empty = Box({ styles: {} }) as unknown as CpseVNode
    expect(empty.props.class).toBe('')
    expect(Object.keys(empty.props.style ?? {})).toHaveLength(0)
  })

  it('an empty responsive array resolves to no class (responsive path, zero fragments)', () => {
    const Box = cpseStyled('div')
    const v = Box({ styles: { padding: [] } } as never) as unknown as CpseVNode
    expect(v.props.class).toBe('')
  })

  it('forwards children into the rendered element', () => {
    const Box = cpseStyled('div')
    const v = Box({ styles: { padding: 8 }, children: 'hi' } as never) as unknown as {
      children: unknown[]
    }
    expect(v.children).toEqual(['hi'])
  })
})
