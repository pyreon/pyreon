// As scaffolded by `@tanstack/cli create --framework React --blank --deployment nitro` (cli 0.72.16),
// which is the Node self-hosting path in https://tanstack.com/start/latest/docs/framework/react/guide/hosting
// (the scaffold's `rollupConfig.external: [/^@sentry\//]` is dropped — no Sentry here).
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [nitro(), tanstackStart(), viteReact()],
})
