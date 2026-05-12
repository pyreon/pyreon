/**
 * M3.5 — `pyreon/revalidate-not-pure-literal`.
 *
 * `export const revalidate = X` where X isn't a numeric literal or
 * `false`. PR I's `extractLiteralExport` skips non-literal expressions
 * silently — the build-time ISR manifest (`_pyreon-revalidate.json`)
 * omits the entry, platform-driven ISR is silently unconfigured for
 * that route. The user thinks ISR is wired but production stays stale
 * forever.
 *
 * The rule scopes to route files (anything under `src/routes/`) — the
 * `revalidate` convention only has meaning there. Module-level
 * `const revalidate = X` in unrelated files is fine.
 */
import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

const ROUTES_PATH_RE = /[/\\]routes[/\\]/

function isLiteralOk(node: any): boolean {
  if (!node) return false
  // `60`, `3600`, etc.
  if (node.type === 'Literal' && typeof node.value === 'number') return true
  if (node.type === 'NumericLiteral' && typeof node.value === 'number') return true
  // `false` (oxc emits `Literal` for booleans too; some shapes emit
  // `BooleanLiteral`). Accept both.
  if (node.type === 'Literal' && node.value === false) return true
  if (node.type === 'BooleanLiteral' && node.value === false) return true
  return false
}

export const revalidateNotPureLiteral: Rule = {
  meta: {
    id: 'pyreon/revalidate-not-pure-literal',
    category: 'ssg',
    description:
      '`export const revalidate = X` must be a numeric literal or `false` — non-literal forms are silently dropped from the build-time ISR manifest (PR I limitation).',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    // Only scope to route files. The `revalidate` convention is fs-router-
    // specific; module-level `const revalidate = X` in unrelated files is
    // a different code path.
    if (!ROUTES_PATH_RE.test(filePath)) return {}

    const callbacks: VisitorCallbacks = {
      ExportNamedDeclaration(node: any) {
        const decl = node.declaration
        if (!decl || decl.type !== 'VariableDeclaration') return
        for (const declarator of decl.declarations ?? []) {
          if (declarator.type !== 'VariableDeclarator') continue
          const id = declarator.id
          if (id?.type !== 'Identifier' || id.name !== 'revalidate') continue
          const init = declarator.init
          if (!init) continue
          if (isLiteralOk(init)) continue
          context.report({
            message:
              '`export const revalidate` must be a numeric literal (e.g. `60`, `3600`) or `false` — non-literal expressions (variable references, math, function calls, template literals) are silently dropped from the build-time ISR manifest. Inline the value: `export const revalidate = 60`.',
            span: getSpan(init),
          })
        }
      },
    }
    return callbacks
  },
}
