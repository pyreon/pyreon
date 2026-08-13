// Reusable builder for a web-only package's WebView-host bundle — the turnkey
// half of the WebView-host pattern.
//
// A web rendering/editing engine (@pyreon/rich-text, @pyreon/flow, …) that
// can't be a native view runs 1:1 on iOS/Android by being hosted in a
// `<WebView>`. This bundles the package's `webview-entry` (which calls
// `connectWebHost` + mounts the engine into `#root`) into a SINGLE
// self-contained HTML page — everything inlined, no external script/link — that
// works as `<iframe srcdoc>` on web and `loadHTMLString` on a WKWebView /
// Android WebView.
//
// It bundles against the BUILT `lib/` (the `import`/`browser` conditions), NOT
// `src/` (the `bun` condition), because the Pyreon packages do
// `import { name, version } from '../package.json'` for their singleton
// registration — a raw JSON import esbuild can't resolve from source, but which
// is already inlined as literals in `lib/`. So `lib/` must be built first
// (`bun scripts/bootstrap.ts`).

import { build } from 'esbuild'
import { resolve } from 'node:path'

export interface WebHostBundleOptions {
  /** Entry file — a `webview-entry.ts` that calls `connectWebHost()` + mounts. */
  entry: string
  /** Optional page `<title>`. */
  title?: string
  /** Mount root id the entry renders into. Default `'root'`. */
  rootId?: string
}

/** esbuild plugin: resolve a bare `package.json` import to the literal file
 *  (bypass the exports map) so `import { name } from '../package.json'` loads
 *  as JSON. A safety net for any lib that still carries the source shape. */
const packageJsonAsFile = {
  name: 'pyreon:package-json-as-file',
  setup(b: {
    onResolve: (
      opts: { filter: RegExp },
      cb: (a: { path: string; resolveDir: string; kind: string }) => { path: string } | null,
    ) => void
  }): void {
    b.onResolve({ filter: /(^|\/)package\.json$/ }, (args) =>
      args.kind === 'entry-point' ? null : { path: resolve(args.resolveDir, args.path) },
    )
  },
}

/**
 * Build a web-only component's WebView-host bundle → a self-contained HTML page.
 * Returns the HTML string to pass as `<WebView html={…}>`.
 */
export async function buildWebHostBundle(options: WebHostBundleOptions): Promise<string> {
  const result = await build({
    entryPoints: [options.entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    // Inline the engine's lazy `import('@tiptap/*')` etc. into the ONE file so
    // the page is truly self-contained (no runtime import()).
    supported: { 'dynamic-import': false },
    // Bundle the BUILT lib/, where name/version are inlined literals.
    conditions: ['import', 'browser', 'default'],
    plugins: [packageJsonAsFile],
  })
  const script = result.outputFiles[0]!.text
  const root = options.rootId ?? 'root'
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    (options.title === undefined ? '' : `<title>${options.title}</title>`) +
    `</head><body style="margin:0"><div id="${root}"></div>` +
    `<script>${script}</script></body></html>`
  )
}
