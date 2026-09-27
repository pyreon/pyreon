// @vitest-environment happy-dom
// zero's theme declares the CSS `color-scheme` on <html> as well as
// `data-theme`: native form controls and scrollbars follow it, and it is the
// page's scheme Pyreon's framework-wide colour mode (`useColorMode`) reads —
// so a zero theme toggle reaches charts, flow and the code editor. (That the
// colour mode follows a declared scheme live is locked in real Chromium by
// @pyreon/charts' page-scheme spec; happy-dom does not compute it.)
import { describe, expect, it } from 'vitest'
import { setTheme, themeScript } from '../theme'

describe('zero theme declares the page color-scheme', () => {
  it('setTheme writes color-scheme alongside data-theme', () => {
    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    setTheme('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('the pre-paint script sets it too, so the first frame agrees', () => {
    expect(themeScript).toContain('document.documentElement.style.colorScheme=r')
  })

})
