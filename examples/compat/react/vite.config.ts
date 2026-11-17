import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon({ compat: 'react' })],
  resolve: {
    conditions: ['bun'],
  },
})
