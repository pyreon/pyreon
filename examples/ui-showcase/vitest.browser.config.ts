import { playwright } from '@vitest/browser-playwright'
import pyreon from '@pyreon/vite-plugin'
import { type BrowserProviderFactory, defineBrowserConfig } from '@pyreon/vitest-config'

// Use the REAL @pyreon/vite-plugin compiler (not vitest's plain oxc JSX
// transform) so the components under test get Pyreon's reactive-prop wrapping
// (`<Modal open={sig()}>` → reactive), signal auto-call, and `_tpl` codegen —
// i.e. the exact output a real app ships. The plain oxc transform reads
// `open={sig()}` ONCE (static), so reactive component props would never update.
export default defineBrowserConfig(playwright() as unknown as BrowserProviderFactory, {
  plugins: [pyreon()],
  // Pre-declare what `@pyreon/testing` pulls in. Left to discovery, the first
  // COLD run re-optimizes mid-suite and vitest 5 fails the file on the
  // resulting page reload (`Cannot read properties of undefined (reading
  // 'config')`); warm caches masked it.
  optimizeDeps: {
    include: ['@pyreon/testing > @testing-library/dom', '@pyreon/testing > @testing-library/jest-dom/matchers'],
  },
})
