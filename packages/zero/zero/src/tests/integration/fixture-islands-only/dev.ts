/**
 * Runs the islands-only fixture (#4371) under zero's DEV server, from zero's
 * SOURCE, for the HMR half of `e2e/zero-islands-only.spec.ts`:
 *
 *   bun packages/zero/zero/src/tests/integration/fixture-islands-only/dev.ts <port>
 *
 * `GET /__pyreon_hmr_touch__?f=<file under the fixture>` drives Vite's real
 * HMR pipeline for that file (the watcher's own `change` event, as
 * `examples/fixtures/ssr-showcase` does for `zero-hmr`), so the spec can
 * "edit" a module without writing to the committed fixture.
 */
import { resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import { createServer, type Plugin, type ViteDevServer } from 'vite'
import { zeroPlugin } from '../../../vite-plugin'
import { FIXTURE } from './build'

function hmrTouch(): Plugin {
  let server: ViteDevServer | undefined
  return {
    name: 'fixture-islands-only:hmr-touch',
    apply: 'serve',
    configureServer(s) {
      server = s
      s.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__pyreon_hmr_touch__')) return next()
        const f = new URL(req.url, 'http://localhost').searchParams.get('f')
        const abs = f ? resolve(FIXTURE, f) : ''
        if (!server || !abs.startsWith(`${FIXTURE}/`)) {
          res.statusCode = 400
          res.end('missing or out-of-fixture ?f=')
          return
        }
        server.watcher.emit('change', abs)
        res.end(`touched ${abs}`)
      })
    },
  }
}

const port = Number(process.argv[2] ?? 5218)

const server = await createServer({
  root: FIXTURE,
  configFile: false,
  logLevel: 'error',
  // zero's `port` sets the dev server's port (its config hook wins over an inline `server.port`).
  plugins: [pyreon(), ...zeroPlugin({ mode: 'ssr', port }), hmrTouch()],
  resolve: { conditions: ['bun'] },
  ssr: { resolve: { conditions: ['bun'] } },
  // HMR is driven through the touch endpoint; the OS watcher would only add noise.
  server: { strictPort: true, watch: null },
})

await server.listen()
