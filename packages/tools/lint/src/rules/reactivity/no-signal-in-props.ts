import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

const SIGNAL_NAMES = new Set([
  'signal', 'computed', 'useMode', 'useLocale', 'resolvedTheme',
  'isDark', 'isLight', 'isDarkSignal',
])

function looksLikeSignalCall(node: any): string | null {
  if (node.type !== 'CallExpression') return null
  const callee = node.callee
  if (callee?.type === 'Identifier' && SIGNAL_NAMES.has(callee.name)) return callee.name
  // member access: store.count()
  if (callee?.type === 'MemberExpression' && node.arguments?.length === 0) return null
  return null
}

function isComponentTag(name: string): boolean {
  return name[0] === name[0]?.toUpperCase() && name[0] !== name[0]?.toLowerCase()
}

/**
 * Warn when a signal is called in a component prop position.
 * Component props are static (evaluated once at mount). Signal reads
 * in this position capture the value once — they're not reactive.
 *
 * OK in DOM props: <div class={isDark()}> — compiler wraps reactively
 * BAD in component props: <Switch active={isDark()}> — static capture
 */
export const noSignalInProps: Rule = {
  meta: {
    id: 'pyreon/no-signal-in-props',
    category: 'reactivity',
    description:
      'Signal call in component prop is static — value is captured once at mount. Wrap in () => for reactivity.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer(node: any) {
        const expr = node.expression
        if (!expr) return

        const signalName = looksLikeSignalCall(expr)
        if (!signalName) return

        // Walk up to find the JSXAttribute and its parent JSXOpeningElement
        // The oxc visitor doesn't give us parent — check the source position
        // to determine if this is on a component or DOM element.
        // Use a heuristic: check the source text before this expression
        // for the tag name.
        const source = context.getSourceText()
        const start = node.start as number

        // Scan backwards to find the tag name: <TagName ...attr={expr}>
        let i = start - 1
        // Skip past the attribute name and =
        while (i >= 0 && source[i] !== '<' && source[i] !== '>') i--
        if (i < 0 || source[i] !== '<') return

        // Extract tag name
        const tagStart = i + 1
        let tagEnd = tagStart
        while (tagEnd < source.length && /[\w.]/.test(source[tagEnd] ?? '')) tagEnd++
        const tagName = source.slice(tagStart, tagEnd)

        if (!tagName || !isComponentTag(tagName)) return

        context.report({
          message: `Signal \`${signalName}()\` in <${tagName}> prop — value is captured once (static). Use \`() => ${signalName}()\` for reactivity.`,
          span: getSpan(expr),
        })
      },
    }
    return callbacks
  },
}
