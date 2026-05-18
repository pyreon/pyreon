import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { extractImportInfo } from '../../utils/imports'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/rx` best-practice rule.
 *
 * Nesting rx collection transforms — `map(filter(src, f), g)`,
 * `sortBy(map(...), ...)` — creates one intermediate `Computed` per
 * wrapped call. `pipe(src, filter(...), map(...))` composes the chain
 * into a SINGLE computed that re-derives once per source change.
 *
 * Conservative by design: fires only when BOTH the outer and the inner
 * callee names are in the known rx collection-transform set AND the
 * inner call is the OUTER call's first argument (the rx data-first
 * convention). Any other shape is left alone (zero false positives).
 *
 * Requires `@pyreon/rx` to be both imported in the file AND a declared
 * project dependency.
 */
const RX_TRANSFORMS = new Set([
  'filter',
  'map',
  'sortBy',
  'groupBy',
  'take',
  'skip',
  'uniqBy',
  'compact',
  'reverse',
  'flatten',
  'chunk',
  'partition',
  'first',
  'last',
  'find',
])

export const rxPreferPipe: Rule = {
  meta: {
    id: 'pyreon/rx-prefer-pipe',
    category: 'rx',
    description:
      'In @pyreon/rx projects, compose nested transforms via pipe() instead of wrapping calls (one computed instead of N).',
    severity: 'info',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/rx')) {
      return {}
    }

    let importsRx = false

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (info && info.source === '@pyreon/rx') {
          importsRx = true
        }
      },
      CallExpression(node: any) {
        if (!importsRx) return

        const callee = node.callee
        if (!callee || callee.type !== 'Identifier') return
        if (!RX_TRANSFORMS.has(callee.name)) return

        const args = node.arguments
        if (!args || args.length === 0) return
        const firstArg = args[0]
        if (
          !firstArg ||
          firstArg.type !== 'CallExpression' ||
          firstArg.callee?.type !== 'Identifier' ||
          !RX_TRANSFORMS.has(firstArg.callee.name)
        ) {
          return
        }

        context.report({
          message: `Nested rx transforms \`${callee.name}(${firstArg.callee.name}(...))\` allocate an intermediate Computed per wrap — compose via \`pipe(src, ${firstArg.callee.name}(...), ${callee.name}(...))\` for a single computed.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
