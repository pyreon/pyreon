import { octane } from '@octanejs/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    pyreon(),
    // Octane — the compiled-React framework (`.tsrx`). `requireDirective: true`
    // is LOAD-BEARING, not a preference: with the default `false`, Octane's
    // ownership gate also claims plain project `.tsx`, which would hijack
    // `impl/pyreon.tsx` (and every other `.tsx` here) away from the Pyreon
    // compiler. With it on, Octane owns `.tsrx` by extension only, and a
    // `.tsx` would need an explicit `@jsxImportSource octane` pragma — so the
    // two compilers coexist with no overlap.
    octane({ requireDirective: true }),
    // Svelte 5 — compiles `.svelte` files to runtime-optimized JS. The
    // benchmark uses this so the Svelte impl matches what real users
    // ship (compiled runes output), the same as Solid (compiled
    // template) and React (production JSX).
    svelte(),
  ],
  resolve: {
    // `browser` first so Svelte 5's mount() resolves to the client
    // build (server build's mount() throws lifecycle_function_unavailable).
    // `bun` is kept for workspace resolution (Pyreon workspace packages
    // expose `./src/index.ts` under the bun condition).
    conditions: ['browser', 'bun'],
  },
})
