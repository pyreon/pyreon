/**
 * `loom build` — the observatory as a STANDALONE STATIC SITE.
 *
 * `loom dev` serves the observatory over a Vite dev server; this prerenders it
 * to plain files you can drop on any static host, or open from disk. It is a
 * @pyreon/zero app (`app/` in this package) built in SSG mode, so each of the
 * five views becomes its own prerendered page at its own URL — which is the
 * point. Until now the view was a signal, so there was no way to send someone
 * a link to the cycles view.
 *
 * ── Three constraints this had to be built around ─────────────────────────
 *
 * 1. PATHS ARE REALPATH-NORMALIZED. Vite resolves the entry id to a real path
 *    while `root` is whatever you passed, and `vite:build-html` then derives
 *    the emitted file's name by relativizing one against the other. Hand it a
 *    symlinked root (on macOS `/tmp` IS a symlink to `/private/tmp`) and that
 *    relative path escapes upward — `../../../../../../…` — which rolldown
 *    rejects outright. Both root and outDir go through `realpathSync`.
 *
 * 2. THE MODE IS DECLARED, NEVER INFERRED. zero's `mode: 'auto'` resolves the
 *    routes directory at plugin-factory time from `process.cwd()`. This app
 *    lives inside the installed package while cwd is the user's own repo, so
 *    inference would scan THEIR `src/routes`. `mode: 'ssg'` is explicit.
 *
 * 3. THE REPORT IS A VIRTUAL MODULE, not a loader. Every view renders from the
 *    same scan, so five per-route loaders would re-derive identical data five
 *    times — and could disagree if the workspace changed mid-build. One blob,
 *    baked in, which is also what makes the output work from `file://`.
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LoomReport } from '../core/types'

const REPORT_ID = 'virtual:loom/report'
const RESOLVED_REPORT_ID = `\0${REPORT_ID}`

export const NO_BUILD_DEPS =
  '[Pyreon] loom build needs Vite and the zero stack, which are not installed in this project.\n' +
  '  Install them as dev dependencies:\n\n' +
  '    bun add -d vite @pyreon/vite-plugin @pyreon/zero\n\n' +
  '  `loom scan` does not need any of them and keeps working without them.'

/**
 * The bundled zero app's directory, resolved from THIS module rather than cwd
 * — the same climb `loom dev` uses for the UI module, and for the same reason:
 * the scanned project does not depend on loom, so a bare specifier resolves
 * nowhere.
 */
export function appDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, 'app')
    if (existsSync(join(candidate, 'index.html'))) return realpathSync(candidate)
    dir = dirname(dir)
  }
  throw new Error('[Pyreon] loom build: could not locate the observatory app next to the loom install')
}

export interface BuildOptions {
  report: LoomReport
  /** Where to emit the site. Realpath-normalized before Vite sees it. */
  outDir: string
  brand?: string
  base?: string
}

/** Build the static site. Returns the absolute output directory. */
export async function buildStaticSite(options: BuildOptions): Promise<string> {
  const root = appDir()
  // `resolve` first so a relative --out is anchored to cwd, then realpath the
  // EXISTING ancestor — the leaf may not exist yet, and realpath throws on
  // missing paths.
  const outAbs = resolve(options.outDir)
  const outDir = join(realpathSync(dirname(outAbs)), basenameOf(outAbs))

  let build: (config: Record<string, unknown>) => Promise<unknown>
  let pyreon: (o?: unknown) => unknown
  let zero: (o?: unknown) => unknown
  try {
    build = ((await import('vite')) as unknown as { build: typeof build }).build
    const p = (await import('@pyreon/vite-plugin')) as unknown as { default?: typeof pyreon }
    const z = (await import('@pyreon/zero/server')) as unknown as { default?: typeof zero }
    if (typeof p.default !== 'function' || typeof z.default !== 'function') throw new Error('[Pyreon] no factory')
    pyreon = p.default
    zero = z.default
  } catch {
    throw new Error(NO_BUILD_DEPS)
  }

  const reportJson = JSON.stringify(options.report)
  const brand = options.brand ?? 'loom'

  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    ...(options.base ? { base: options.base } : {}),
    plugins: [
      // zero's SSG cannot reuse this plugin INSTANCE in its nested SSR build
      // (a second `configResolved` would rewrite captured output paths), so it
      // constructs a fresh one and carries the transform options across —
      // `compat` / `ssrTemplate` / `islands` / `jsxAutoImport` / the validator
      // options. It deliberately withholds the ones that would mis-steer a
      // nested build (`ssr.entry` would replace the synthetic entry). See
      // `@pyreon/zero`'s `inner-pyreon-options.ts` for the per-option split.
      pyreon({ devErrorPrinter: false }),
      zero({ mode: 'ssg' }),
      {
        name: 'loom:report',
        resolveId(id: string) {
          return id === REPORT_ID ? RESOLVED_REPORT_ID : undefined
        },
        load(id: string) {
          if (id !== RESOLVED_REPORT_ID) return undefined
          return `export default ${reportJson}\nexport const brand = ${JSON.stringify(brand)}\n`
        },
      },
    ],
    build: { outDir, emptyOutDir: true },
  })

  return outDir
}

function basenameOf(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1] ?? ''
}
