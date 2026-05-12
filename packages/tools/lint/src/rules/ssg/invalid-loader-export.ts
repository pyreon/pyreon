/**
 * M3.5 — `pyreon/invalid-loader-export`.
 *
 * `export const loader = X` where X isn't a function. fs-router treats
 * `loader` as a callable: `loader(ctx: LoaderContext)`. If the user
 * exports `loader = { data: ... }` (object) or `loader = await fetch(...)`
 * (a resolved value) — both occasionally happen when learning the API —
 * the SSR / SSG runtime crashes with `TypeError: loader is not a
 * function`, often deep inside the prefetch loop with a stack trace
 * that doesn't name the route.
 *
 * The rule fires on `export const loader = <non-arrow / non-function /
 * non-identifier>`. Function declarations (`export async function
 * loader()`) and arrow / function expressions are obviously fine.
 * Identifier references (`export const loader = myImportedLoader`) are
 * accepted at lint time — the rule can't resolve the binding's
 * callability cross-module without a type-check.
 *
 * Scoped to route files (`src/routes/`).
 */
import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

const ROUTES_PATH_RE = /[/\\]routes[/\\]/

function isLikelyCallable(node: any): boolean {
  if (!node) return false
  // Direct function shapes.
  if (node.type === 'ArrowFunctionExpression') return true
  if (node.type === 'FunctionExpression') return true
  // Identifier — defer to type-check / cross-file resolver. We assume the
  // binding might be a function and don't flag. Catches the
  // `export const loader = sharedLoader` pattern.
  if (node.type === 'Identifier') return true
  // Call expression — caller pattern (`export const loader =
  // makeLoader(...)`). Assume the factory returns a function.
  if (node.type === 'CallExpression') return true
  // Class methods — `export const loader = MyClass.prototype.fetch`.
  if (node.type === 'MemberExpression') return true
  // TS type-as-call (`as Loader<...>`) — strip the cast and re-check.
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
    return isLikelyCallable(node.expression)
  }
  return false
}

export const invalidLoaderExport: Rule = {
  meta: {
    id: 'pyreon/invalid-loader-export',
    category: 'ssg',
    description:
      '`export const loader` must be a function — non-callable exports crash the SSR runtime with `loader is not a function`.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    if (!ROUTES_PATH_RE.test(filePath)) return {}

    const callbacks: VisitorCallbacks = {
      ExportNamedDeclaration(node: any) {
        const decl = node.declaration
        if (!decl) return
        // `export const loader = ...` shape only — function declarations
        // (`export async function loader()`) are obviously callable.
        if (decl.type !== 'VariableDeclaration') return
        for (const declarator of decl.declarations ?? []) {
          if (declarator.type !== 'VariableDeclarator') continue
          const id = declarator.id
          if (id?.type !== 'Identifier' || id.name !== 'loader') continue
          const init = declarator.init
          if (!init) continue
          if (isLikelyCallable(init)) continue
          context.report({
            message:
              '`export const loader` must be a function (arrow, function expression, or identifier reference). Got a non-callable expression — the SSR runtime will crash with `TypeError: loader is not a function`. If you meant to export static data, use `export const meta = { ... }` instead.',
            span: getSpan(init),
          })
        }
      },
    }
    return callbacks
  },
}
