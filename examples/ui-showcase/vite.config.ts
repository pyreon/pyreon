import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon()],
  resolve: {
    conditions: ['bun'],
  },
  optimizeDeps: {
    exclude: ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-dom'],
  },
})
