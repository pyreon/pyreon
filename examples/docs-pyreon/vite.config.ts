import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'
import { markdownToPyreon } from './src/plugins/markdown-to-pyreon'

export default defineConfig({
  // SPA mode: the inner SSR/SSG sub-build that zero kicks off in production
  // spins up its own Vite instance and only carries pyreon() + zeroPlugin().
  // Our markdown → Pyreon plugin isn't part of that closure, so we skip the
  // SSR pass for now and ship as a client-rendered SPA. Adding markdown
  // pre-rendering is a separate enhancement (it'd need either a manifest
  // hook into zero's inner-build or a build-time codegen step before vite).
  plugins: [markdownToPyreon(), pyreon(), zero({ mode: 'spa' })],
  server: { port: 5180 },
})
