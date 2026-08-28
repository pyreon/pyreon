import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A `node:` builtin imported by a file that also renders JSX.
 *
 * A component file is reachable from the client bundle by definition, and a
 * STATIC `node:` import is evaluated eagerly for side effects — so the bundler
 * pulls it into the browser build whether or not the binding is ever used.
 * This repo's own catalog documents the consequence at length: the import
 * either fails to resolve or is "externalized for browser compatibility",
 * which leaves a dead chunk and a warning nobody reads.
 *
 * The documented fix is not a lazy `await import()` — that still emits the
 * chunk. It is to move the import SITE into a server-only module.
 *
 * Scoped to files containing JSX so it cannot fire on a genuine server module
 * that happens to sit outside a `server/` directory.
 */

export const noNodeBuiltinInComponent: Rule = {
  meta: {
    id: 'pyreon/no-node-builtin-in-component',
    category: 'isomorphic',
    description:
      'A static `node:` import in a file that renders JSX drags a Node builtin into the client bundle — the documented break is a failed resolve or a dead externalized chunk.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const nodeImports: Array<{ source: string; span: { start: number; end: number } }> = []
    let rendersJsx = false

    const callbacks: VisitorCallbacks = {
      JSXElement() {
        rendersJsx = true
      },
      JSXFragment() {
        rendersJsx = true
      },
      ImportDeclaration(node: any) {
        const src = node?.source?.value
        if (typeof src !== 'string' || !src.startsWith('node:')) return
        // A type-only import is erased before bundling and is harmless.
        if (node.importKind === 'type') return
        nodeImports.push({ source: src, span: getSpan(node) })
      },
      'Program:exit'() {
        if (!rendersJsx) return
        for (const imp of nodeImports) {
          context.report({
            message: `\`${imp.source}\` imported by a file that renders JSX — the component is client-reachable, and a static \`node:\` import is evaluated for side effects, so the bundler pulls it into the browser build (it fails to resolve, or is externalized into a dead chunk). Move the import SITE into a server-only module; a lazy \`await import()\` still emits the chunk. Use \`import type\` if you only need the types.`,
            span: imp.span,
          })
        }
      },
    }
    return callbacks
  },
}
