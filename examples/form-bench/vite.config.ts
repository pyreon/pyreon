import { svelte } from '@sveltejs/vite-plugin-svelte'
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Pyreon's compiler runs over the Pyreon impl. Every OTHER framework impl
    // avoids JSX entirely (the same conflict-free approach examples/benchmark
    // uses): React/Formik/TanStack/Vue via explicit element factories
    // (`createElement` / Vue `h()`), Solid via the low-level `solid-js/web`
    // `template`/`insert`/`createComponent` API. So there is no competing JSX
    // transform — `svelte()` is the only other compiler, scoped to `.svelte`.
    pyreon(),
    svelte(),
  ],
  resolve: {
    // `browser` first so each framework resolves its client build (Svelte 5's
    // mount() throws under the server build); `bun` keeps workspace `@pyreon/*`
    // resolving to `./src/index.ts`.
    conditions: ['browser', 'bun'],
  },
})
