import '../ui-init'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { sheet } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { describe, expect, it } from 'vitest'
import { pageProxies } from '../../../scripts/lighthouse'
import { el, hasStyles, txt } from '../kit/bases'
import { siteTheme } from '../theme'

/**
 * The kit writes a state block (`&:hover`, `&:focus-visible`, …) only when the
 * state has styles. It used to write every block for every component, empty
 * when the state had none: 372 empty rule blocks in the home page's inline CSS,
 * each costing the browser parsing, selector matching and invalidation work.
 */
async function cssOf(node: Parameters<typeof h>[0], props: Record<string, unknown> = {}): Promise<string> {
  sheet.reset()
  await renderToString(h(PyreonUI, { theme: siteTheme, mode: 'dark' }, h(node, props)))
  return sheet.getStyleTag()
}

describe('hasStyles', () => {
  it('is true only for a non-empty object', () => {
    expect(hasStyles({ color: 'red' })).toBe(true)
    expect(hasStyles({})).toBe(false)
    expect(hasStyles(undefined)).toBe(false)
    expect(hasStyles(null)).toBe(false)
    expect(hasStyles('color: red')).toBe(false)
  })
})

describe('kit state blocks', () => {
  const Plain = el.config({ name: 'StatePlain' }).theme(() => ({ color: 'red' }))
  const Hovered = el.config({ name: 'StateHovered' }).theme(() => ({ color: 'red', hover: { color: 'blue' } }))
  const PlainText = txt.config({ name: 'StatePlainText' }).theme(() => ({ color: 'red' }))

  it('a component without state styles emits no empty rule block (el and txt)', async () => {
    for (const C of [Plain, PlainText]) {
      const css = await cssOf(C)
      expect(css).toContain('color: red')
      expect(pageProxies(`<style>${css.replace(/<\/?style[^>]*>/g, '')}</style>`).emptyRules).toBe(0)
    }
  })

  it('a state with styles still gets its block', async () => {
    const css = await cssOf(Hovered)
    expect(css).toMatch(/&:hover \{[^}]*color: blue/)
  })
})
