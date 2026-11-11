import '../ui-init'
import type { VNodeChild } from '@pyreon/core'
import { h, useContext } from '@pyreon/core'
import { ThemeContext } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { colorMode } from '../color-mode'
import { siteTheme } from '../theme'

/**
 * Gives an island that renders kit (rocketstyle) components the UI system's
 * context in the browser.
 *
 * On the server, and when the docs app renders a page in the browser, the
 * island sits under the root `<PyreonUI>` (routes/_layout.tsx) and this
 * renders its children unchanged. On a static marketing page an island
 * hydrates as its own root with no provider above it; there it opens a root
 * `<PyreonUI>` with the same theme and mode. A root provider adds no element
 * (only a nested one does), so the hydrated markup matches the server's.
 *
 * Cost: the styling runtime (~25 KB gzip) loads with the first island that
 * uses it. The shell's islands do not: they use plain markup (`site-css.ts`).
 */
export function KitScope(props: { children?: VNodeChild }) {
  const theme = useContext(ThemeContext)()
  if (theme !== undefined && Object.keys(theme).length > 0) return props.children ?? null
  // `h()`, not JSX: the compiler turns `{props.children}` in a component's
  // children into a reactive accessor, which renders behind hydration markers
  // the server never wrote (there this component returns the children as
  // they are), so the island's whole tree was rebuilt instead of adopted
  // (#4443). Passed as a plain argument, the client tree has the server's shape.
  return h(PyreonUI, { theme: siteTheme, mode: () => colorMode() }, props.children)
}
