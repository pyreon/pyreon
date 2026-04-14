import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

// `use…`/`get…`/`is…`/`has…` are conventional hook/getter prefixes — not
// signal reads. `[A-Z]…` covers component invocations. The skip-names set
// covers framework VNode-producing helpers whose call sites always produce
// JSX, not signal values:
//   - `render`     — `@pyreon/ui-core` render-prop helper
//   - `h`          — `@pyreon/core` hyperscript (JSX runtime)
//   - `cloneVNode` — `@pyreon/core` VNode-tree cloner (used by kinetic)
// Matching is on full identifier name, so user-defined signals with these
// exact names would slip through; rename to `rendered`/`hyperscript`/etc.
// or move the read outside JSX.
const SKIP_NAMES = new Set(['render', 'h', 'cloneVNode'])
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
