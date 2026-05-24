import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '../../../vitest.browser'

export default defineBrowserConfig(playwright())
