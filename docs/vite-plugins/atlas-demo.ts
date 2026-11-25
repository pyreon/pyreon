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
          buildAtlasDemo(dir, ROUTE)
          built = true
        }
        // Served the way a static host serves the built demo, so dev and the
        // deployed site agree on every URL the workbench writes. The workbench
        // router keeps the trailing slash (`/demos/atlas/button/`), because
        // each component page is a `<id>/index.html` directory:
        //   - a directory URL with the slash → its `index.html`;
        //   - the same URL without it → 301 to the slash form (GitHub Pages,
        //     Netlify and nginx all redirect a directory this way);
        //   - a path with no page under it (a stale id, an extra segment) →
        //     the build's `404.html` shell, whose router lands on the default
        //     component, with a 404 status.
        const path = url.slice(ROUTE.length)
        const target = join(dir, normalize(path))
        if (!target.startsWith(dir)) return next()
        if (path !== '' && !path.endsWith('/') && existsSync(target) && statSync(target).isDirectory()) {
          res.statusCode = 301
          res.setHeader('Location', `${url}/`)
          res.end()
          return
        }
        const direct = path === '' || path.endsWith('/') ? join(target, 'index.html') : target
        const notFound = !existsSync(direct) || !statSync(direct).isFile()
        const file = notFound ? join(dir, '404.html') : direct
        if (!existsSync(file)) return next()
        if (notFound) res.statusCode = 404
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      // The client build only: the SSR build writes elsewhere.
      if (!config || config.command !== 'build' || config.build.ssr) return
      // Under the site's own base: the workbench routes against it.
      buildAtlasDemo(resolve(config.root, config.build.outDir, 'demos/atlas'), `${config.base}demos/atlas/`)
    },
  }
}
