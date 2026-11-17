import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// Islands-in-zero SSG build for the `zero-islands` e2e gate. The `/island-demo`
// route declares an island via `import { island } from '@pyreon/zero'`; the
// island self-hydrates on mount (no manual hydrateIslandsAuto). Prerender `/`
// (layout/shell) + `/island-demo` (the tested page).
export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssg', ssg: { paths: ['/', '/island-demo'] } })],
})
