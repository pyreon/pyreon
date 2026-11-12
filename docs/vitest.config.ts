import pyreon from '@pyreon/vite-plugin'
import { defineNodeConfig } from '@pyreon/vitest-config'

// Unit tests for the site's own code (the /open stats fetchers, the stable
// link config, the showcase data). The page views are compiled with the real
// `pyreon()` plugin, the transform the site ships with.
export default defineNodeConfig({
  overrides: {
    plugins: [pyreon()],
  },
})
