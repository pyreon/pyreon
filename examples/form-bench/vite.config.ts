import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Pyreon's compiler runs over the Pyreon impl. The React-Hook-Form impl
    // uses `React.createElement` directly (no JSX), so it flows through Vite's
    // default esbuild path untouched — there is no JSX-source conflict because
    // NEITHER impl uses JSX (both use explicit element factories, the same
    // approach examples/benchmark uses for its React entry).
    pyreon(),
  ],
  resolve: {
    // `browser` first so React-DOM / Pyreon resolve their client builds;
    // `bun` keeps workspace `@pyreon/*` resolving to `./src/index.ts`.
    conditions: ['browser', 'bun'],
  },
})
