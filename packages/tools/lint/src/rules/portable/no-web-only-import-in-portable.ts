import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPortablePath, portablePathsFrom } from '../../utils/portable-paths'

/**
 * Importing a web-only package from a file that has to reach iOS and Android.
 *
 * PMTC already refuses these at build time. The value here is WHEN it fires:
 * at the moment the import is typed, rather than after a native build that a
 * web-focused change may not have run. The gap between those two points is
 * where a shared file quietly stops being shared.
 *
 * The list below MIRRORS the compiler's own generated set — the region between
 * `<gen:web-only-packages:start>` and `:end` in `native/compiler/src/parse.ts`,
 * which `check-multiplatform-tier` derives from every package manifest's
 * `multiplatform.tier`. It is duplicated rather than imported on purpose:
 * `@pyreon/lint` ships to consumers, and taking a runtime dependency on the
 * native compiler to read one Set would pull the whole PMTC graph into every
 * install. The copy is drift-locked by a test instead, the same trade the
 * `browser-packages.json` list already makes.
 *
 * Only fires on files matched by `portablePaths` — see
 * `no-out-of-subset-construct` for why that has no default.
 */
const WEB_ONLY = new Set([
  '@pyreon/atlas',
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/compiler',
  '@pyreon/config',
  '@pyreon/connector-document',
  '@pyreon/document',
  '@pyreon/document-primitives',
  '@pyreon/flow',
  '@pyreon/head',
  '@pyreon/lathe',
  '@pyreon/lint',
  '@pyreon/loom',
  '@pyreon/mcp',
  '@pyreon/rich-text',
  '@pyreon/runtime-dom',
  '@pyreon/runtime-server',
  '@pyreon/server',
  '@pyreon/testing',
  '@pyreon/ui-components',
  '@pyreon/ui-primitives',
  '@pyreon/unistyle',
  '@pyreon/virtual',
  '@pyreon/zero',
  '@pyreon/zero-content',
])

/** Packages whose `/webview` subpath IS the native story. */
const WEBVIEW_BRIDGED = new Set([
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/flow',
  '@pyreon/rich-text',
])


export const noWebOnlyImportInPortable: Rule = {
  meta: {
    id: 'pyreon/no-web-only-import-in-portable',
    category: 'portable',
    description:
      'A web-only package imported from shared source that must reach iOS and Android — PMTC refuses it at build time; this refuses it at authoring time.',
    severity: 'error',
    optIn: true,
    fixable: false,
    schema: { portablePaths: 'string[]' },
  },
  create(context) {
    const paths = portablePathsFrom(context)
    if (!isPortablePath(context.getFilePath(), paths)) return {}

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const src = node?.source
        if (src?.type !== 'Literal' || typeof src.value !== 'string') return
        const spec = String(src.value)
        // A `/webview` subpath is the sanctioned native route for these.
        if (spec.endsWith('/webview')) return
        const base = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        if (base === undefined || !WEB_ONLY.has(base)) return

        const bridge = WEBVIEW_BRIDGED.has(base)
          ? ` \`${base}\` does cross via its \`${base}/webview\` subpath — import that instead.`
          : ''
        context.report({
          message: `\`${base}\` is web-only, and this file is declared portable, so it has to compile for iOS and Android too. PMTC will refuse this at build time; the point of saying so here is that a web-focused change may not run a native build for days.${bridge}`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}

/** Exported for the drift lock against the compiler's generated set. */
export const WEB_ONLY_PACKAGES_MIRROR: ReadonlySet<string> = WEB_ONLY
