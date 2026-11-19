import { defineBrowserConfig } from '@pyreon/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineBrowserConfig(playwright(), { test: { testTimeout: 30_000 } })
