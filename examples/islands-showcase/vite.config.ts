import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon({ ssr: { entry: './src/entry-server.ts' } })],
  server: {
    port: 5182,
  },
})
