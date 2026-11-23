// Preact SPA, configured as create-preact scaffolds it: https://preactjs.com/guide/v10/getting-started
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [preact()],
})
