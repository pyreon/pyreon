// React SPA, configured as the Vite React template does: https://vite.dev/guide/#scaffolding-your-first-vite-project
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
})
