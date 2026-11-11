/** @jsxImportSource @pyreon/core */
/**
 * Issue #4314 — under `<PyreonUI>` with a theme that carries no grid keys
 * (no `breakpoints`, no `grid.*` / `coolgrid.*`), a responsive
 * `<Col size={[12, 6, 4]}>` was moved off-screen (`position: fixed;
 * left: -9999px`) and a scalar `size={6}` was ignored (equal-width
 * `flex-basis: 0`). The docs say PyreonUI replaces coolgrid's `Provider`, so
 * coolgrid must fall back to its own defaults (12 columns, xs–xl
 * breakpoints, Bootstrap-4 container widths) whenever the theme lacks them.
 *
 * Mounts through the real PyreonUI → styler path and reads the injected
 * rules for the rendered column.
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { sheet } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { enrichTheme } from '@pyreon/unistyle'
import { afterEach, describe, expect, it } from 'vitest'
import { Col, Container, Row } from '../index'

let cleanups: (() => void)[] = []
const mountInDom = (vnode: VNode) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(vnode, root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return root
}

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  sheet.clearCache()
})

/** All styler-injected CSS text whose selector matches one of el's classes. */
const rulesFor = (el: Element): string => {
  const classes = [...el.classList]
  let out = ''
  for (const s of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = s.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      const text = rule.cssText ?? ''
      if (classes.some((c) => text.includes(`.${c}`))) out += `${text}\n`
    }
  }
  return out
}

const renderGrid = (theme: Record<string, unknown>, size: unknown) =>
  mountInDom(
    h(
      PyreonUI,
      { theme: enrichTheme(theme) },
      h(Container, { id: 'c' }, h(Row, null, h(Col, { id: 'col', size }, 'left'))),
    ),
  )

describe('coolgrid under PyreonUI with no grid keys in the theme (#4314)', () => {
  it('a responsive size is never moved off-screen and gets its flex-basis per breakpoint', () => {
    const root = renderGrid({}, [12, 6, 4])
    const css = rulesFor(root.querySelector('#col')!)

    expect(css).not.toContain('-9999px')
    expect(css).not.toContain('position: fixed')
    expect(css).toContain('flex-basis: 100%')
    expect(css).toContain('flex-basis: 50%')
    expect(css).toMatch(/flex-basis: 33\.3/)
    // the 50% / 33% steps sit inside coolgrid's default sm / md media queries
    expect(css).toMatch(/@media[^{]*min-width: 36em[^{]*\{[^}]*flex-basis: 50%/)
    expect(css).toMatch(/@media[^{]*min-width: 48em[^{]*\{[^}]*flex-basis: 33\.3/)
  })

  it('a scalar size uses the default 12 columns', () => {
    const root = renderGrid({}, 6)
    const css = rulesFor(root.querySelector('#col')!)

    expect(css).toContain('flex-basis: 50%')
    expect(css).not.toContain('-9999px')
  })

  it('Container gets the default container widths', () => {
    const root = renderGrid({}, 6)
    const css = rulesFor(root.querySelector('#c')!)

    expect(css).toMatch(/max-width: 100%/)
    expect(css).toMatch(/@media[^{]*min-width: 75em[^{]*\{[^}]*max-width: 71\.25rem/)
  })

  it('a theme with its own breakpoints but no grid keys keeps its breakpoints and gets 12 columns', () => {
    const root = renderGrid({ breakpoints: { phone: 0, tablet: 600 } }, [12, 6])
    const css = rulesFor(root.querySelector('#col')!)

    expect(css).toContain('flex-basis: 100%')
    expect(css).toMatch(/@media[^{]*min-width: 37\.5em[^{]*\{[^}]*flex-basis: 50%/)
    expect(css).not.toContain('min-width: 36em')
  })
})

describe('withDefaultBreakpoints', () => {
  it('adds the default breakpoints to a theme without any, stably', async () => {
    const { withDefaultBreakpoints } = await import('../defaults')
    const { defaultBreakpoints } = await import('../theme')
    const theme = { rootSize: 16 }
    const a = withDefaultBreakpoints(theme)
    expect(a.breakpoints).toEqual(defaultBreakpoints)
    expect((a.__PYREON__ as { sortedBreakpoints: string[] }).sortedBreakpoints).toEqual([
      'xs',
      'sm',
      'md',
      'lg',
      'xl',
    ])
    // identity-stable, so the downstream style caches keep hitting
    expect(withDefaultBreakpoints(theme)).toBe(a)
    expect(withDefaultBreakpoints(undefined).breakpoints).toEqual(defaultBreakpoints)
  })

  it('keeps a theme`s own breakpoints and only enriches them', async () => {
    const { withDefaultBreakpoints } = await import('../defaults')
    const result = withDefaultBreakpoints({ breakpoints: { phone: 0, tablet: 600 } })
    expect(result.breakpoints).toEqual({ phone: 0, tablet: 600 })
    expect((result.__PYREON__ as { sortedBreakpoints: string[] }).sortedBreakpoints).toEqual([
      'phone',
      'tablet',
    ])
  })
})
