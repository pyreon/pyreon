import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// The same browser suite, run in WebKit and Firefox in addition to Chromium.
// `defineBrowserConfig`'s `instances` array is MERGED (concatenated), so this
// adds the two engines to its Chromium instance rather than replacing it.
//
// Separate from `vitest.browser.config.ts` because the engines are not
// installed by the repo-wide browser job: the lossless JSON codec
// (`@pyreon/http/json`) picks its fast path from the engine's JSON.parse
// reviver `context.source` support and falls back to its own parser, and only
// a non-Chromium engine can tell the two paths agree.
export default defineBrowserConfig(playwright(), {
  test: {
    browser: {
      instances: [{ browser: 'webkit' }, { browser: 'firefox' }],
    },
  },
})
