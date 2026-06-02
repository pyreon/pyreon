import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for the 5 compat layers
 * (`@pyreon/{react,preact,vue,solid,svelte}-compat`).
 *
 * Each spec exercises 3 surfaces against its compat-mode example app:
 *   1. Mount + render — example boots, expected header / counter shows.
 *   2. Reactive state — counter button click updates DOM (state →
 *      re-render in real Chromium). Catches the "smoke browser test
 *      passes but the real-framework re-render path breaks" gap.
 *   3. Lifecycle — re-mount / sub-route nav without console errors.
 *
 * CI: `bun run test:e2e:compat` (own step).
 */
export default definePlaywrightConfig({
  projects: [
    { name: 'react-compat', testMatch: /react-compat\.spec\.ts$/, port: 5177 },
    { name: 'preact-compat', testMatch: /preact-compat\.spec\.ts$/, port: 5178 },
    { name: 'vue-compat', testMatch: /vue-compat\.spec\.ts$/, port: 5179 },
    { name: 'solid-compat', testMatch: /solid-compat\.spec\.ts$/, port: 5180 },
    { name: 'svelte-compat', testMatch: /svelte-compat\.spec\.ts$/, port: 5182 },
  ],
  webServer: [
    viteDevServer('@pyreon/example-react-compat', 5177),
    viteDevServer('@pyreon/example-preact-compat', 5178),
    viteDevServer('@pyreon/example-vue-compat', 5179),
    viteDevServer('@pyreon/example-solid-compat', 5180),
    viteDevServer('@pyreon/example-svelte-compat', 5182),
  ],
})
