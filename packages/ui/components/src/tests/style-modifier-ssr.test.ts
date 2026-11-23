// @vitest-environment node
import { renderToString } from '@pyreon/runtime-server'
import { sheet } from '@pyreon/styler'
import { beforeEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { Grid, SSR_CSS, SSR_HTML, styleModifierTree } from './style-modifier.fixture'

/**
 * Server side of the style-modifier design: a modifier is a theme slice, so it
 * renders in the component's own rocketstyle class, merged over the theme (no
 * extra class, no extra layer). The browser test hydrates this exact output,
 * so it is pinned.
 */
const ORDER = '@layer elements, rocketstyle, instance;'

async function render(): Promise<{ html: string; css: string }> {
  sheet.reset()
  const html = await renderToString(styleModifierTree())
  const tag = sheet.getStyleTag()

  return { html, css: tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</style>')) }
}

/** The rocketstyle class of the element with this id (the second class; the first is the Element's). */
const rsClassOf = (html: string, id: string): string | undefined =>
  new RegExp(`<div class="pyr-[a-z0-9]+ (pyr-[a-z0-9]+)" id="${id}"`).exec(html)?.[1]

/** The rocketstyle rule body for a class. */
const ruleOf = (css: string, cls: string | undefined): string => {
  const at = css.indexOf(`.${cls}{`)
  return at === -1 ? '' : css.slice(at, css.indexOf('}}', at))
}

describe('style modifiers (SSR)', () => {
  beforeEach(() => sheet.reset())

  it('declares the layer order exactly once, before every rule', async () => {
    const { css } = await render()
    expect(css.startsWith(ORDER)).toBe(true)
    expect(css.split(ORDER).length - 1).toBe(1)
  })

  it('a breakpoint-object modifier keeps the theme value below its breakpoint, in the rocketstyle class', async () => {
    const { html, css } = await render()
    const rule = ruleOf(css, rsClassOf(html, 'grid'))
    expect(rule).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(rule).toContain('gap: 0.125rem;') // dense (2px) over the theme's 4px
    expect(css).toContain(
      `@layer rocketstyle{@media only screen and (min-width: 48em){.${rsClassOf(html, 'grid')}{grid-template-columns: repeat(3, minmax(0, 1fr));}}}`,
    )
  })

  it('a mobile-first array modifier renders per breakpoint', async () => {
    const { html, css } = await render()
    expect(css).toContain(
      `@layer rocketstyle{@media only screen and (min-width: 48em){.${rsClassOf(html, 'stepped')}{padding-top: 1rem;}}}`,
    )
  })

  it('a modifier wins over the theme and over states, sizes and variants', async () => {
    const { html, css } = await render()
    const rule = ruleOf(css, rsClassOf(html, 'swatch'))
    expect(rule).toContain('color: rgb(200, 100, 50);')
    expect(rule).toContain('padding-top: 1rem;')
    expect(rule).not.toContain('rgb(9, 9, 9)')
    expect(rule).not.toContain('rgb(8, 8, 8)')
  })

  it('a shipped component (Card) extended downstream: the modifier beats its theme and its variant', async () => {
    const { html, css } = await render()
    const rule = ruleOf(css, rsClassOf(html, 'card'))
    expect(rule).toContain('background-color: rgb(250, 240, 230);')
    expect(rule).toContain('padding: 0.25rem;')
  })

  it('a bare Element-based rocketstyle chain (default theme bridge) renders the modifier too', async () => {
    const { html, css } = await render()
    const cls = rsClassOf(html, 'bare')
    expect(ruleOf(css, cls)).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(css).toContain(`@media only screen and (min-width: 48em){.${cls}{grid-template-columns: repeat(3, minmax(0, 1fr));}}`)
  })

  it('a modifier pseudo group renders as the base renders the theme one', async () => {
    const { html, css } = await render()
    expect(ruleOf(css, rsClassOf(html, 'hover'))).toContain('&:hover { color: rgb(1, 150, 2); }')
  })

  it('under useBooleans a false modifier prop is off', async () => {
    const { html, css } = await render()
    const cls = rsClassOf(html, 'bool')
    expect(ruleOf(css, cls)).toContain('gap: 0.25rem;') // the theme's, not `dense`
    expect(css).toContain(`@media only screen and (min-width: 48em){.${cls}{grid-template-columns: repeat(3, minmax(0, 1fr));}}`)
  })

  it('falsy entries in the list are skipped: same class as the list without them', async () => {
    const classOf = async (multiple: unknown) => {
      sheet.reset()
      const html = await renderToString(h(PyreonUI, { theme }, h(Grid, { id: 'g', multiple: multiple as never })))
      return rsClassOf(html, 'g')
    }
    const clean = await classOf(['threeUp', 'dense'])
    expect(clean).toBeDefined()
    expect(await classOf(['threeUp', false, 'dense', null, undefined, ''])).toBe(clean)
    expect(await classOf([false, null])).toBe(await classOf(undefined))
  })

  it('matches the output the real-Chromium hydration test uses', async () => {
    const { html, css } = await render()
    // On drift, update SSR_HTML / SSR_CSS in style-modifier.fixture.ts to:
    expect(html, 'SSR_HTML').toBe(SSR_HTML)
    expect(css, 'SSR_CSS').toBe(SSR_CSS)
  })
})
