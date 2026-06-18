/**
 * Production-mode coverage for the dev-only gates across styler.
 *
 * Every `process.env.NODE_ENV !== 'production'` guard (perf-counter sink,
 * `validateDevCss`, the `insertRule` failure `console.warn`s) takes its
 * dev branch under vitest's default `NODE_ENV` ('test'). Stubbing
 * `NODE_ENV` to 'production' drives the OTHER side: the counter sink and
 * validator are skipped, and `insertRule` failures are swallowed silently
 * (no `console.warn`). The gates read `process.env.NODE_ENV` at the call
 * site every time, so no module re-import is needed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { css } from '../css'
import { resolve } from '../resolve'
import { StyleSheet } from '../sheet'
import { styled } from '../styled'

describe('styler — production-mode dev-gate false branches', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('resolve() skips the perf-counter sink in production (resolve.ts:83)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const sink = vi.fn()
    ;(globalThis as { __pyreon_count__?: unknown }).__pyreon_count__ = sink
    try {
      const tpl = css`
        color: red;
      `
      const out = resolve(tpl.strings, tpl.values, {})
      expect(out).toContain('color: red')
      // Dev gate is `!== 'production'`, so in production the sink is NOT called.
      expect(sink).not.toHaveBeenCalled()
    } finally {
      delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
    }
  })

  it('insert() skips validateDevCss + counter in production (sheet.ts:312,339)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet()
    // 'NaNrem' would warn in dev; in production validateDevCss early-returns.
    const cls = s.insert('padding: NaNrem;')
    expect(cls).toMatch(/^pyr-/)
    expect(warn).not.toHaveBeenCalled()
  })

  it('insert() cache-hit skips the hit counter in production (sheet.ts:347)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const s = new StyleSheet()
    const first = s.insert('color: blue;')
    // Second insert of identical CSS hits the insertCache fast path; the
    // hit-counter branch is gated on `!== 'production'`.
    const second = s.insert('color: blue;')
    expect(second).toBe(first)
  })

  it('insert() swallows insertRule failures silently in production (sheet.ts:389)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet()
    const realSheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
    if (!realSheet) return
    const Proto = Object.getPrototypeOf(realSheet) as CSSStyleSheet
    const orig = Proto.insertRule
    Proto.insertRule = function () {
      throw new Error('boom')
    }
    try {
      expect(() => s.insert('color: green;')).not.toThrow()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      Proto.insertRule = orig
    }
  })

  it('insertKeyframes() swallows failures silently in production (sheet.ts:418)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet()
    const realSheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
    if (!realSheet) return
    const Proto = Object.getPrototypeOf(realSheet) as CSSStyleSheet
    const orig = Proto.insertRule
    Proto.insertRule = function () {
      throw new Error('boom')
    }
    try {
      expect(() => s.insertKeyframes('spin', 'from{opacity:0}to{opacity:1}')).not.toThrow()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      Proto.insertRule = orig
    }
  })

  it('insertGlobal() swallows failures silently in production (sheet.ts:473)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet()
    const realSheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
    if (!realSheet) return
    const Proto = Object.getPrototypeOf(realSheet) as CSSStyleSheet
    const orig = Proto.insertRule
    Proto.insertRule = function () {
      throw new Error('boom')
    }
    try {
      expect(() => s.insertGlobal('body { margin: 0; }')).not.toThrow()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      Proto.insertRule = orig
    }
  })

  it('DynamicStyled elClassCache hit skips its counter in production (styled.tsx:271)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const elObj = { direction: 'rows' }
    const Comp = styled('div')`color: ${() => 'rgb(0, 1, 2)'};` as (p: Record<string, unknown>) => {
      props: Record<string, unknown>
    }
    // First render populates the elClassCache; the second is a cache HIT,
    // whose `styler.elClassCache.hit` counter is gated on `!== 'production'`.
    const v1 = Comp({ $element: elObj, $childFix: false })
    const v2 = Comp({ $element: elObj, $childFix: false })
    expect(v2.props.class).toBe(v1.props.class)
  })

  it('StaticStyled hot path skips the hit counter in production (styled.tsx:165)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    // A fully-static (no interpolation) component takes the StaticStyled
    // path; calling it with no extra props returns the pre-built VNode and
    // the perf-counter `staticVNode.hit` emit is gated on `!== 'production'`.
    const Box = styled('div')`
      color: red;
    ` as (p: Record<string, unknown>) => { props: Record<string, unknown> }
    const vnode = Box({})
    expect(vnode.props.class).toMatch(/^pyr-/)
    // Second call returns the same cached VNode without the hit counter.
    const vnode2 = Box({})
    expect(vnode2).toBe(vnode)
  })

  it('injectRules() swallows failures silently in production (sheet.ts:538)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet()
    const realSheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
    if (!realSheet) return
    const Proto = Object.getPrototypeOf(realSheet) as CSSStyleSheet
    const orig = Proto.insertRule
    Proto.insertRule = function () {
      throw new Error('boom')
    }
    try {
      expect(() => s.injectRules(['.pyr-bad{invalid}'], 'prod-key')).not.toThrow()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      Proto.insertRule = orig
    }
  })
})
