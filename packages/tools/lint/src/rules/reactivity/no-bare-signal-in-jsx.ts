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
      'STYLE-ONLY: prefer the explicit `{() => sig()}` accessor form over bare `{sig()}` in JSX text. NOT a correctness rule — the compiler lowers BOTH forms to the SAME reactive `_bindText(sig, node)` binding, so bare `{sig()}` is already fully reactive. Opt-in.',
    // Demoted from `error` to non-gating `info`: the premise that bare `{sig()}`
    // is "captured once / non-reactive" is FALSE on current compilers — it
    // compiles byte-identically to `{() => sig()}` — so it must not gate CI on
    // correct code, and the autofix (below) is removed because a rewrite is pure
    // churn (identical output).
    severity: 'info',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    // Optional path-based exemption (kept for consumer override flexibility).
    if (isPathExempt(context)) return {}

    // Only TEXT-position containers are reported (as a STYLE hint). A
    // `JSXExpressionContainer` appears in two places: as a TEXT CHILD of an
    // element/fragment (`<div>{sig()}</div>` — the compiler lowers this to a
    // reactive `_bindText(sig, node)`, IDENTICAL to `{() => sig()}`, so it is
    // already fully reactive) and as an ATTRIBUTE VALUE (`<input value={sig()}>`
    // — `_rp()`/`_bind()`-wrapped, also reactive). Neither form is a bug; this
    // rule is an opt-in stylistic preference only. oxc's walker
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
        // NO autofix: `{name()}` and `{() => name()}` compile to the identical
        // `_bindText(name, node)` binding, so a rewrite is pure churn. This is
        // an opt-in STYLE preference, not a reactivity fix.
        context.report({
          message: `Bare call \`${name}()\` in JSX text. Style preference: the explicit \`{() => ${name}()}\` form reads as "reactive" at a glance — but it is NOT required, both compile to the same reactive \`_bindText\` binding. (If \`${name}\` is a non-signal pure function, ignore this hint.)`,
          span,
        })
      },
    }
    return callbacks
  },
}
