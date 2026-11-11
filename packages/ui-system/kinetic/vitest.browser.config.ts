import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'
import pyreon from '@pyreon/vite-plugin'

export default defineBrowserConfig(playwright(), {
  // REAL @pyreon/vite-plugin compiler transform, not Vite's esbuild JSX: kinetic
  // iterates and clones its children, so what a child IS (a VNode, or a `_tpl`
  // NativeItem the compiler emits for static markup) decides whether the
  // renderers work. Only the real compiler produces the shapes apps ship.
  plugins: [pyreon() as never],
})
