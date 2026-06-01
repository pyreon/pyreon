/** @jsxImportSource @pyreon/core */
/**
 * Heavy real-Chromium coverage for the chained-HOC + reactive-prop
 * contract. Locks the consumer-reported regression: `<Button href={signal()
 * ? a : b}>` (rocketstyle-wrapped) stayed static because
 * `createLocalProvider` (the HOC inserted when `provider: true`)
 * value-spread props at entry, snapshot-reading every getter descriptor.
 *
 * This file complements `createLocalProvider.descriptors.test.ts` (unit
 * level — proves no getter fires at HOC setup) by running the FULL
 * mount pipeline through real Chromium and verifying that signal flips
 * actually patch the DOM. Both layers are bisect-verifiable: revert the
 * `createLocalProvider.ts` fix → unit tests AND these e2e tests both
 * fail.
 *
 * Coverage matrix (all `provider: true` — the consumer-reported surface):
 *   - bare `rocketstyle(styled('a'))`
 *   - `.config({ component: 'a' })`
 *   - `.attrs(() => ({}))`
 *   - `.theme(() => ({ ... }))`
 *   - `.states({ primary: ..., secondary: ... })`
 *   - `.sizes({ small: ..., large: ... })`
 *   - `.compose({})`
 *   - Full chain stack (all of the above combined)
 *   - Signal-driven `href` (the canonical reported case)
 *   - Signal-driven ternary expression
 *   - Signal-driven `class` (string-typed reactive prop)
 *   - Signal-driven `data-*` custom attribute
 *   - Multiple reactive props on the same component
 *   - Reactive + static props mixed
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { sheet } from '@pyreon/styler'
import { styled } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import rocketstyle from '../init'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  sheet.clearCache()
})

// ─── Helper factories — minimize boilerplate ────────────────────────────────
//
// API note: rocketstyle()(initOpts) — bare `rocketstyle()` returns a factory;
// the factory is then called with `{ name, component }` to register a
// rocketstyle component. Chain methods (.theme / .states / .sizes / .attrs /
// .compose / .config) return the same builder for further composition.

let counter = 0
const uniqueName = () => `Btn${++counter}`

const makeBareRocketstyle = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor })
}

const makeWithConfig = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor }).config({ component: Anchor })
}

const makeWithAttrs = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor }).attrs(() => ({}))
}

const makeWithTheme = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor })
    .attrs(() => ({}))
    .theme(() => ({ background: 'red' }))
}

const makeWithStates = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor }).states({
    primary: () => ({ background: 'red' }),
    secondary: () => ({ background: 'green' }),
  })
}

const makeWithSizes = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor }).sizes({
    small: () => ({ padding: '4px' }),
    large: () => ({ padding: '16px' }),
  })
}

const makeWithCompose = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor }).compose({})
}

const makeFullChain = (): any => {
  const Anchor: any = styled('a')`color: blue;`
  return rocketstyle()({ name: uniqueName(), component: Anchor })
    .attrs(() => ({}))
    .theme(() => ({ background: 'red' }))
    .states({
      primary: () => ({ background: 'navy' }),
      secondary: () => ({ background: 'darkgreen' }),
    })
    .sizes({
      small: () => ({ padding: '4px' }),
      large: () => ({ padding: '16px' }),
    })
}

// ─── 1) Per-chain reactive href ─────────────────────────────────────────────

describe('reactive href via signal — every chain shape patches DOM live', () => {
  const cases: Array<[string, () => any]> = [
    ['bare rocketstyle(styled("a"))', makeBareRocketstyle],
    ['+ .config()', makeWithConfig],
    ['+ .config() + .attrs()', makeWithAttrs],
    ['+ .config() + .attrs() + .theme()', makeWithTheme],
    ['+ .config() + .states()', makeWithStates],
    ['+ .config() + .sizes()', makeWithSizes],
    ['+ .config() + .compose({})', makeWithCompose],
    ['full chain (.config + .attrs + .theme + .states + .sizes)', makeFullChain],
  ]

  for (const [name, factory] of cases) {
    it(`patches href on signal flip: ${name}`, async () => {
      const Button = factory()
      const url = signal('/initial')

      const { container } = mountInBrowser(
        h(Button, { href: _rp(() => url()), 'data-testid': 'btn' }),
      )
      const el = container.querySelector<HTMLAnchorElement>('[data-testid="btn"]')
      expect(el).not.toBeNull()
      expect(el!.getAttribute('href')).toBe('/initial')

      url.set('/updated')
      await flush()
      expect(el!.getAttribute('href')).toBe('/updated')

      url.set('/third')
      await flush()
      expect(el!.getAttribute('href')).toBe('/third')
    })
  }
})

// ─── 2) Ternary expressions over signals ────────────────────────────────────

describe('reactive ternary on chained rocketstyle component', () => {
  it('full chain: href={hover() ? "/a" : "/b"} flips on signal change', async () => {
    const Button = makeFullChain()
    const hover = signal(false)

    const { container } = mountInBrowser(
      h(Button, {
        href: _rp(() => (hover() ? '/a' : '/b')),
        'data-testid': 'ternary-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="ternary-btn"]')!
    expect(el.getAttribute('href')).toBe('/b')

    hover.set(true)
    await flush()
    expect(el.getAttribute('href')).toBe('/a')

    hover.set(false)
    await flush()
    expect(el.getAttribute('href')).toBe('/b')
  })

  it('with .theme(): href={cond() ? a : b}', async () => {
    const Button = makeWithTheme()
    const cond = signal(false)
    const { container } = mountInBrowser(
      h(Button, {
        href: _rp(() => (cond() ? '/yes' : '/no')),
        'data-testid': 'cond-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="cond-btn"]')!
    expect(el.getAttribute('href')).toBe('/no')
    cond.set(true)
    await flush()
    expect(el.getAttribute('href')).toBe('/yes')
  })
})

// ─── 3) Other typed-string props (not just href) ────────────────────────────

describe('reactive class / data-* / aria-* on chained rocketstyle', () => {
  it('full chain: reactive class swaps on signal change', async () => {
    const Button = makeFullChain()
    const variant = signal('btn-default')

    const { container } = mountInBrowser(
      h(Button, {
        class: _rp(() => variant()),
        'data-testid': 'cls-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="cls-btn"]')!
    expect(el.getAttribute('class')).toContain('btn-default')

    variant.set('btn-active')
    await flush()
    expect(el.getAttribute('class')).toContain('btn-active')
  })

  it('full chain: reactive data-* attribute updates', async () => {
    const Button = makeFullChain()
    const tag = signal('initial')

    const { container } = mountInBrowser(
      h(Button, {
        'data-tag': _rp(() => tag()),
        'data-testid': 'tag-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="tag-btn"]')!
    expect(el.getAttribute('data-tag')).toBe('initial')

    tag.set('updated')
    await flush()
    expect(el.getAttribute('data-tag')).toBe('updated')
  })

  it('full chain: reactive aria-label updates', async () => {
    const Button = makeFullChain()
    const label = signal('original')

    const { container } = mountInBrowser(
      h(Button, {
        'aria-label': _rp(() => label()),
        'data-testid': 'aria-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="aria-btn"]')!
    expect(el.getAttribute('aria-label')).toBe('original')

    label.set('changed')
    await flush()
    expect(el.getAttribute('aria-label')).toBe('changed')
  })
})

// ─── 4) Multiple reactive props on the same component ──────────────────────

describe('reactive props — multiple signals on the same rocketstyle component', () => {
  it('full chain: href AND data-id AND aria-label all live + independent', async () => {
    const Button = makeFullChain()
    const url = signal('/a')
    const id = signal('id-1')
    const lbl = signal('label-1')

    const { container } = mountInBrowser(
      h(Button, {
        href: _rp(() => url()),
        'data-id': _rp(() => id()),
        'aria-label': _rp(() => lbl()),
        'data-testid': 'multi-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="multi-btn"]')!
    expect(el.getAttribute('href')).toBe('/a')
    expect(el.getAttribute('data-id')).toBe('id-1')
    expect(el.getAttribute('aria-label')).toBe('label-1')

    // Flip only url
    url.set('/b')
    await flush()
    expect(el.getAttribute('href')).toBe('/b')
    expect(el.getAttribute('data-id')).toBe('id-1') // unchanged
    expect(el.getAttribute('aria-label')).toBe('label-1') // unchanged

    // Flip only id
    id.set('id-2')
    await flush()
    expect(el.getAttribute('href')).toBe('/b') // unchanged
    expect(el.getAttribute('data-id')).toBe('id-2')

    // Flip only lbl
    lbl.set('label-2')
    await flush()
    expect(el.getAttribute('aria-label')).toBe('label-2')
  })
})

// ─── 5) Mixed reactive + static props ──────────────────────────────────────

describe('reactive + static prop mix on chained rocketstyle', () => {
  it('static class / data-static-id + reactive href all forwarded', async () => {
    const Button = makeFullChain()
    const url = signal('/start')

    const { container } = mountInBrowser(
      h(Button, {
        class: 'static-cls',
        'data-static-id': 'static-42',
        href: _rp(() => url()),
        'data-testid': 'mixed-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="mixed-btn"]')!
    expect(el.getAttribute('data-static-id')).toBe('static-42')
    expect(el.getAttribute('class')).toContain('static-cls')
    expect(el.getAttribute('href')).toBe('/start')

    url.set('/end')
    await flush()
    // Static attributes unchanged; reactive one updated.
    expect(el.getAttribute('data-static-id')).toBe('static-42')
    expect(el.getAttribute('href')).toBe('/end')
  })
})

// ─── 6) Event handler interaction — confirm HOC still wires its own ────────

describe('rocketstyle .provider HOC — pseudo-state events + reactive props coexist', () => {
  it('user event handler fires AND reactive href patches independently', async () => {
    const Button = makeFullChain()
    // Use `#` href so an accidentally-default-firing click doesn't
    // trigger a navigation that would disconnect the test iframe.
    const url = signal('#x')
    let userMouseEnters = 0
    let userMouseLeaves = 0

    const { container } = mountInBrowser(
      h(Button, {
        href: _rp(() => url()),
        onMouseEnter: () => userMouseEnters++,
        onMouseLeave: () => userMouseLeaves++,
        'data-testid': 'evt-btn',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="evt-btn"]')!

    // Reactive prop still works after the HOC wires its own event handlers
    url.set('#y')
    await flush()
    expect(el.getAttribute('href')).toBe('#y')

    // User events still fire — the HOC chains them after its own
    // pseudo-state bookkeeping. dispatchEvent (not .click()) avoids the
    // default-navigate that would disconnect the test iframe.
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    expect(userMouseEnters).toBe(1)

    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    expect(userMouseLeaves).toBe(1)

    // Reactive prop still independent of event delivery
    url.set('#z')
    await flush()
    expect(el.getAttribute('href')).toBe('#z')
  })
})
