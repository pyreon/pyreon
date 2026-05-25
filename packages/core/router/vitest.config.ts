import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
})
