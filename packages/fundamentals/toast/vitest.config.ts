import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
  // toaster.tsx is the render layer — exercised by the real-Chromium
  // `toaster.browser.test.tsx` (run via `bun run test:browser`), not the
  // node/happy-dom store suite. Browser coverage isn't aggregated into the
  // node threshold, so excluding it here keeps the node gate honest.
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. Its emit is verified
  // by behaviour in the @pyreon/native-compiler suite (the golden corpus plus the toast specs), which owns the swiftc and kotlinc lanes.
  coverageExclude: ['src/toaster.tsx', 'src/native-plugin.ts', 'src/native-plugin/**'],
})
