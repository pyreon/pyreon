/**
 * Hook that resolves a CSSResult template with props, injects CSS
 * into the shared stylesheet, and returns the className.
 *
 * Use this when you need computed CSS class names on plain elements
 * without the overhead of a styled component layer.
 */
import { type CSSResult, normalizeCSS, resolve } from "./resolve"
import { sheet } from "./sheet"
import { useTheme } from "./ThemeProvider"

export function useCSS(template: CSSResult, props?: Record<string, any>, boost?: boolean): string {
  const theme = useTheme()
  const allProps = theme ? { ...props, theme } : (props ?? {})
  const cssText = normalizeCSS(resolve(template.strings, template.values, allProps))

  if (!cssText.trim()) return ""

  return sheet.insert(cssText, boost)
}
