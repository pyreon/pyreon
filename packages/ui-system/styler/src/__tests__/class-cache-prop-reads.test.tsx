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

describe('classCache — how a prop is read', () => {
  const rs = { color: 'rgb(4, 5, 6)' }
  const state = { variant: 'secondary' }

  it("`'x' in props` is keyed on presence, not only on value", () => {
    const Has = styled('div')`
      color: ${(p: P) => p.$rocketstyle.color};
      ${(p: P) => ('$flag' in p ? 'font-weight: 700;' : '')}
    ` as unknown as AnyComp
    const absent = render(Has, { $rocketstyle: rs, $rocketstate: state })
    const presentUndefined = render(Has, { $rocketstyle: rs, $rocketstate: state, $flag: undefined })
    expect(cssOf(absent)).not.toContain('font-weight: 700')
    expect(cssOf(presentUndefined)).toContain('font-weight: 700')
  })

  it('Object.getOwnPropertyDescriptor(props, key) is recorded as a read', () => {
    const Desc = styled('div')`
      color: ${(p: P) => p.$rocketstyle.color};
      ${(p: P) => (Object.getOwnPropertyDescriptor(p, '$wide')?.value ? 'width: 100%;' : '')}
    ` as unknown as AnyComp
    const narrow = render(Desc, { $rocketstyle: rs, $rocketstate: state })
    const wide = render(Desc, { $rocketstyle: rs, $rocketstate: state, $wide: true })
    expect(cssOf(narrow)).not.toContain('width: 100%')
    expect(cssOf(wide)).toContain('width: 100%')
  })

  it('an object prop is keyed by identity', () => {
    const Obj = styled('div')`
      color: ${(p: P) => p.$rocketstyle.color};
      ${(p: P & { $box?: { w: number } }) => (p.$box ? `width: ${p.$box.w}px;` : '')}
    ` as unknown as AnyComp
    const box = { w: 10 }
    const a = render(Obj, { $rocketstyle: rs, $rocketstate: state, $box: box })
    const b = render(Obj, { $rocketstyle: rs, $rocketstate: state, $box: { w: 20 } })
    expect(cssOf(a)).toContain('width: 10px')
    expect(cssOf(b)).toContain('width: 20px')
    expect(render(Obj, { $rocketstyle: rs, $rocketstate: state, $box: box }).className).toBe(a.className)
  })

  // DOCUMENTED LIMIT: a function prop is keyed by presence, because an event
  // handler's identity changes on every instance and keying it would defeat
  // the cache for every clickable component. Styles that CALL a function prop
  // to compute CSS therefore get the first instance's class. Map such a value
  // to a primitive prop or a `.multiple()` modifier instead.
  it('a function prop is keyed by presence (styles that call it get the first result)', () => {
    const Calls = styled('div')`
      color: ${(p: P) => p.$rocketstyle.color};
      ${(p: P & { $width?: () => number }) => (p.$width ? `width: ${p.$width()}px;` : '')}
    ` as unknown as AnyComp
    const a = render(Calls, { $rocketstyle: rs, $rocketstate: state, $width: () => 10 })
    const b = render(Calls, { $rocketstyle: rs, $rocketstate: state, $width: () => 20 })
    expect(b.className).toBe(a.className)
    expect(cssOf(b)).toContain('width: 10px')
  })
})

describe('elClassCache — props outside (theme, $element) are part of the key', () => {
  interface E {
    $element: { n: number }
    $tone?: string
    $extra?: { w: number }
  }
  const bundle = { n: 4 }
  // One theme for every render: the elements cache is keyed on the theme, so a
  // fresh `{}` per render would never hit it and these tests would prove nothing.
  const theme = { rootSize: 16 }

  const Tone = styled('div')`
    padding: ${(p: E) => `${p.$element.n}px`};
    ${(p: E) => (p.$tone === 'loud' ? 'font-weight: 700;' : '')}
  ` as unknown as AnyComp

  it('both orders resolve their own class, and a repeat value hits', () => {
    const quiet = render(Tone, { $element: bundle }, theme)
    const loud = render(Tone, { $element: bundle, $tone: 'loud' }, theme)
    const quiet2 = render(Tone, { $element: bundle }, theme)
    expect(loud.className).not.toBe(quiet.className)
    expect(cssOf(loud)).toContain('font-weight: 700')
    expect(cssOf(quiet2)).not.toContain('font-weight: 700')
    expect(quiet2.className).toBe(quiet.className)
  })

  it('an object-valued prop is keyed by identity', () => {
    const Obj = styled('div')`
      padding: ${(p: E) => `${p.$element.n}px`};
      ${(p: E) => (p.$extra ? `width: ${p.$extra.w}px;` : '')}
    ` as unknown as AnyComp
    const a = render(Obj, { $element: bundle, $extra: { w: 10 } }, theme)
    const b = render(Obj, { $element: bundle, $extra: { w: 20 } }, theme)
    expect(cssOf(a)).toContain('width: 10px')
    expect(cssOf(b)).toContain('width: 20px')
  })

  it('styles that enumerate the props are not cached', () => {
    const Spread = styled('div')`
      padding: ${(p: E) => `${p.$element.n}px`};
      ${(p: E & { $wide?: boolean }) => {
        const { $element: _e, ...rest } = p
        return rest.$wide ? 'width: 100%;' : ''
      }}
    ` as unknown as AnyComp
    const narrow = render(Spread, { $element: bundle }, theme)
    const wide = render(Spread, { $element: bundle, $wide: true }, theme)
    expect(cssOf(narrow)).not.toContain('width: 100%')
    expect(cssOf(wide)).toContain('width: 100%')
  })

  it('a $text bundle keys the same way', () => {
    const TextTone = styled('span')`
      font-size: ${(p: { $text: { s: number }; $tone?: string }) => `${p.$text.s}px`};
      ${(p: { $text: { s: number }; $tone?: string }) => (p.$tone === 'loud' ? 'font-weight: 700;' : '')}
    ` as unknown as AnyComp
    const text = { s: 12 }
    const quiet = render(TextTone, { $text: text }, theme)
    const loud = render(TextTone, { $text: text, $tone: 'loud' }, theme)
    expect(cssOf(quiet)).not.toContain('font-weight: 700')
    expect(cssOf(loud)).toContain('font-weight: 700')
  })
})
