// Solid SPA, configured as the Solid Vite template does: https://docs.solidjs.com/quick-start
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
})
