// As scaffolded by `create-solid@0.12.0 -s --v2 -t basic` (SolidStart 2 + Nitro 3, node preset by default):
//   https://docs.solidjs.com/solid-start/getting-started
import { solidStart } from '@solidjs/start/config'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solidStart(), nitro()],
})
