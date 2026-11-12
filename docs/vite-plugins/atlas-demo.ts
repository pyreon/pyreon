import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { buildAtlasDemo } from '../scripts/build-atlas-demo'

/**
 * `/demos/atlas/` — the static Atlas workbench the /products/atlas demo loads
 * in an iframe, built from `examples/atlas-workshop` by the real `atlas build`
 * (`scripts/build-atlas-demo.ts`, about two seconds). Generated, never
 * committed:
 *
 *   - build: written into `<outDir>/demos/atlas/` after the client bundle.
 *   - dev: built once into `node_modules/.cache/atlas-demo/` and served from there.
 *
 * A failed `atlas build` fails the site build: the demo would be an empty frame.
 */
const ROUTE = '/demos/atlas/'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

export default function atlasDemo(): Plugin {
  let config: ResolvedConfig | undefined
  return {
    name: 'pyreon-docs-atlas-demo',
    configResolved(c) {
      config = c
    },
    configureServer(server) {
      const dir = resolve(server.config.root, 'node_modules/.cache/atlas-demo')
      let built = false
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? ''
        if (!url.startsWith(ROUTE)) return next()
        if (!built) {
          buildAtlasDemo(dir)
          built = true
        }
        const rel = normalize(url.slice(ROUTE.length) || 'index.html')
        const file = join(dir, rel)
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      // The client build only: the SSR build writes elsewhere.
      if (!config || config.command !== 'build' || config.build.ssr) return
      buildAtlasDemo(resolve(config.root, config.build.outDir, 'demos/atlas'))
    },
  }
}
