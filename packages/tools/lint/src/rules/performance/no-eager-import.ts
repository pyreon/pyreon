import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { HEAVY_PACKAGES } from '../../utils/imports'

export const noEagerImport: Rule = {
  meta: {
    id: 'pyreon/no-eager-import',
    category: 'performance',
    description: 'Suggest lazy-loading heavy Pyreon packages (charts, code, document, flow).',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string
        if (!source) return
        // A TYPE-ONLY import is erased before any bundler sees it, so it can
        // never add initial-bundle weight — flagging it steers authors away
        // from the very pattern this rule wants (type the heavy package,
        // `await import()` the value). Covers both `import type {…}` and a
        // declaration whose every specifier is `{ type X }`. Same guard the
        // sibling `no-heavy-import-only-in-handler` already applies.
        if (node.importKind === 'type') return
        const specs = (node.specifiers ?? []) as { importKind?: string }[]
        if (specs.length > 0 && specs.every((sp) => sp?.importKind === 'type')) return
        if (HEAVY_PACKAGES.has(source)) {
          context.report({
            message: `Static import of \`${source}\` — consider using \`lazy()\` or dynamic \`import()\` to reduce initial bundle size.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
