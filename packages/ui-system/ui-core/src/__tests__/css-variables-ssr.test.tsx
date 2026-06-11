// @vitest-environment node
import { h, useContext } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { sheet, ThemeContext } from '@pyreon/styler'
import { afterEach, describe, expect, it } from 'vitest'
import { init } from '../config'
import { PyreonUI } from '../PyreonUI'

// REAL SSR proof for cssVariables mode (node env — `typeof document` is
// undefined, so the styler sheet runs its SSR buffer):
//   1. Var-leaf theme values land in the rendered HTML as var() strings.
//   2. getStyleTag() carries the injected :root block — the same surface
//      SSG prerenders and streaming's first flush read.
//   3. The ROOT provider emits NO wrapper server-side — its mode rides
//      `:root` (`<html>` stamp + the pre-paint script), so SSR output is
//      a clean passthrough. A NESTED provider DOES emit the scoped wrapper.

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
  it('root: var leaves in HTML + :root block in getStyleTag, NO wrapper', async () => {
    init({ cssVariables: true })
    const html = await renderToString(h(PyreonUI, { theme, mode: 'dark' } as any, h(Probe, null)))
    // var-leaf theme values reach the rendered HTML
    expect(html).toContain('var(--px-spacing-small)')
    // root emits no scoped wrapper — its mode rides :root (html stamp + script)
    expect(html).not.toContain('display: contents')

    const tag = sheet.getStyleTag()
    expect(tag).toContain('--px-spacing-small: 0.5rem')
  })

  it('nested provider DOES emit the scoped mode wrapper server-side', async () => {
    init({ cssVariables: true })
    const html = await renderToString(
      h(
        PyreonUI,
        { theme, mode: 'light' } as any,
        h(PyreonUI, { inversed: true } as any, h(Probe, null)),
      ),
    )
    // the nested provider's wrapper carries the resolved (inverted) mode
    expect(html).toContain('display: contents')
    expect(html).toContain('data-theme="dark"')
  })

  it('flag off: no wrapper, literal theme values (control)', async () => {
    const html = await renderToString(h(PyreonUI, { theme, mode: 'dark' } as any, h(Probe, null)))
    expect(html).not.toContain('data-theme')
    expect(html).not.toContain('display: contents')
    expect(html).toContain('>8<')
  })
})
