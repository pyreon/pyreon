import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

export default defineBrowserConfig(playwright())
