import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

function isComponentTag(name: string): boolean {
  return name.length > 0 && name[0] === name[0]?.toUpperCase() && name[0] !== name[0]?.toLowerCase()
}

/**
 * Warn when a known signal/computed is called in a component prop position.
 * Component props are evaluated once at mount — signal reads are NOT reactive
 * unless the compiler wraps them with _rp(). The compiler handles this
 * automatically, but this rule catches manual h() calls and educates developers.
 */
export const noSignalInProps: Rule = {
  meta: {
    id: 'pyreon/no-signal-in-props',
    category: 'reactivity',
    description:
      'Signal call in component prop — value captured once unless compiler wraps it. Use props.x pattern for reactivity.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer(node: any) {
        const expr = node.expression
        if (!expr || expr.type !== 'CallExpression') return
        const callee = expr.callee
        if (!callee || callee.type !== 'Identifier') return

        const source = context.getSourceText()
        const start = node.start as number

        let i = start - 1
        while (i >= 0 && source[i] !== '<' && source[i] !== '>') i--
        if (i < 0 || source[i] !== '<') return

        const tagStart = i + 1
        let tagEnd = tagStart
        while (tagEnd < source.length && /[\w.]/.test(source[tagEnd] ?? '')) tagEnd++
        const tagName = source.slice(tagStart, tagEnd)

        if (!tagName || !isComponentTag(tagName)) return

        context.report({
          message: `Signal call in <${tagName}> prop — use props.x pattern inside the component for reactive access.`,
          span: getSpan(expr),
        })
      },
    }
    return callbacks
  },
}
