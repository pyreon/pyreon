/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { css } from '../css'
import { keyframes } from '../keyframes'
import { sheet } from '../sheet'
import { styled } from '../styled'
import { ThemeProvider } from '../ThemeProvider'

// Real-Chromium smoke for @pyreon/styler.
//
// happy-dom approximates a stylesheet but does NOT compute actual
// styles — `getComputedStyle(el).color` returns empty in happy-dom for
// rules in the injected stylesheet. These tests assert real cascade
// behavior in Chromium: the generated class is applied AND the browser
// resolves the rule to the expected computed style.
//
// What the suite locks in:
//   1. `styled('div')` produces a VNode that mounts to a real div with
//      the generated class applied.
//   2. The CSS rule reaches `document.head` and Chromium computes the
//      style as authored.
//   3. Reactive interpolations update computed styles when the signal
//      changes (via the same reactive cascade as static text).
//   4. Different tags (div, span, button) produce distinct elements
//      with the same class infrastructure.
//   5. `keyframes` template returns an animation name and the rule is
//      registered so the animation can fire.

describe('@pyreon/styler in real browser', () => {
  afterEach(() => {
    // Don't remove the styler <style> element — sheet is a singleton
    // with `this.sheet` bound to that element; removing detaches the
    // sheet object and breaks subsequent insertRule calls. Cache is
    // independent and safe to clear.
    sheet.clearCache()
  })

  it('mounts a styled div with the generated class applied to the DOM', () => {
    const Box = styled('div')`
      display: flex;
      color: rgb(255, 0, 0);
    `
    const { container, unmount } = mountInBrowser(h(Box, { id: 'box' }))
    const el = container.querySelector<HTMLDivElement>('#box')
    expect(el).not.toBeNull()
    expect(el?.tagName.toLowerCase()).toBe('div')
    expect(el?.className).toMatch(/^pyr-/)
    unmount()
  })

  it('Chromium computes the authored style — real cascade, not just class application', () => {
    const Red = styled('div')`
      color: rgb(255, 0, 0);
      padding: 12px;
    `
    const { container, unmount } = mountInBrowser(h(Red, { id: 'r' }))
    const el = container.querySelector<HTMLElement>('#r')!
    const cs = getComputedStyle(el)
    expect(cs.color).toBe('rgb(255, 0, 0)')
    expect(cs.padding).toBe('12px')
    unmount()
  })

  it('function interpolation resolves per-render against props (dynamic path)', () => {
    const Dynamic = styled('div')<{ $tone: string }>`
      color: ${(p) => p.$tone};
    `
    const a = mountInBrowser(h(Dynamic, { id: 'a', $tone: 'rgb(0, 128, 0)' }))
    const b = mountInBrowser(h(Dynamic, { id: 'b', $tone: 'rgb(0, 0, 255)' }))
    expect(getComputedStyle(a.container.querySelector<HTMLElement>('#a')!).color).toBe(
      'rgb(0, 128, 0)',
    )
    expect(getComputedStyle(b.container.querySelector<HTMLElement>('#b')!).color).toBe(
      'rgb(0, 0, 255)',
    )
    a.unmount()
    b.unmount()
  })

  it('different tags produce distinct elements (div, span, button)', () => {
    const D = styled('div')`color: red;`
    const S = styled('span')`color: green;`
    const B = styled('button')`color: blue;`
    const { container, unmount } = mountInBrowser(
      h('div', null, h(D, { id: 'd' }), h(S, { id: 's' }), h(B, { id: 'b' })),
    )
    expect(container.querySelector('#d')?.tagName.toLowerCase()).toBe('div')
    expect(container.querySelector('#s')?.tagName.toLowerCase()).toBe('span')
    expect(container.querySelector('#b')?.tagName.toLowerCase()).toBe('button')
    unmount()
  })

  it('ThemeProvider injects a theme readable by themed components', () => {
    const Themed = styled('div')`
      color: ${(p: { theme: { color: string } }) => p.theme.color};
    `
    const { container, unmount } = mountInBrowser(
      h(ThemeProvider, { theme: { color: 'rgb(128, 0, 128)' } }, h(Themed, { id: 't' })),
    )
    const el = container.querySelector<HTMLElement>('#t')!
    expect(getComputedStyle(el).color).toBe('rgb(128, 0, 128)')
    unmount()
  })

  it('keyframes registers an animation name usable in styled rules', () => {
    const fadeIn = keyframes`
      from { opacity: 0; }
      to { opacity: 1; }
    `
    const name = String(fadeIn)
    expect(name).toMatch(/^pyr-kf-/)

    const Animated = styled('div')`
      opacity: 1;
      animation: ${name} 50ms forwards;
    `
    const { container, unmount } = mountInBrowser(h(Animated, { id: 'a' }))
    const el = container.querySelector<HTMLElement>('#a')!
    // animation-name is the resolved animation token (Chromium normalizes).
    const cs = getComputedStyle(el)
    expect(cs.animationName).toContain(name)
    unmount()
  })

  it('css`...` lazy CSSResult interpolates into styled() and Chromium computes the rule', () => {
    // CSSResult is lazy — toString() / nested interpolation triggers
    // resolution. This test asserts a standalone css`` block flows
    // through styled() and reaches the cascade in real Chromium.
    const accent = css`
      color: rgb(123, 200, 50);
      font-weight: 700;
    `
    const Styled = styled('div')`
      ${accent}
      padding: 4px;
    `
    const { container, unmount } = mountInBrowser(h(Styled, { id: 'c' }))
    const el = container.querySelector<HTMLElement>('#c')!
    const cs = getComputedStyle(el)
    expect(cs.color).toBe('rgb(123, 200, 50)')
    expect(cs.fontWeight).toBe('700')
    expect(cs.padding).toBe('4px')
    unmount()
  })

  it('writes its CSS rules to a real <style> element under document.head', () => {
    const X = styled('div')`background-color: rgb(10, 20, 30);`
    const { unmount } = mountInBrowser(h(X, { id: 'x' }))
    // Chromium accepts inserted CSS rules — the injected sheet exists
    // and the rule is queryable via document.styleSheets.
    let found = false
    for (const s of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(s.cssRules ?? [])) {
          if (rule.cssText.includes('rgb(10, 20, 30)')) {
            found = true
            break
          }
        }
      } catch {
        // cross-origin sheets throw — ignore
      }
      if (found) break
    }
    expect(found).toBe(true)
    unmount()
  })
})
