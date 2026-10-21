/**
 * Bundle a web-host ENTRY (the few lines that assign `window.CM` / `window.TT` from the app's installed editor engine)
 * into one self-contained IIFE, so a native `<WebView>` can load it with no network and no module system.
 *
 * WHY THIS LIVES IN TOOLING, NOT IN THE EDITOR PACKAGE. CodeMirror and TipTap are modular ESM with app-chosen
 * languages and extensions. A prebuilt bundle would fix those choices for every app and ship half a megabyte in each
 * published tarball whether the app targets native or not. Building from the app's own installed copy keeps the choice
 * where it belongs and costs a web-only app nothing.
 *
 * WHY NOT BUNDLE INLINE LIKE `buildChartHostHtml`. The result is far past a string-literal limit: Kotlin rejects a
 * constant above 64 KB (the JVM constant pool), and a CodeMirror host is roughly eight times that. The page is therefore
 * written as an asset (`assets/webhost/…`) and loaded through `<WebView src>`, which is also the route the runtimes
 * document for exactly this case.
 *
 * Tooling only: it needs a bundler the APP has installed (`esbuild` or `rolldown` — a Vite app has one of them) and
 * fails with the install instruction when it has neither. The compiler takes no dependency on either.
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface BundleWebHostOptions {
  /** ESM source of the entry. Its bare imports resolve from the FIRST directory in `resolveDirs` that can satisfy them. */
  readonly source: string
  /**
   * Directories bare specifiers in `source` resolve from, in order. An editor package puts its OWN directory first (its
   * engine is a regular dependency, which an isolated install only exposes there) and the app directory after it (the
   * language packages are peers the app chose).
   */
  readonly resolveDirs: readonly string[]
  /** Minify the output. Default `true` — the page ships inside the app. */
  readonly minify?: boolean
}

const ENTRY_NAME = 'pyreon-web-host-entry.js'

interface EsbuildLike {
  build(options: Record<string, unknown>): Promise<{ outputFiles?: { text: string }[] }>
}

interface RolldownLike {
  rolldown(options: Record<string, unknown>): Promise<{
    generate(options: Record<string, unknown>): Promise<{ output: { type: string; code?: string }[] }>
    close?(): Promise<void>
  }>
}

/** Load `name` as the app would resolve it, or `undefined` when it is not installed there. */
async function loadFrom<T>(name: string, dirs: readonly string[]): Promise<T | undefined> {
  for (const dir of dirs) {
    try {
      const resolved = createRequire(join(dir, 'noop.js')).resolve(name)
      return (await import(pathToFileURL(resolved).href)) as T
    } catch {
      // not installed at this location — try the next one
    }
  }
  return undefined
}

async function withEsbuild(esbuild: EsbuildLike, options: BundleWebHostOptions): Promise<string> {
  const { source, resolveDirs, minify = true } = options
  // esbuild names a stdin importer `<resolveDir>/<sourcefile>`, so the entry is recognised by that exact path.
  const entryImporter = join(resolveDirs[0]!, ENTRY_NAME)
  const result = await esbuild.build({
    stdin: { contents: source, resolveDir: resolveDirs[0], loader: 'js', sourcefile: ENTRY_NAME },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    minify,
    write: false,
    logLevel: 'silent',
    // Only the ENTRY falls back across directories. Anything imported from inside a package resolves from that package
    // — redirecting those would pull a second copy of `@codemirror/state` and break the editor's instanceof checks.
    plugins: [
      {
        name: 'pyreon-web-host-resolve',
        setup(build: {
          onResolve(
            options: { filter: RegExp },
            callback: (args: { path: string; importer: string; kind: string; pluginData?: unknown }) => unknown,
          ): void
          resolve(path: string, options: Record<string, unknown>): Promise<{ errors: unknown[] }>
        }) {
          build.onResolve({ filter: /^[^./]/ }, async (args) => {
            if (args.pluginData === 'pyreon-web-host' || args.importer !== entryImporter) return undefined
            for (const dir of resolveDirs) {
              const r = await build.resolve(args.path, {
                resolveDir: dir,
                kind: args.kind,
                pluginData: 'pyreon-web-host',
              })
              if (r.errors.length === 0) return r
            }
            return undefined
          })
        },
      },
    ],
  })
  const text = result.outputFiles?.[0]?.text
  if (text === undefined) throw new Error('[Pyreon] esbuild produced no output for the web-host entry.')
  return text
}

async function withRolldown(rolldown: RolldownLike, options: BundleWebHostOptions): Promise<string> {
  const { source, resolveDirs, minify = true } = options
  const entry = '\0pyreon-web-host-entry'
  const bundle = await rolldown.rolldown({
    input: entry,
    platform: 'browser',
    logLevel: 'silent',
    plugins: [
      {
        name: 'pyreon-web-host-resolve',
        async resolveId(
          this: { resolve(id: string, importer: string, options: Record<string, unknown>): Promise<unknown> },
          id: string,
          importer: string | undefined,
        ) {
          if (id === entry) return entry
          if (importer !== entry || !/^[^./]/.test(id)) return undefined
          for (const dir of resolveDirs) {
            const r = await this.resolve(id, join(dir, 'noop.js'), { skipSelf: true })
            if (r) return r
          }
          return undefined
        },
        load(id: string) {
          return id === entry ? source : undefined
        },
      },
    ],
  })
  try {
    const { output } = await bundle.generate({ format: 'iife', minify })
    const chunk = output.find((o) => o.type === 'chunk')
    if (chunk?.code === undefined) throw new Error('[Pyreon] rolldown produced no output for the web-host entry.')
    return chunk.code
  } finally {
    await bundle.close?.()
  }
}

/**
 * Bundle `source` to one IIFE string using whichever supported bundler the app has installed.
 *
 * @example
 * const script = await bundleWebHostScript({
 *   source: `import { EditorView } from 'codemirror'; window.CM = { EditorView }`,
 *   resolveDirs: [codePackageDir, appDir],
 * })
 */
export async function bundleWebHostScript(options: BundleWebHostOptions): Promise<string> {
  if (options.resolveDirs.length === 0) throw new Error('[Pyreon] bundleWebHostScript needs at least one resolve directory.')
  const esbuild = await loadFrom<EsbuildLike>('esbuild', options.resolveDirs)
  if (esbuild) return withEsbuild(esbuild, options)
  const rolldown = await loadFrom<RolldownLike>('rolldown', options.resolveDirs)
  if (rolldown) return withRolldown(rolldown, options)
  throw new Error(
    '[Pyreon] Building a native web-host page (the editor inside a <WebView>) needs a bundler, and neither `esbuild` nor ' +
      '`rolldown` resolves from this app. A Vite app already has one; otherwise add it: `bun add -d esbuild`.',
  )
}
