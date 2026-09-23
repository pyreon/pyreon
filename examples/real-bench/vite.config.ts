import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

/**
 * Cross-origin isolation — LOAD-BEARING. Chromium clamps `performance.now()`
 * to 100µs in a non-isolated page (5µs when isolated). Pyreon's cells here are
 * a few hundred µs, i.e. a handful of 100µs ticks. `bench.ts` measures the
 * quantum and ABORTS if the page is not isolated — the same contract as
 * `examples/benchmark`. The build is fully same-origin, so `require-corp`
 * blocks nothing.
 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// One Vite build, two real runtimes. The Pyreon impl is JSX (compiled by the
// pyreon() plugin); the React impl is written as the automatic JSX runtime's
// `jsx()`/`jsxs()` output, so no second JSX transform is needed. Each framework
// is a separate dynamic-import chunk (see src/main.ts). `browser` condition
// first so any framework resolves its client build; `bun` kept for @pyreon/*
// workspace `src` resolution.
export default defineConfig({
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  plugins: [pyreon()],
  resolve: { conditions: ['browser', 'bun'] },
})
