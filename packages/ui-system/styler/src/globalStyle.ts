/**
 * createGlobalStyle() — tagged template function that injects global CSS
 * rules (not scoped to a class name). Returns a component function that
 * injects styles when called and supports dynamic interpolations via
 * props/theme.
 *
 * Usage:
 *   const GlobalStyle = createGlobalStyle`
 *     body { margin: 0; font-family: ${({ theme }) => theme.font}; }
 *     *, *::before, *::after { box-sizing: border-box; }
 *   `
 */
import type { ComponentFn } from '@pyreon/core'
import { type Interpolation, normalizeCSS, resolve } from './resolve'
import { isDynamic } from './shared'
import { sheet } from './sheet'
import { useTheme } from './ThemeProvider'

export const createGlobalStyle = (
  strings: TemplateStringsArray,
  ...values: Interpolation[]
): ComponentFn => {
  const hasDynamicValues = values.some(isDynamic)

  // STATIC FAST PATH: compute once at creation time
  if (!hasDynamicValues) {
    const cssText = normalizeCSS(resolve(strings, values, {}))

    // Inject into sheet immediately. `normalizeCSS` already strips
    // leading/trailing whitespace, so a length check is equivalent to the
    // prior `.trim()` (no O(n) whitespace scan, no string allocation).
    // Ported from vitus-labs `be471b19`.
    if (cssText.length > 0) sheet.insertGlobal(cssText)

    const StaticGlobal: ComponentFn = () => null
    return StaticGlobal
  }

  // DYNAMIC PATH: resolve on every render with theme/props
  const DynamicGlobal: ComponentFn = (props: Record<string, any>) => {
    const theme = useTheme()
    const allProps = { ...props, theme }
    const cssText = normalizeCSS(resolve(strings, values, allProps))

    // Length check — `normalizeCSS` already trims. Ported from
    // vitus-labs `be471b19`.
    if (cssText.length > 0) sheet.insertGlobal(cssText)

    return null
  }

  return DynamicGlobal
}
