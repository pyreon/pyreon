import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// The same browser suite, run in WebKit and Firefox in addition to Chromium.
// `defineBrowserConfig`'s `instances` array is MERGED (concatenated), so this
// adds the two engines to its Chromium instance rather than replacing it.
//
// The runtime owns the security-relevant engine surface: which `on*` names an
// engine compiles into handlers (WebKit exposes ten Chromium does not — found by
// running this suite there), how `innerHTML` parses SVG, and event dispatch.
// CI runs this via `scripts/browser-engines.ts` whenever runtime-dom is
// affected.
export default defineBrowserConfig(playwright(), {
  test: {
    browser: {
      instances: [{ browser: 'webkit' }, { browser: 'firefox' }],
    },
  },
})
