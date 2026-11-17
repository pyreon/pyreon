import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'
import { compiledFixtures } from './src/tests/compiled-fixtures-plugin'

export default defineBrowserConfig(playwright(), { plugins: [compiledFixtures()] })
