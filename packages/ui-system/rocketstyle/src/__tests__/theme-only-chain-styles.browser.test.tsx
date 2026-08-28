/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { mountInBrowser } from '@pyreon/test-utils/browser'
// Side-effect import: registers the unistyle theme engine, which is how the
// `.theme()` -> CSS bridge reaches `makeItResponsive` without rocketstyle
// depending on unistyle.
import '@pyreon/unistyle'
import { describe, expect, it } from 'vitest'
import { rocketstyle } from '../index'

/**
 * A chain with `.theme()` and NO `.styles()` produces real CSS.
 *
 * `.theme()` supplies values; something has to render them. Before this, nothing
 * did unless the author also chained `.styles()` — so a theme-only chain
 * rendered COMPLETELY UNSTYLED in a browser, while `@pyreon/native-compiler`
 * reads the same `.theme()` statically and emits real view modifiers. One
 * declaration, fully styled on iOS/Android and bare on the web.
 *
 * Real Chromium, deliberately: styler writes rules through `insertRule`, whose
 * text is absent from `textContent`, so happy-dom cannot see whether any CSS
 * exists at all.
 *
 * A PLAIN TAG base, deliberately too: the bridge is not Element-specific, and
 * proving it on the simplest possible base keeps this suite from depending on
 * @pyreon/elements to say something about rocketstyle.
 */
describe('a theme-only rocketstyle chain', () => {
  const mountCard = (Card: unknown): HTMLElement => {
    const { container } = mountInBrowser(() => h(Card as never, {}, h('span', {}, 'hi')))
    return query(container, '[data-rocketstyle]')
  }

  it('renders its theme values as CSS', () => {
    const Card = rocketstyle()({ name: 'ThemeOnlyCard', component: 'div' as never }).theme(() => ({
      backgroundColor: '#6b7280',
      padding: 8,
    }))
    const node = mountCard(Card)
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(107, 114, 128)')
    expect(getComputedStyle(node).padding).toBe('8px')
  })

  // The load-bearing negative. An explicit `.styles()` chain already owns the
  // bridge — that is exactly what `el` in @pyreon/ui/components does — so the
  // default must NOT also apply, or the theme is emitted twice.
  it('does NOT double-apply when the author chained their own .styles()', () => {
    const Card: never = rocketstyle()({ name: 'ExplicitStylesCard', component: 'div' as never })
      .theme(() => ({ backgroundColor: '#6b7280' }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .styles((css: any) => css`background-color: rgb(1, 2, 3);`) as never
    const node = mountCard(Card)
    // The author's own rule is the only one, so it wins outright rather than
    // racing a second copy of the theme.
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(1, 2, 3)')
  })

  it('leaves pseudo-state groups out of the base declarations', () => {
    // `hover`/`focus`/`active`/`disabled` are nested theme OBJECTS, not CSS
    // declarations. Emitting them at the top level would produce garbage
    // properties, so the default bridge strips them.
    const Card = rocketstyle()({ name: 'PseudoCard', component: 'div' as never }).theme(() => ({
      backgroundColor: '#6b7280',
      hover: { backgroundColor: '#111111' },
    }))
    const node = mountCard(Card)
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(107, 114, 128)')
  })
})
