import { resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

/**
 * Env-gated, dev-only test harness plugin. Active ONLY when
 * `PYREON_HMR_TEST` is set — which ONLY `e2e-configs/zero-hmr.config.ts`'s
 * webServer sets. Never present in normal dev, never in any build.
 *
 * WHY THIS EXISTS — the zero-hmr e2e gate edits a route file mid-test
 * via a programmatic in-place `writeFileSync` and asserts the DOM hot-
 * updates in place. It was a CI-only failure no local run reproduced.
 * Root cause is the OS FILE WATCHER, not the framework HMR pipeline:
 *
 *   • GitHub Actions' Linux runner FS is overlayfs, where inotify does
 *     NOT reliably deliver `change` events for a programmatic write —
 *     Vite never learns the file changed, never sends the HMR update.
 *   • Bun's watcher layer is independently unreliable for the same write.
 *   • Vite 8's `server.watch.usePolling` is blind in this setup under
 *     BOTH Bun and Node (proven locally — polling never delivers either).
 *   • macOS fsevents (local) happens to deliver it, which is the ONLY
 *     reason any local run ever passed and why CI is the sole repro env.
 *
 * There is no watcher configuration that works on GHA Linux. So this
 * harness removes the dependency on the OS watcher entirely: it exposes
 * a dev-only endpoint the spec POSTs to AFTER writing the file. The
 * endpoint calls `server.watcher.emit('change', absPath)` — the EXACT
 * entrypoint a real fs `change` event uses. Vite then runs its full,
 * genuine HMR pipeline (plugin `handleHotUpdate` → module-graph
 * invalidate → `ws` update push → the injected `import.meta.hot.accept`
 * callback → `@pyreon/router._hmrSwap` → `RouterView` re-render). The
 * framework codepath under test is 100% real; only the "Vite noticed
 * the file changed" trigger is made deterministic instead of left to
 * flaky OS inotify. OS / runtime / filesystem become irrelevant.
 */
function hmrTestTrigger(): Plugin {
  let server: ViteDevServer | undefined
  return {
    name: 'pyreon:hmr-test-trigger',
    apply: 'serve',
    configureServer(s) {
      server = s
      s.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/__pyreon_hmr_touch__')) {
          return next()
        }
        const u = new URL(req.url, 'http://localhost')
        const f = u.searchParams.get('f')
        if (!f || !server) {
          res.statusCode = 400
          res.end('missing ?f= or no server')
          return
        }
        const abs = resolve(f)
        // Drive Vite's REAL HMR pipeline via the same entrypoint a
        // genuine fs change uses — no OS watcher involved.
        server.watcher.emit('change', abs)
        res.statusCode = 200
        res.setHeader('content-type', 'text/plain')
        res.end(`touched ${abs}`)
      })
    },
  }
}

export default defineConfig({
  plugins: [
    pyreon(),
    zero(),
    ...(process.env.PYREON_HMR_TEST ? [hmrTestTrigger()] : []),
  ],
})
