import pyreon from '@pyreon/vite-plugin'
import { defineNodeConfig } from '@pyreon/vitest-config'

// The tests import app source (routes, demos) that is written in Plain Mode,
// so they compile it with the REAL `pyreon()` plugin — the same transform the
// app ships with. (A generic automatic-JSX runtime would leave the Plain Mode
// markers uncompiled, and they throw by design.)
export default defineNodeConfig({
  environment: 'happy-dom',
  excludeBrowserTests: true,
  overrides: {
    plugins: [pyreon()],
  },
})
