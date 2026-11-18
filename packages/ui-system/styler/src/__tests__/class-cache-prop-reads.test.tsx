/**
 * The Tier-2 `classCache` (keyed `$rocketstyle` → `$rocketstate`) must not
 * hand one instance's class to another whose styles read a different prop.
 *
 * A `.styles()` callback may read any prop besides the two rocketstyle
 * objects: the documented `cursor: pointer` gate reads `onClick` / `href`
 * (ui-components' `Base`, the docs kit's `el`), and a template can read the
 * theme. Keyed on the two objects alone, every instance with the same
 * dimension tuple got the class of whichever instance resolved first in the
 * process. On a static site the server had rendered a `<PaperButton
 * variant="primary" onClick>` on an earlier page, so the hydrated submit
 * button (no `onClick`) got a different class on the server and on the
 * client (#4434).
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'
import { TestThemeProvider } from './index'

type AnyComp = (props: Record<string, unknown>) => ReturnType<typeof h>

interface P {
  onClick?: () => void
  href?: string
  $size?: number
  theme: { rootSize?: number }
  $rocketstyle: { color: string }
}

let resolves = 0

const Button = styled('button')`
  color: ${(p: P) => {
    resolves++
    return p.$rocketstyle.color
  }};
  ${(p: P) => (p.onClick || p.href ? 'cursor: pointer;' : '')}
` as unknown as AnyComp

const Sized = styled('div')`
  color: ${(p: P) => p.$rocketstyle.color};
  width: ${(p: P) => `${(p.$size ?? 0) / (p.theme.rootSize ?? 16)}rem`};
` as unknown as AnyComp

const Spreads = styled('div')`
  ${(p: P) => {
    resolves++
    const { ...all } = p
    return `color: ${all.$rocketstyle.color}; ${typeof all.onClick === 'function' ? 'cursor: pointer;' : ''}`
  }}
` as unknown as AnyComp

let cleanups: (() => void)[] = []

function render(Comp: AnyComp, props: Record<string, unknown>, theme: object = {}): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(h(TestThemeProvider as never, { theme }, h(Comp as never, props)), root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })

  return root.firstElementChild as HTMLElement
}

const cssOf = (el: HTMLElement): string =>
  [...document.styleSheets]
    .flatMap((s) => [...s.cssRules].map((r) => r.cssText))
    .filter((t) => [...el.classList].some((c) => t.includes(`.${c}`)))
    .join('\n')

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  resolves = 0
  sheet.clearAll()
})

describe('classCache — props the styles read are part of the key', () => {
  // One `$rocketstyle` / `$rocketstate` pair, as rocketstyle's memo hands the
  // same identities to every instance with the same dimension values.
  const rs = { color: 'rgb(1, 2, 3)' }
  const state = { variant: 'primary' }

  it('an instance without onClick does not get the class of one with it', () => {
    const withClick = render(Button, { $rocketstyle: rs, $rocketstate: state, onClick: () => {} })
    const plain = render(Button, { $rocketstyle: rs, $rocketstate: state })
    expect(cssOf(withClick)).toContain('cursor: pointer')
    expect(plain.className).not.toBe(withClick.className)
    expect(cssOf(plain)).not.toContain('cursor: pointer')
  })

  it('and the other way round (the order the server and the client disagreed on)', () => {
    const plain = render(Button, { $rocketstyle: rs, $rocketstate: state })
    const withHref = render(Button, { $rocketstyle: rs, $rocketstate: state, href: '/x' })
    expect(withHref.className).not.toBe(plain.className)
    expect(cssOf(withHref)).toContain('cursor: pointer')
  })

  it('still hits: a different handler of the same kind reuses the class without resolving', () => {
    const a = render(Button, { $rocketstyle: rs, $rocketstate: state, onClick: () => {} })
    const after = resolves
    const b = render(Button, { $rocketstyle: rs, $rocketstate: state, onClick: () => {} })
    const c = render(Button, { $rocketstyle: rs, $rocketstate: state, onClick: () => {} })
    expect(b.className).toBe(a.className)
    expect(c.className).toBe(a.className)
    expect(resolves).toBe(after)
  })

  it('a primitive prop the styles read is keyed by value, the theme by identity', () => {
    const theme = { rootSize: 16 }
    const a = render(Sized, { $rocketstyle: rs, $rocketstate: state, $size: 32 }, theme)
    const b = render(Sized, { $rocketstyle: rs, $rocketstate: state, $size: 64 }, theme)
    const c = render(Sized, { $rocketstyle: rs, $rocketstate: state, $size: 32 }, { rootSize: 8 })
    expect(cssOf(a)).toContain('width: 2rem')
    expect(cssOf(b)).toContain('width: 4rem')
    expect(cssOf(c)).toContain('width: 4rem')
    expect(render(Sized, { $rocketstyle: rs, $rocketstate: state, $size: 32 }, theme).className).toBe(a.className)
  })

  it('styles that enumerate the props are not cached at all', () => {
    const withClick = render(Spreads, { $rocketstyle: rs, $rocketstate: state, onClick: () => {} })
    const plain = render(Spreads, { $rocketstyle: rs, $rocketstate: state })
    expect(cssOf(withClick)).toContain('cursor: pointer')
    expect(cssOf(plain)).not.toContain('cursor: pointer')
    expect(resolves).toBe(2)
  })
})
