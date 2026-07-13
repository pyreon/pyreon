import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'

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
    // Callee resolution (two-pass). Collect the names bound to `signal()` /
    // `computed()` in this file; only report a `<Comp prop={x()}>` when `x` is
    // one of them. Without this the rule flagged ANY call to a bare identifier
    // in an uppercase-tag prop — `String(v)`, `t(key)` (i18n), `humanize(id)`,
    // `buildColumnRegistry(...)` — none of which are signals (the finding
    // measured 48/74 flags as non-signals). Reporting is deferred to
    // Program:exit so a signal declared anywhere in the file (before OR after
    // the JSX) is resolved.
    const signalBindings = new Set<string>()
    const candidates: Array<{ name: string; tagName: string; span: { start: number; end: number } }> =
      []

    const callbacks: VisitorCallbacks = {
      VariableDeclarator(node: any) {
        const init = node.init
        if (!init || !(isCallTo(init, 'signal') || isCallTo(init, 'computed'))) return
        if (node.id?.type === 'Identifier') signalBindings.add(node.id.name)
      },
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

        candidates.push({ name: callee.name, tagName, span: getSpan(expr) })
      },
      'Program:exit'() {
        for (const c of candidates) {
          if (!signalBindings.has(c.name)) continue // not a signal — the compiler's job / a pure call
          context.report({
            message: `Signal \`${c.name}()\` called in <${c.tagName}> prop — captured once at mount. Pass the accessor (\`${c.name}\`) and read \`props.x\` inside the component for reactive access.`,
            span: c.span,
          })
        }
      },
    }
    return callbacks
  },
}
