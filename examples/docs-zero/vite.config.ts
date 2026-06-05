import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'
import lastUpdated from './vite-plugins/last-updated'

// docs-zero: the zero-content-powered successor to the VitePress docs/.
// Plugin order: content() first (compiles .md → JSX → JS via esbuild),
// then pyreon() (JSX optimizations), zero() (fs-router + SSG), then
// last-updated which injects a per-page modified-timestamp registry
// into the entry HTML for the PageMeta footer.
export default defineConfig({
  plugins: [
    content(),
    pyreon(),
    zero({ mode: 'spa' }),
    lastUpdated({ contentDir: 'src/content/docs' }),
  ],
  server: { port: 5191 },
})
