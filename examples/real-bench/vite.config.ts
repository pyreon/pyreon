import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

// One Vite build, two real runtimes. The Pyreon impl is JSX (compiled by the
// pyreon() plugin); the React impl uses `createElement` (no JSX) so no second
// JSX transform is needed — the same approach `examples/benchmark` uses to run
// real React + Pyreon side by side. `browser` condition first so any framework
// resolves its client build; `bun` kept for @pyreon/* workspace `src` resolution.
export default defineConfig({
  plugins: [pyreon()],
  resolve: { conditions: ['browser', 'bun'] },
})
