/**
 * M3.5 — `pyreon/missing-get-static-paths`.
 *
 * A dynamic route file (filename contains `[param]` or `[...rest]`)
 * that lacks an `export const getStaticPaths` (or `export async
 * function getStaticPaths`). Under `mode: 'ssg'`, the SSG plugin's
 * auto-detect step SILENTLY SKIPS such routes — `dist/posts/<id>/
 * index.html` never gets emitted, the user thinks prerendering worked
 * but production serves 404s on every dynamic URL.
 *
 * The rule fires on the route file itself (filename signal alone is
 * enough — `[id].tsx` / `[...slug].tsx` shapes). Scopes to files under
 * `src/routes/` because the dynamic-route convention is fs-router-
 * specific.
 *
 * **Skips API routes.** Files under `src/routes/api/` AND any file
 * that doesn't export a `default` page component are API handlers —
 * they're runtime-only by definition (fs-router invokes them per
 * request, never prerenders them), so `getStaticPaths` doesn't apply.
 * Caught originally in M3.B against `examples/cpa-pw-blog`'s
 * `api/echo/[...path].ts`. Both checks fire together as defense in
 * depth: the path check catches the convention, the export-shape
 * check catches anyone who puts an API route outside `api/`.
 *
 * Fires `warn` because dynamic routes that intentionally run as SSR
 * (mode: 'ssr' / 'isr') don't need `getStaticPaths` — the rule can't
 * read `vite.config.ts` to know which mode the app uses. The warn
 * level signals "review whether this is intentional" without blocking
 * the build.
 */
import type { Rule, VisitorCallbacks } from '../../types'

const ROUTES_PATH_RE = /[/\\]routes[/\\]/
const API_PATH_RE = /[/\\]routes[/\\]api[/\\]/
const DYNAMIC_FILENAME_RE = /\[.+\]\.(tsx?|jsx?)$/
const SPECIAL_ROUTE_RE = /[/\\]_(layout|error|loading|404|not-found)\./

export const missingGetStaticPaths: Rule = {
  meta: {
    id: 'pyreon/missing-get-static-paths',
    category: 'ssg',
    description:
      'Dynamic route files (`[id].tsx`, `[...slug].tsx`) should export `getStaticPaths` — under `mode: "ssg"` the SSG plugin silently skips routes without it.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    if (!ROUTES_PATH_RE.test(filePath)) return {}
    // Skip API routes (`src/routes/api/`) — they're runtime handlers,
    // never prerendered. Page-vs-API by file-system convention.
    if (API_PATH_RE.test(filePath)) return {}
    if (!DYNAMIC_FILENAME_RE.test(filePath)) return {}
    if (SPECIAL_ROUTE_RE.test(filePath)) return {}

    let hasGetStaticPaths = false
    let hasDefaultExport = false
    let declaresRuntimeMode = false
    let programSpan: { start: number; end: number } | null = null

    const callbacks: VisitorCallbacks = {
      Program(node: any) {
        programSpan = { start: node.start ?? 0, end: node.end ?? 0 }
      },
      ExportNamedDeclaration(node: any) {
        const decl = node.declaration
        if (!decl) return
        if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations ?? []) {
            if (declarator.type !== 'VariableDeclarator') continue
            const id = declarator.id
            if (id?.type === 'Identifier' && id.name === 'getStaticPaths') {
              hasGetStaticPaths = true
            }
            // `export const renderMode = 'ssr' | 'isr' | 'spa'` declares the
            // route runtime-only (or CSR-shelled) — getStaticPaths doesn't
            // apply, exactly mirroring the zero build's exemption. Only a
            // literal counts (a computed mode gets its own build warning).
            if (id?.type === 'Identifier' && id.name === 'renderMode') {
              const init = declarator.init
              const value
                = init?.type === 'Literal' || init?.type === 'StringLiteral'
                  ? (init as { value?: unknown }).value
                  : undefined
              if (value === 'ssr' || value === 'isr' || value === 'spa') {
                declaresRuntimeMode = true
              }
            }
          }
        } else if (decl.type === 'FunctionDeclaration') {
          if (decl.id?.name === 'getStaticPaths') {
            hasGetStaticPaths = true
          }
        }
      },
      ExportDefaultDeclaration() {
        hasDefaultExport = true
      },
      'Program:exit'() {
        // No `export default` → it's an API route by structure. Skip.
        // Page routes structurally require a default-exported component
        // (the fs-router renders `route.component`). Files exporting only
        // method handlers (`GET` / `POST` / etc.) without a default are
        // API routes wherever they sit in the tree.
        if (!hasDefaultExport) return
        if (declaresRuntimeMode) return
        if (hasGetStaticPaths || !programSpan) return
        context.report({
          message:
            'Dynamic route file is missing `export const getStaticPaths` — under `mode: "ssg"` the SSG plugin silently skips this route, so the dist won\'t contain prerendered HTML. Either add `export const getStaticPaths = () => [{ params: { ... } }, ...]` enumerating the concrete values, OR declare the route\'s own mode: `export const renderMode = \'ssr\'` (server-rendered) / `\'spa\'` (client shell) — or switch the app to `mode: "ssr"` / `mode: "isr"`.',
          // Report at the start of the file so the diagnostic is visible
          // in editor gutters without scrolling.
          span: { start: programSpan.start, end: Math.min(programSpan.start + 1, programSpan.end) },
        })
      },
    }
    return callbacks
  },
}
