import pyreon from '@pyreon/vite-plugin'
import { defineNodeConfig } from '@pyreon/vitest-config'
import channelGate from './vite-plugins/channel-gate'

// Unit tests for the site's own code (the /open stats fetchers, the stable
// link config, the showcase data). The page views are compiled with the real
// `pyreon()` plugin, the transform the site ships with. Content JSON passes
// the same channel gate as in the build (src/site-links.ts), so a test sees
// what ships.
export default defineNodeConfig({
  overrides: {
    plugins: [channelGate(), pyreon()],
  },
})
