import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'
import { compiledFixtures } from './vitest.compiled-fixtures'

export default defineBrowserConfig(playwright(), { plugins: [compiledFixtures()] })
