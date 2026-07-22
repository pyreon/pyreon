import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

export default defineBrowserConfig(playwright(), {
  // The runtime bench lives in bench/ under the same .browser.test glob —
  // it runs via its own config (`bench:runtime`), not the regular suite.
  test: { exclude: ['bench/**', '**/node_modules/**'] },
})
