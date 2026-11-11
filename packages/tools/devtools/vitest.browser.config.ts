import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'
import pyreon from '@pyreon/vite-plugin'

// Real Chromium + the REAL @pyreon/vite-plugin compiler, so the Pyreon app
// the panel inspects emits the same `_tpl` / `_bindText` code a real dev
// build ships (text bindings are what the inspector's "reactive reads" and
// "why did this update?" read).
export default defineBrowserConfig(playwright(), {
  plugins: [pyreon() as never],
})
