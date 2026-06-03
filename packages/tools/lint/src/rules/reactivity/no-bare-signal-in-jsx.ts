import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

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
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    // Optional path-based exemption (kept for consumer override flexibility).
    if (isPathExempt(context)) return {}

    // Only TEXT-position containers are reported. A `JSXExpressionContainer`
    // appears in two places: as a TEXT CHILD of an element/fragment
    // (`<div>{sig()}</div>` — the compiler does NOT re-wrap an already-called
    // signal here, so it's captured once → the real bug) and as an ATTRIBUTE
    // VALUE (`<input value={sig()}>` — the compiler `_rp()`/`_bind()`-wraps
    // signal reads in attribute position, so it IS reactive). oxc's walker
    // passes no parent, so we mark text-child containers when visiting their
    // owning element/fragment; anything not marked is an attribute value
    // (or otherwise not a text child) and is skipped. Nested JSX inside an
    // attribute (`prop={<div>{sig()}</div>}`) still reports its INNER text
    // container, because that container IS a child of the nested element.
    const textContainers = new WeakSet<object>()
    function markTextChildren(node: any): void {
      const children = node?.children
      if (!Array.isArray(children)) return
      for (const child of children) {
        if (child && child.type === 'JSXExpressionContainer') textContainers.add(child)
      }
    }

    const callbacks: VisitorCallbacks = {
      JSXElement(node: any) {
        markTextChildren(node)
      },
      JSXFragment(node: any) {
        markTextChildren(node)
      },
      JSXExpressionContainer(node: any) {
        if (!textContainers.has(node)) return // attribute value (or non-text) → reactive, skip
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
