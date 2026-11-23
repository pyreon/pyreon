// SvelteKit as a single-page app: https://svelte.dev/docs/kit/single-page-apps
// (SvelteKit 3 takes its configuration through the Vite plugin.)
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter({ fallback: '200.html' }) })],
})
