import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

/**
 * The smallest app that exercises the whole offline / installable surface in
 * a real browser (`e2e/pwa-offline.spec.ts`): an SSG build with `pwa` enabled,
 * an `offlineFallback` page, a persisted query cache and an offline mutation.
 * Not one of the shared examples: its routes and worker must not change what
 * other e2e suites observe.
 */
export default defineConfig({
  plugins: [
    pyreon(),
    zero({
      mode: 'ssg',
      pwa: {
        manifest: {
          name: 'PWA offline fixture',
          short_name: 'Offline',
          theme_color: '#0b1020',
          background_color: '#ffffff',
          icons: [],
        },
        offlineFallback: '/offline',
      },
    }),
  ],
  resolve: { conditions: ['bun'] },
})
