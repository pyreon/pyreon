/**
 * vite-plugin-publish-llms-txt — serves the repo's generated `llms.txt` and
 * `llms-full.txt` at the site root (`https://pyreon.dev/llms.txt`).
 *
 * `bun run gen-docs` writes both files at the REPO root from every package's
 * `src/manifest.ts`; the docs, the README and the posts tell AI tools to read
 * them from the site. Nothing copied them into the docs build, so both URLs
 * were 404. They are emitted into the client build from the repo root on every
 * build (no committed copy under `public/` that could drift from the
 * generator), and served by the dev server at the same paths.
 *
 * A missing source file FAILS the build (`readFileSync` throws) rather than
 * publishing a site without it; `.github/workflows/docs.yml` also checks that
 * `dist/` holds both, byte-identical to the repo root.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const LLMS_FILES = ['llms.txt', 'llms-full.txt'] as const

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export default function publishLlmsTxt(repoRoot: string = REPO_ROOT): Plugin {
  let serverBuild = false
  const read = (file: string): string => readFileSync(join(repoRoot, file), 'utf-8')

  return {
    name: 'pyreon-docs-publish-llms-txt',

    configResolved(config) {
      // zero's SSG pass runs nested server builds with this plugin chain; only
      // the client build writes the site.
      serverBuild = Boolean(config.build.ssr)
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = LLMS_FILES.find((f) => req.url === `/${f}`)
        if (file === undefined) return next()
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end(read(file))
      })
    },

    generateBundle() {
      if (serverBuild) return
      for (const file of LLMS_FILES) {
        this.emitFile({ type: 'asset', fileName: file, source: read(file) })
      }
    },
  }
}
