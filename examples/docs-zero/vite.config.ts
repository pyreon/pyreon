import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// docs-zero: the zero-content-powered successor to the VitePress docs/.
// Plugin order: content() first (compiles .md → JSX → JS via esbuild),
// then pyreon() (JSX optimizations), then zero() (fs-router + SSG).
export default defineConfig({
  plugins: [content(), pyreon(), zero({ mode: 'spa' })],
  server: { port: 5191 },
})
