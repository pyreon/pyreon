import { chartsViteAlias } from '@pyreon/charts/vite'
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon(), zero()],
  resolve: {
    conditions: ['bun'],
    alias: { ...chartsViteAlias() },
  },
})
