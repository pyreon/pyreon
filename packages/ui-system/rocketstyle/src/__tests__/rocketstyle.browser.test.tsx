/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { sheet } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { afterEach, describe, expect, it } from 'vitest'
import rocketstyle from '../init'

// Real-Chromium smoke for @pyreon/rocketstyle.
//
// Production usage wraps component functions (Element/Text/etc.), not
// string tags — so the base is a real ComponentFn here. This also
// satisfies the rocketstyle `ElementType` generic without `as any`.

const Base: ComponentFn<{ id?: string; children?: VNodeChild; class?: string }> = (
  props,
) => h('div', props, props.children)
;(Base as ComponentFn & { displayName?: string }).displayName = 'Base'

describe('@pyreon/rocketstyle in real browser', () => {
  afterEach(() => {
    sheet.clearCache()
  })

  it('rocketstyle(Base) with .theme() applies the authored color in Chromium', () => {
    const Box: any = rocketstyle()({ name: 'Box', component: Base })
      .styles(
        (css: any) => css`
          color: ${({ $rocketstyle }: any) => $rocketstyle.color};
          padding: 8px;
        `,
      )
      .theme({ color: 'rgb(255, 0, 0)' })

    const { container, unmount } = mountInBrowser(h(Box, { id: 'rs' }))
    const el = container.querySelector<HTMLElement>('#rs')!
    expect(el.className).toMatch(/pyr-/)
    expect(getComputedStyle(el).color).toBe('rgb(255, 0, 0)')
    expect(getComputedStyle(el).padding).toBe('8px')
    unmount()
  })

  it('the `state` prop swaps the resolved $rocketstyle theme', () => {
    const Box: any = rocketstyle()({ name: 'StateBox', component: Base })
      .styles(
        (css: any) => css`
          color: ${({ $rocketstyle }: any) => $rocketstyle.color};
        `,
      )
      .theme({ color: 'rgb(255, 0, 0)' })
      .states({ danger: { color: 'rgb(0, 0, 255)' } })

    const base = mountInBrowser(h(Box, { id: 'b' }))
    const danger = mountInBrowser(h(Box, { id: 'd', state: 'danger' }))
    expect(getComputedStyle(base.container.querySelector<HTMLElement>('#b')!).color).toBe(
      'rgb(255, 0, 0)',
    )
    expect(getComputedStyle(danger.container.querySelector<HTMLElement>('#d')!).color).toBe(
      'rgb(0, 0, 255)',
    )
    base.unmount()
    danger.unmount()
  })

  it('reactive mode swap: classList changes in place via styler `isReactiveRS` effect (no remount)', async () => {
    // Exercises the load-bearing `isReactiveRS` effect in
    // styler/src/styled.tsx — when `$rocketstyle` is a function
    // accessor, an effect tracks it and swaps classList in place.
    // Mode switching is the canonical reactive path: PyreonUI
    // provides a signal-backed mode, rocketstyle's
    // `$rocketstyleAccessor` reads `themeAttrs.mode` (a getter on a
    // ReactiveContext), and the styler effect observes the change.
    //
    // (Reactive *dimension props* like `state={stateSig()}` are NOT
    // yet end-to-end reactive through rocketstyle's HOC chain — the
    // inner spread in `rocketstyleAttrsHoc` collapses getter props
    // to values. Mode is the only reactive axis that survives the
    // spread because it flows via ReactiveContext, not via props.)
    const modeSig = signal<'light' | 'dark'>('light')

    const Box: any = rocketstyle()({ name: 'ModeSwapBox', component: Base })
      .styles(
        (css: any) => css`
          color: ${({ $rocketstyle }: any) => $rocketstyle.color};
        `,
      )
      .theme((_t: any, m: any) => ({
        color: m('rgb(255, 0, 0)', 'rgb(0, 0, 255)'),
      }))

    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme: {}, mode: modeSig }, h(Box, { id: 'rx' })),
    )
    const el = container.querySelector<HTMLElement>('#rx')!
    const classBefore = el.className
    expect(getComputedStyle(el).color).toBe('rgb(255, 0, 0)')

    modeSig.set('dark')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))

    const classAfter = el.className
    expect(getComputedStyle(el).color).toBe('rgb(0, 0, 255)')
    // Class swapped in place — not a remount (same element reference,
    // different class). This is the styler `isReactiveRS` effect
    // doing `el.classList.remove(old); el.classList.add(new)`.
    expect(classAfter).not.toBe(classBefore)
    unmount()
  })

  it('the `variant` prop layers on top of state', () => {
    const Box: any = rocketstyle()({ name: 'VariantBox', component: Base })
      .styles(
        (css: any) => css`
          color: ${({ $rocketstyle }: any) => $rocketstyle.color};
          background-color: ${({ $rocketstyle }: any) => $rocketstyle.bg};
        `,
      )
      .theme({ color: 'rgb(0, 0, 0)', bg: 'rgb(240, 240, 240)' })
      .variants({ box: { bg: 'rgb(20, 30, 40)' } })

    const { container, unmount } = mountInBrowser(
      h(Box, { id: 'v', variant: 'box' }),
    )
    const el = container.querySelector<HTMLElement>('#v')!
    expect(getComputedStyle(el).color).toBe('rgb(0, 0, 0)')
    expect(getComputedStyle(el).backgroundColor).toBe('rgb(20, 30, 40)')
    unmount()
  })

  it('the `modifier` transform derives styles from the accumulated state theme', () => {
    const Box: any = rocketstyle()({ name: 'ModBox', component: Base })
      .styles(
        (css: any) => css`
          color: ${({ $rocketstyle }: any) => $rocketstyle.color};
          background-color: ${({ $rocketstyle }: any) => $rocketstyle.bg};
        `,
      )
      .theme({ color: 'rgb(255, 255, 255)', bg: 'rgb(0, 112, 243)' })
      .states({ danger: { color: 'rgb(255, 255, 255)', bg: 'rgb(220, 53, 69)' } })
      .modifiers({
        outlined: (acc: any) => ({
          color: acc.bg,
          bg: 'rgb(255, 255, 255)',
        }),
      })

    const { container, unmount } = mountInBrowser(
      h(Box, { id: 'm', state: 'danger', modifier: 'outlined' }),
    )
    const el = container.querySelector<HTMLElement>('#m')!
    expect(getComputedStyle(el).color).toBe('rgb(220, 53, 69)')
    expect(getComputedStyle(el).backgroundColor).toBe('rgb(255, 255, 255)')
    unmount()
  })

  it('m(light, dark) theme callback resolves per PyreonUI mode', () => {
    const Box: any = rocketstyle()({ name: 'ModeBox', component: Base })
      .styles(
        (css: any) => css`
          color: ${({ $rocketstyle }: any) => $rocketstyle.color};
        `,
      )
      .theme((_t: any, m: any) => ({
        color: m('rgb(12, 34, 56)', 'rgb(210, 220, 230)'),
      }))

    const light = mountInBrowser(
      h(PyreonUI, { theme: {}, mode: 'light' }, h(Box, { id: 'lt' })),
    )
    const dark = mountInBrowser(
      h(PyreonUI, { theme: {}, mode: 'dark' }, h(Box, { id: 'dk' })),
    )
    expect(getComputedStyle(light.container.querySelector<HTMLElement>('#lt')!).color).toBe(
      'rgb(12, 34, 56)',
    )
    expect(getComputedStyle(dark.container.querySelector<HTMLElement>('#dk')!).color).toBe(
      'rgb(210, 220, 230)',
    )
    light.unmount()
    dark.unmount()
  })
})
