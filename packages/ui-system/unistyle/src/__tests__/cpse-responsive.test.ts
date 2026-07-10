/**
 * cpseStyled responsive — per-breakpoint inline custom properties (node).
 * The media-cascade CORRECTNESS (viewport switch flips the computed value) is
 * proven in the e2e (ssr-showcase /cpse-probe responsive box + viewport spec);
 * this asserts the SSR INPUT: a responsive value expands to one suffixed inline
 * custom property per breakpoint, with the converted value.
 * See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 */
import { describe, expect, it } from 'vitest'
import { cpseVarName } from '../cpse'
import { cpseStyled } from '../cpse-styled'

interface CpseVNode {
  props: { class?: string; style?: Record<string, string> }
}

describe('cpseStyled responsive', () => {
  it('mobile-first array → per-breakpoint suffixed inline vars (xs, sm)', () => {
    const Box = cpseStyled('div')
    const v = Box({ styles: { padding: [8, 16] } }) as unknown as CpseVNode
    // Default breakpoints sort to [xs(0), sm, md, lg, xl]; array index → bp.
    expect(v.props.style![cpseVarName('padding', 'xs')]).toBe('0.5rem') // 8/16, base
    expect(v.props.style![cpseVarName('padding', 'sm')]).toBe('1rem') // 16/16, sm
    expect(v.props.style![cpseVarName('padding', 'md')]).toBeUndefined() // not specified
    expect(typeof v.props.class).toBe('string')
    expect(v.props.class!.length).toBeGreaterThan(0)
  })

  it('breakpoint object → only the specified breakpoints get vars', () => {
    const Box = cpseStyled('div')
    const v = Box({ styles: { padding: { sm: 16, lg: 32 } } }) as unknown as CpseVNode
    expect(v.props.style![cpseVarName('padding', 'sm')]).toBe('1rem')
    expect(v.props.style![cpseVarName('padding', 'lg')]).toBe('2rem') // 32/16
    expect(v.props.style![cpseVarName('padding', 'xs')]).toBeUndefined()
    expect(v.props.style![cpseVarName('padding', 'md')]).toBeUndefined()
  })

  it('a SCALAR prop inside a responsive theme lands on the base breakpoint', () => {
    const Box = cpseStyled('div')
    // `padding` responsive forces the responsive expansion; `margin` is a
    // plain scalar and must ride on the base (xs) breakpoint, not vanish.
    const v = Box({ styles: { padding: [8, 16], margin: 4 } }) as unknown as CpseVNode
    expect(v.props.style![cpseVarName('padding', 'xs')]).toBe('0.5rem')
    expect(v.props.style![cpseVarName('padding', 'sm')]).toBe('1rem')
    expect(v.props.style![cpseVarName('margin', 'xs')]).toBe('0.25rem') // 4/16, base
  })

  it('two instances with distinct responsive values share ONE class (value-agnostic)', () => {
    const Box = cpseStyled('div')
    const a = Box({ styles: { padding: [8, 16] } }) as unknown as CpseVNode
    const b = Box({ styles: { padding: [20, 40] } }) as unknown as CpseVNode
    expect(a.props.class).toBe(b.props.class) // same shape (padding at xs+sm) → same class…
    expect(a.props.style![cpseVarName('padding', 'sm')]).toBe('1rem') // …distinct inline values
    expect(b.props.style![cpseVarName('padding', 'sm')]).toBe('2.5rem') // 40/16
  })

  it('custom breakpoints prop is honored', () => {
    const Box = cpseStyled('div')
    const v = Box({
      styles: { padding: [8, 16] },
      breakpoints: { base: 0, wide: 1000 },
    }) as unknown as CpseVNode
    expect(v.props.style![cpseVarName('padding', 'base')]).toBe('0.5rem')
    expect(v.props.style![cpseVarName('padding', 'wide')]).toBe('1rem')
  })
})
