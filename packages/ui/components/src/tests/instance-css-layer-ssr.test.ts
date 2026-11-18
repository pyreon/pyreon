// @vitest-environment node
import { renderToString } from '@pyreon/runtime-server'
import { sheet } from '@pyreon/styler'
import { beforeEach, describe, expect, it } from 'vitest'
import { instanceCssTree, SSR_CSS, SSR_HTML } from './instance-css-layer.fixture'

/**
 * #4354, server side: the instance `css` prop renders into `@layer instance`,
 * which the order statement declares after `rocketstyle`, emitted exactly once
 * and first. The browser test hydrates this exact output, so it is pinned.
 */
const ORDER = '@layer elements, rocketstyle, instance;'

async function render(): Promise<{ html: string; css: string }> {
  sheet.reset()
  const html = await renderToString(instanceCssTree())
  const tag = sheet.getStyleTag()

  return { html, css: tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</style>')) }
}

describe('instance css layer (SSR)', () => {
  beforeEach(() => sheet.reset())

  it('declares the layer order exactly once, before every rule', async () => {
    const { css } = await render()
    expect(css.startsWith(ORDER)).toBe(true)
    expect(css.split(ORDER).length - 1).toBe(1)
  })

  it('puts the instance css in @layer instance, on the same class as the base layout', async () => {
    const { html, css } = await render()
    // The grid's first class is the Element's (elements layer), the second rocketstyle's.
    const elementClass = /<div class="(pyr-[a-z0-9]+) pyr-[a-z0-9]+" id="grid"/.exec(html)?.[1]
    expect(elementClass).toBeDefined()
    expect(css).toContain(`@layer elements{.${elementClass}{`)
    expect(css).toContain(
      `@layer instance{@media (min-width: 768px){.${elementClass}{grid-template-columns: repeat(3, minmax(0, 1fr));}}}`,
    )
    // The theme value stays in the rocketstyle layer, below the instance layer.
    expect(css).toMatch(/@layer rocketstyle\{\.pyr-[a-z0-9]+\{display: grid; grid-template-columns: minmax\(0, 1fr\);/)
  })

  it('matches the output the real-Chromium hydration test uses', async () => {
    const { html, css } = await render()
    // On drift, update SSR_HTML / SSR_CSS in instance-css-layer.fixture.ts to:
    expect(html, 'SSR_HTML').toBe(SSR_HTML)
    expect(css, 'SSR_CSS').toBe(SSR_CSS)
  })
})
