/** @jsxImportSource @pyreon/core */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { sheet, styled } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import rocketstyle from '../init'

// Consumer-reported shape: rocketstyle-wrapped Button with signal-driven
// `href` prop (e.g. `href={isHover() ? '/a' : '/b'}`). The compile-only
// test proves the compiler emits `_rp(() => …)` but does NOT prove the
// downstream HOC chain preserves the getter descriptor. This test wires
// the full path: _rp brand → makeReactiveProps → rocketstyle attrs HOC →
// styled() → DOM.

describe('reactive href on rocketstyle-wrapped styled(a)', () => {
  afterEach(() => {
    sheet.clearCache()
  })

  it('BASELINE: styled("a") alone reactively patches href on signal flip', async () => {
    const Anchor: any = styled('a')`
      color: blue;
    `
    const url = signal('/initial')
    const rawProps = { href: _rp(() => url()), 'data-testid': 'baseline' }

    const { container, unmount } = mountInBrowser(h(Anchor, rawProps))
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="baseline"]')!
    expect(el.getAttribute('href')).toBe('/initial')

    url.set('/updated')
    await Promise.resolve()
    expect(el.getAttribute('href')).toBe('/updated')

    url.set('/third')
    await Promise.resolve()
    expect(el.getAttribute('href')).toBe('/third')

    unmount()
  })

  it('CONSUMER BUG: rocketstyle(styled("a")) with signal-driven href reactively patches', async () => {
    const Anchor: any = styled('a')`
      color: blue;
    `
    const Button: any = rocketstyle()({ name: 'AnchorButton', component: Anchor })

    const url = signal('/initial')
    const rawProps = { href: _rp(() => url()), 'data-testid': 'consumer' }

    const { container, unmount } = mountInBrowser(h(Button, rawProps))
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="consumer"]')!
    expect(el.getAttribute('href')).toBe('/initial')

    url.set('/updated')
    await Promise.resolve()
    expect(el.getAttribute('href')).toBe('/updated')

    url.set('/third')
    await Promise.resolve()
    expect(el.getAttribute('href')).toBe('/third')

    unmount()
  })

  it('CONSUMER BUG (ternary shape): href={hover() ? "/a" : "/b"}', async () => {
    const Anchor: any = styled('a')`
      color: blue;
    `
    const Button: any = rocketstyle()({ name: 'TernaryButton', component: Anchor })

    const hover = signal(false)
    const rawProps = {
      href: _rp(() => (hover() ? '/a' : '/b')),
      'data-testid': 'ternary',
    }

    const { container, unmount } = mountInBrowser(h(Button, rawProps))
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="ternary"]')!
    expect(el.getAttribute('href')).toBe('/b')

    hover.set(true)
    await Promise.resolve()
    expect(el.getAttribute('href')).toBe('/a')

    hover.set(false)
    await Promise.resolve()
    expect(el.getAttribute('href')).toBe('/b')

    unmount()
  })
})
