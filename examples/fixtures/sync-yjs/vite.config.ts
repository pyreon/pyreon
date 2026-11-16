import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

// Client-only SPA. `pyreon()` compiles JSX to the `_tpl` / `_bindText` template
// path, so `<h1>{() => title()}</h1>` binds the synced signal to the text node's
// `.data` directly — proving the real surgical-update path end-to-end.
export default defineConfig({
  plugins: [pyreon()],
  server: {
    port: 5185,
  },
})
