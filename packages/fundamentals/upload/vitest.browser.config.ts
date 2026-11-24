import { defineBrowserConfig } from '@pyreon/vitest-config'
import { playwright } from '@vitest/browser-playwright'
import { uploadTestServer } from './src/tests/test-server.ts'

export default defineBrowserConfig(playwright(), { plugins: [uploadTestServer()], test: { testTimeout: 30_000 } })
