// Pyreon SPA, configured as the docs show: https://pyreon.dev/docs/vite-plugin
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon()],
})
