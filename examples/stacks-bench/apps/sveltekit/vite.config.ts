// Scaffolded with `sv create --template minimal` (sv 1.3.0, SvelteKit 3); adapter-auto swapped for
// adapter-node as https://svelte.dev/docs/kit/adapter-node documents.
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries (scaffold default).
        runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
      },
      adapter: adapter(),
      // adapter-node 6 takes the public origin from `paths.origin` (or a proxy's PROTOCOL_HEADER);
      // without it the CSRF check assumes https and rejects every plain-http form POST.
      // The harness serves this arm on 127.0.0.1:4404 (lib/stacks.ts portFor).
      paths: { origin: process.env.STACKS_ORIGIN ?? 'http://127.0.0.1:4404' },
    }),
  ],
})
