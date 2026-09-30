import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// The same browser suite, run in WebKit and Firefox in addition to Chromium.
// `defineBrowserConfig`'s `instances` array is MERGED (concatenated), so this
// adds the two engines to its Chromium instance rather than replacing it.
//
// The styler inserts rules through the CSSOM (`insertRule`) and relies on how
// each engine parses at-rules (`@layer`, `@container`, nested `@media`) — an
// unsupported rule throws in one engine and is accepted in another. CI runs
// this via `scripts/browser-engines.ts` whenever the styler is affected.
export default defineBrowserConfig(playwright(), {
  test: {
    browser: {
      instances: [{ browser: 'webkit' }, { browser: 'firefox' }],
    },
  },
})
