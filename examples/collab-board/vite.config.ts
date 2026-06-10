import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

// Plain client-only SPA — local-first sync is client-centric, so there's no SSR
// here (see the README "Why a SPA" note). `pyreon()` compiles JSX to the
// `_tpl` / `_bindText` template path, so a synced signal bound in JSX
// (`{() => title()}`) patches the text node's `.data` directly — the real
// surgical-update path a remote CRDT op rides.
export default defineConfig({
  plugins: [pyreon()],
  server: {
    port: 5189,
  },
})
