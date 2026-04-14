import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

// `use…`/`get…`/`is…`/`has…` are conventional hook/getter prefixes — not
// signal reads. `[A-Z]…` covers component invocations. `render` is the
// @pyreon/ui-core VNode-producing helper (takes a ComponentFn/string/VNode
// and returns a VNodeChild) — its call sites always produce JSX, not signal
// values. Matching here is on the full identifier name, so user-defined
// signals named `render` would slip through; in that case rename to
// `rendered`/`renderSignal` or move the read outside JSX.
const SKIP_NAMES = new Set(['render'])
const SKIP_PREFIXES = /^(use|get|is|has|[A-Z])/

export const noBareSignalInJsx: Rule = {
  meta: {
    id: 'pyreon/no-bare-signal-in-jsx',
    category: 'reactivity',
    description:
      'Disallow bare signal calls in JSX text positions. Wrap in `() =>` for reactivity.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    let jsxDepth = 0
    const callbacks: VisitorCallbacks = {
      JSXElement() {
        jsxDepth++
      },
      'JSXElement:exit'() {
        jsxDepth--
      },
      JSXFragment() {
        jsxDepth++
      },
      'JSXFragment:exit'() {
        jsxDepth--
      },
      JSXExpressionContainer(node: any) {
        if (jsxDepth === 0) return
        const expr = node.expression
        if (!expr || expr.type !== 'CallExpression') return
        const callee = expr.callee
        if (!callee || callee.type !== 'Identifier') return

        const name: string = callee.name
        if (SKIP_NAMES.has(name) || SKIP_PREFIXES.test(name)) return

        const span = getSpan(node)
        const source = context.getSourceText()
        const original = source.slice(span.start, span.end)
        // {count()} → {() => count()}
        const inner = original.slice(1, -1) // strip { }
        const fixed = `{() => ${inner}}`

        context.report({
          message: `Bare signal call \`${name}()\` in JSX text — wrap in \`() => ${name}()\` for fine-grained reactivity.`,
          span,
          fix: { span, replacement: fixed },
        })
      },
    }
    return callbacks
  },
}
