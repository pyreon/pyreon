/**
 * Edges of the sheet's eviction contract (`isLive` / `retain` / the deferred,
 * live-DOM-aware client pass) and of the theme-keyed `$element` cache. The
 * end-to-end regressions live in `eviction-dependents*.test.ts*` and
 * `el-class-cache-theme.test.tsx`.
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createSheet, sheet } from '../sheet'
import { setStyleExtraction, styled } from '../styled'
import { ThemeProvider } from '../ThemeProvider'

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

describe('StyleSheet eviction contract', () => {
  it('isLive is true until the first removal, then tracks the cache', async () => {
    const s = createSheet({ maxCacheSize: 10 })
    const first = s.insert('--edge-a: 1;')
    expect(s.isLive('pyr-never-inserted')).toBe(true) // nothing removed yet
    for (let i = 0; i < 12; i++) s.insert(`--edge-fill-${i}: 1;`)
    await Promise.resolve()
    expect(s.isLive(first)).toBe(false)
    expect(s.isLive('pyr-never-inserted')).toBe(false)
    expect(s.isLive('')).toBe(true) // the empty class needs no rule
  })

  it('retain is refcounted, and its release is idempotent', async () => {
    const s = createSheet({ maxCacheSize: 10 })
    const key = s.insertGlobal('html { --held: 1; }')
    const r1 = s.retain(key)
    const r2 = s.retain(key)
    r1()
    r1() // second call is a no-op — must not drop r2's hold
    for (let i = 0; i < 12; i++) s.insert(`--retain-fill-${i}: 1;`)
    await Promise.resolve()
    expect(s.has(key)).toBe(true)
    r2()
    for (let i = 0; i < 12; i++) s.insert(`--retain-fill2-${i}: 1;`)
    await Promise.resolve()
    expect(s.has(key)).toBe(false)
  })

  it('a release after the sheet was cleared is harmless', () => {
    const s = createSheet()
    const release = s.retain(s.insertGlobal('html { --cleared: 1; }'))
    s.clearCache()
    expect(() => release()).not.toThrow()
  })

  it('the deferred client pass is skipped when the cache shrank back under the cap first', async () => {
    const s = createSheet({ maxCacheSize: 10 })
    for (let i = 0; i < 12; i++) s.insert(`--shrink-${i}: 1;`)
    s.clearCache() // before the microtask runs
    const kept = s.insert('--after-clear: 1;')
    await Promise.resolve()
    expect(s.has(kept)).toBe(true)
    expect(s.cacheSize).toBe(1)
  })

  it('the live-DOM scan ignores non-styler classes', async () => {
    const s = createSheet({ maxCacheSize: 10 })
    const used = s.insert('--used-by-dom: 1;')
    const el = document.createElement('div')
    el.className = `app-shell ${used}`
    document.body.appendChild(el)
    try {
      for (let i = 0; i < 12; i++) s.insert(`--dom-fill-${i}: 1;`)
      await Promise.resolve()
      expect(s.has(used)).toBe(true)
    } finally {
      el.remove()
    }
  })

  it('clearing an empty sheet is not a removal (isLive keeps its fast path)', () => {
    const s = createSheet()
    s.reset()
    s.clearCache()
    s.clearAll()
    expect(s.isLive('pyr-anything')).toBe(true)
  })
})

describe('$element cache — theme key and CPSE vars', () => {
  type AnyComp = (props: Record<string, unknown>) => VNode

  it('a non-object theme still caches (shared no-theme bucket)', () => {
    const Box = styled('div')`
      color: ${(p: { $element: { c: string } }) => p.$element.c};
    ` as unknown as AnyComp
    const bundle = { c: 'rgb(31, 32, 33)' }
    const classes: string[] = []
    for (let i = 0; i < 2; i++) {
      const root = document.createElement('div')
      const dispose = mount(
        h(ThemeProvider as never, { theme: null }, h(Box as never, { $element: bundle })),
        root,
      )
      classes.push((root.firstElementChild as HTMLElement).className)
      dispose()
    }
    expect(classes[0]).toMatch(/^pyr-/)
    expect(classes[1]).toBe(classes[0])
  })

  it('CPSE vars are cached per bundle and per $childFix, and restored on a hit', () => {
    setStyleExtraction(true, fakeRewrite)
    const Box = styled('div')`
      padding: ${(p: { $element: { p: string } }) => p.$element.p};
    ` as unknown as AnyComp
    const a = { p: '8px' }
    const b = { p: '16px' }
    Box({ $element: a })
    Box({ $element: b }) // second bundle under the same theme
    Box({ $element: a, $childFix: true }) // second $childFix under the same bundle
    expect(Box({ $element: a }).props.style).toEqual({ '--u-padding': '8px' })
    expect(Box({ $element: b }).props.style).toEqual({ '--u-padding': '16px' })
  })

  it('a cached empty class with no CPSE vars restores none', () => {
    setStyleExtraction(true, fakeRewrite)
    const Empty = styled('div')`
      ${(p: { $element: { css: string } }) => p.$element.css}
    ` as unknown as AnyComp
    const bundle = { css: '' }
    Empty({ $element: bundle })
    const hit = Empty({ $element: bundle })
    expect(hit.props.class ?? '').toBe('')
    expect(hit.props.style).toBeUndefined()
  })
})
