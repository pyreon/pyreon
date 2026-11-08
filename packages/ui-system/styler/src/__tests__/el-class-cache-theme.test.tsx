/**
 * `elClassCache` (the `$element` class cache in DynamicStyled) must key on the
 * THEME as well as the interned `$element` bundle. Element's Wrapper / Text CSS
 * reads `theme.rootSize` and `theme.breakpoints`, so the same bundle resolves
 * to different CSS under different themes — a whole-theme swap, a nested
 * provider, or two server tenants. Keyed on the bundle alone, the second theme
 * got the first theme's class.
 */
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'
import { ThemeProvider } from '../ThemeProvider'

type AnyComp = (props: Record<string, unknown>) => ReturnType<typeof h>

const Box = styled('div')`
  padding: ${(p: { theme: { rootSize?: number }; $element: { n: number } }) =>
    `${p.$element.n / (p.theme.rootSize ?? 16)}rem`};
` as unknown as AnyComp

let cleanups: (() => void)[] = []
const classUnder = (theme: object, bundle: object): string => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(
    h(ThemeProvider as never, { theme }, h(Box as never, { $element: bundle })),
    root,
  )
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return (root.firstElementChild as HTMLElement).className
}

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  sheet.clearAll()
})

describe('elClassCache — keyed on the theme', () => {
  it('the same interned bundle under a different theme resolves its own class', () => {
    const bundle = { n: 32 }
    const a = classUnder({ rootSize: 16 }, bundle) // 2rem
    const b = classUnder({ rootSize: 8 }, bundle) // 4rem
    expect(b).not.toBe(a)
    expect(document.querySelector(`.${b}`)).not.toBeNull()
    const css = Array.from(
      query<HTMLStyleElement>(document, 'style[data-pyreon-styler]').sheet!.cssRules,
      (r) => r.cssText,
    ).join('\n')
    expect(css).toMatch(new RegExp(`\\.${b}\\s*\\{[^}]*padding: 4rem`))
  })

  it('still hits within one theme (the cache is not defeated)', () => {
    const theme = { rootSize: 16 }
    const bundle = { n: 48 }
    expect(classUnder(theme, bundle)).toBe(classUnder(theme, bundle))
  })
})
