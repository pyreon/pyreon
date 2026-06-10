// @vitest-environment node
import { h, useContext } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { sheet, ThemeContext } from '@pyreon/styler'
import { afterEach, describe, expect, it } from 'vitest'
import { init } from '../config'
import { PyreonUI } from '../PyreonUI'

// REAL SSR proof for cssVariables mode (node env — `typeof document` is
// undefined, so the styler sheet runs its SSR buffer):
//   1. renderToString emits the mode-attribute wrapper with the RESOLVED
//      mode, so SSG/SSR HTML ships the right mode with no client fixup.
//   2. Var-leaf theme values land in the rendered HTML as var() strings.
//   3. getStyleTag() carries the injected :root block — the same surface
//      SSG prerenders and streaming's first flush read.

const theme = { rootSize: 16, breakpoints: { xs: 0 }, spacing: { small: 8 } }

function Probe() {
  const getTheme = useContext(ThemeContext) as () => Record<string, any>
  return h('i', { id: 'probe' }, String(getTheme().spacing.small))
}

afterEach(() => {
  init({ cssVariables: false })
  sheet.clearCache()
})

describe('PyreonUI cssVariables — SSR', () => {
  it('renders the wrapper attribute + var leaves, and getStyleTag carries the :root block', async () => {
    init({ cssVariables: true })
    const html = await renderToString(
      h(PyreonUI, { theme, mode: 'dark' } as any, h(Probe, null)),
    )
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('display: contents')
    expect(html).toContain('var(--px-spacing-small)')

    const tag = sheet.getStyleTag()
    expect(tag).toContain('--px-spacing-small: 0.5rem')
  })

  it('flag off: no wrapper, literal theme values (control)', async () => {
    const html = await renderToString(
      h(PyreonUI, { theme, mode: 'dark' } as any, h(Probe, null)),
    )
    expect(html).not.toContain('data-theme')
    expect(html).not.toContain('display: contents')
    expect(html).toContain('>8<')
  })
})
