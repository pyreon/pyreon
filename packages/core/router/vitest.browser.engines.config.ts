import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// The same browser suite, run in WebKit and Firefox in addition to Chromium.
// `defineBrowserConfig`'s `instances` array is MERGED (concatenated), so this
// adds the two engines to its Chromium instance rather than replacing it.
//
// The router drives `history`, `popstate`/`hashchange` and scroll restoration —
// the areas where engines have historically disagreed (when popstate fires,
// whether a pushState to the same URL notifies). CI runs this via
// `scripts/browser-engines.ts` whenever the router is affected.
export default defineBrowserConfig(playwright(), {
  test: {
    browser: {
      instances: [{ browser: 'webkit' }, { browser: 'firefox' }],
    },
  },
})
