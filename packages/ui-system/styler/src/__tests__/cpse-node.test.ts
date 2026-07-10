/**
 * Node/happy-dom coverage for two pure-JS `styled.tsx` paths that were
 * previously exercised ONLY by real-Chromium suites:
 *
 * - CPSE (Custom-Property Style Extraction): `setStyleExtraction` +
 *   `mergeCpseStyle` + the `doResolve` rewrite arm + the `$element`
 *   cache-hit vars restore. The end-to-end computed-style proof lives in
 *   `elements/src/__tests__/cpse-style-extraction.browser.test.tsx`
 *   (real Chromium, real `cpseRewrite` from unistyle); THESE specs lock
 *   the styler-side contract with a fake rewrite (styler cannot import
 *   unistyle — dep direction), so the node gate measures the real code.
 *
 * - `innerRef` → `ref` alias (the anti-patterns "innerRef on styled()
 *   silently fails" fix). The browser proof is styler.browser.test.tsx;
 *   the alias itself is a pure props transform, assertable on the vnode.
 */
import type { VNode } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { setStyleExtraction, styled } from '../styled'

// Fake rewrite with the same shape as unistyle's cpseRewrite: pull every
// declaration VALUE into a custom property keyed by the prop name.
const fakeRewrite = (cssText: string, varsOut: Record<string, string>): string =>
  cssText.replace(/([a-z-]+)\s*:\s*([^;]+);/g, (_m, prop: string, value: string) => {
    const key = `--u-${prop}`
    varsOut[key] = value.trim()
    return `${prop}: var(${key});`
  })

afterEach(() => {
  setStyleExtraction(false)
  sheet.clearAll()
})

describe('CPSE — styler-side contract (fake rewrite, node)', () => {
  it('flag ON: distinct values share ONE value-agnostic class; vars ride as inline style', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      padding: ${((props: Record<string, unknown>) => props.p as string) as never};
    `
    const a = Box({ p: '8px' } as never) as VNode
    const b = Box({ p: '16px' } as never) as VNode
    // Value-agnostic rule → same class for distinct values (the O(1)-rules win).
    expect(a.props.class).toBe(b.props.class)
    // Per-instance value rides as an inline custom property.
    expect(a.props.style).toEqual({ '--u-padding': '8px' })
    expect(b.props.style).toEqual({ '--u-padding': '16px' })
  })

  it('flag OFF (default): classic value-baked rules — distinct classes, no vars', () => {
    const Box = styled('div')`
      padding: ${((props: Record<string, unknown>) => props.p as string) as never};
    `
    const a = Box({ p: '8px' } as never) as VNode
    const b = Box({ p: '16px' } as never) as VNode
    expect(a.props.class).not.toBe(b.props.class)
    expect(a.props.style).toBeUndefined()
  })

  it('merges vars into a pre-existing STRING style without clobbering it', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      padding: ${((props: Record<string, unknown>) => props.p as string) as never};
    `
    const v = Box({ p: '8px', style: 'color: blue' } as never) as VNode
    expect(v.props.style).toContain('color: blue;')
    expect(v.props.style).toContain('--u-padding:8px;')
  })

  it('merges vars into a pre-existing OBJECT style without clobbering it', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      padding: ${((props: Record<string, unknown>) => props.p as string) as never};
    `
    const v = Box({ p: '8px', style: { color: 'blue' } } as never) as VNode
    expect(v.props.style).toEqual({ color: 'blue', '--u-padding': '8px' })
  })

  it('merging into a string style that already ends with ";" adds no double separator', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      padding: ${((props: Record<string, unknown>) => props.p as string) as never};
    `
    const v = Box({ p: '8px', style: 'color: blue;' } as never) as VNode
    expect(v.props.style).toBe('color: blue;--u-padding:8px;')
  })

  it('the reactive-rocketstyle path is EXCLUDED from CPSE (stays classic)', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      color: ${(({ $rocketstyle }: { $rocketstyle: { c: string } }) => $rocketstyle.c) as never};
    `
    const v = Box({
      $rocketstyle: { c: 'red' },
      $rocketstate: { state: 's' },
    } as never) as VNode
    // No inline vars — the rocketstyle classCache path keeps value-baked rules.
    expect(v.props.style).toBeUndefined()
    expect(v.props.class).toMatch(/^pyr-/)
  })

  it('an elClassCache HIT restores the cached vars (cpseVarsCache survives the hit)', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      padding: ${((props: Record<string, unknown>) => (props.$element as { p: string }).p) as never};
    `
    // Same $element identity twice — the 2nd call is a cache hit that skips
    // resolve; the vars must still reach the instance's inline style.
    const $element = { p: '4px' }
    const first = Box({ $element } as never) as VNode
    const second = Box({ $element } as never) as VNode
    expect(second.props.class).toBe(first.props.class)
    expect(second.props.style).toEqual({ '--u-padding': '4px' })
  })
})

describe('innerRef → ref alias (pure props transform)', () => {
  it('aliases innerRef to ref and drops the invalid innerref attr', () => {
    const Box = styled('input')`
      color: red;
    `
    const fn = (): void => {}
    const v = Box({ innerRef: fn } as never) as VNode
    expect(v.props.ref).toBe(fn)
    expect('innerRef' in v.props).toBe(false)
  })

  it('an explicit ref wins over innerRef (alias must not clobber)', () => {
    const Box = styled('input')`
      color: red;
    `
    const refFn = (): void => {}
    const innerFn = (): void => {}
    const v = Box({ ref: refFn, innerRef: innerFn } as never) as VNode
    expect(v.props.ref).toBe(refFn)
  })
})
