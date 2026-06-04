import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// Migrated from a local markdown-to-pyreon plugin to @pyreon/zero-content
// (PR 7 of the zero-content rollout). The local plugin lives at
// `src/plugins/markdown-to-pyreon.ts` and remains as a reference / for
// future contributors who want to see what the bare implementation looks
// like — but the build path is now entirely through @pyreon/zero-content.
export default defineConfig({
  plugins: [content(), pyreon(), zero({ mode: 'spa' })],
  server: { port: 5180 },
})
