import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'
import { chatServer } from './src/sections/chat/data/devServer'

export default defineConfig({
  // chatServer: the dev-only backend of the live chat view (/chat/live).
  plugins: [pyreon(), zero(), chatServer()],
  resolve: {
    conditions: ['bun'],
  },
})
