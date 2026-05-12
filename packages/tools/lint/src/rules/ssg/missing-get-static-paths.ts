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
 * Fires `warn` because dynamic routes that intentionally run as SSR
 * (mode: 'ssr' / 'isr') don't need `getStaticPaths` — the rule can't
 * read `vite.config.ts` to know which mode the app uses. The warn
 * level signals "review whether this is intentional" without blocking
 * the build.
 */
import type { Rule, VisitorCallbacks } from '../../types'

const ROUTES_PATH_RE = /[/\\]routes[/\\]/
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
    if (!DYNAMIC_FILENAME_RE.test(filePath)) return {}
    if (SPECIAL_ROUTE_RE.test(filePath)) return {}

    let hasGetStaticPaths = false
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
          }
        } else if (decl.type === 'FunctionDeclaration') {
          if (decl.id?.name === 'getStaticPaths') {
            hasGetStaticPaths = true
          }
        }
      },
      'Program:exit'() {
        if (hasGetStaticPaths || !programSpan) return
        context.report({
          message:
            'Dynamic route file is missing `export const getStaticPaths` — under `mode: "ssg"` the SSG plugin silently skips this route, so the dist won\'t contain prerendered HTML. Either add `export const getStaticPaths = () => [{ params: { ... } }, ...]` enumerating the concrete values, OR declare the route as runtime-only by switching to `mode: "ssr"` / `mode: "isr"`.',
          // Report at the start of the file so the diagnostic is visible
          // in editor gutters without scrolling.
          span: { start: programSpan.start, end: Math.min(programSpan.start + 1, programSpan.end) },
        })
      },
    }
    return callbacks
  },
}
