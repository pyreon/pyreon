import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'
import { sseServer } from './src/tests/helpers/browser-stream-server'

// The generated axios client's STREAM path in real Chromium: axios's `fetch`
// adapter, the browser's own `fetch`, and a real SSE response from this
// dev server (see `src/tests/helpers/browser-stream-server.ts`).
export default defineBrowserConfig(playwright(), {
  plugins: [sseServer()],
  optimizeDeps: { include: ['axios'] },
  test: { globalSetup: ['./src/tests/helpers/browser-stream-server.ts'] },
})
