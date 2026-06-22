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
