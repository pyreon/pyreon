import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon()],
  resolve: {
    conditions: ['bun'],
  },
  optimizeDeps: {
    // Don't pre-bundle Pyreon packages — they must share the same
    // @pyreon/reactivity instance. Pre-bundling creates a duplicate
    // copy where signals lack the .direct method runtime-dom expects.
    exclude: ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-dom'],
  },
})
