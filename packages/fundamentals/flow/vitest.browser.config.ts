import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'
import pyreon from '@pyreon/vite-plugin'

export default defineBrowserConfig(playwright(), {
  // REAL @pyreon/vite-plugin compiler transform (not Vite's default esbuild
  // automatic-runtime JSX) so these browser tests exercise the same _tpl()
  // template output that ships to real apps — closing the documented
  // "vitest-browser transform does NOT match the real compiler" masking trap.
  plugins: [pyreon() as never],
})
