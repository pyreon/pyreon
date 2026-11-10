// https://docs.astro.build/en/guides/integrations-guide/node/
// https://docs.astro.build/en/guides/integrations-guide/preact/
// https://docs.astro.build/en/guides/on-demand-rendering/
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import preact from '@astrojs/preact'

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
})
