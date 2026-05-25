import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  excludeBrowserTests: true,
})
