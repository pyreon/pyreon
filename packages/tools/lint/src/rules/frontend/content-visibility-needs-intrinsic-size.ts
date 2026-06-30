import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend best-practice rule.
 *
 * `content-visibility: auto` tells the browser to skip rendering an
 * off-screen element and ESTIMATE its size. With no `contain-intrinsic-size`
 * the estimate is wrong, so when the element actually renders its height
 * corrects and shoves everything below it down — a Cumulative Layout Shift
 * (CLS). It is mobile-biased (narrow viewport ⇒ more content off-screen ⇒
 * more estimate→correct corrections) and invisible on fast desktop loads.
 *
 * The fix is `contain-intrinsic-size: auto <height>` next to the
 * `content-visibility: auto` so the box is reserved up front; the `auto`
 * keyword makes the browser remember the real size after first render, so
 * the exact value barely matters.
 *
 * Detected shapes (all the ways Pyreon code sets this property):
 *   1. Object literal — JSX `style={{ contentVisibility: 'auto' }}` and
 *      styler/rocketstyle `.theme(() => ({ contentVisibility: 'auto' }))`
 *      (unistyle camelCase). Fires when the SAME object has no
 *      `containIntrinsicSize` (or a `containIntrinsic*` longhand).
 *   2. CSS template literal — `` css`content-visibility: auto` `` /
 *      `` styled('div')`content-visibility: auto` ``. Fires when the
 *      template has no `contain-intrinsic-size`/longhand.
 *   3. String style attribute — `<div style="content-visibility: auto">`.
 *
 * Known limitation (deliberate, opt-in + warn so the bar is low): the
 * `contain-intrinsic-size` could be set on a DIFFERENT selector / object
 * that this one inherits from — the rule is per-object/per-template and
 * can't see across them, so that's a possible false positive. Exempt via
 * `exemptPaths` or an inline `// pyreon-lint-ignore` if you hit it.
 */

/** camelCase OR kebab → normalized lowercase-alnum key (`content-visibility`/`contentVisibility` → `contentvisibility`). */
function normalizeKey(prop: any): string | null {
  const key = prop.key
  if (!key) return null
  let raw: string | null = null
  if (key.type === 'Identifier') raw = key.name
  else if (key.type === 'Literal' || key.type === 'StringLiteral') {
    if (typeof key.value === 'string') raw = key.value
  }
  if (raw == null) return null
  return raw.toLowerCase().replace(/-/g, '')
}

/** The longhand + shorthand intrinsic-size keys, normalized (no dashes, lowercase). */
const INTRINSIC_KEYS = new Set([
  'containintrinsicsize',
  'containintrinsicwidth',
  'containintrinsicheight',
  'containintrinsicblocksize',
  'containintrinsicinlinesize',
])

/** A string-literal value whose trimmed text begins with `auto` (covers `auto` and `auto !important`). */
function isAutoStringValue(value: any): boolean {
  if (!value) return false
  if (value.type !== 'Literal' && value.type !== 'StringLiteral') return false
  return typeof value.value === 'string' && /^\s*auto\b/i.test(value.value)
}

/**
 * Linear, ReDoS-safe scan of a CSS text blob: true iff it declares
 * `content-visibility: auto` but no `contain-intrinsic-size` (or longhand).
 * Both regexes are anchored on a literal property name + `:` — no nested
 * quantifiers, so no catastrophic backtracking on hostile input.
 */
function cssTextNeedsIntrinsic(text: string): boolean {
  if (!/content-visibility\s*:\s*auto\b/i.test(text)) return false
  if (/contain-intrinsic-(?:size|width|height|block-size|inline-size)\s*:/i.test(text)) return false
  return true
}

const MESSAGE =
  '`content-visibility: auto` without `contain-intrinsic-size` causes layout shift (CLS): ' +
  'the browser estimates the off-screen box height, then corrects it on render, shoving ' +
  'content below it. Add `contain-intrinsic-size: auto <height>` ' +
  '(camelCase `containIntrinsicSize` in style/theme objects) to reserve the box.'

export const contentVisibilityNeedsIntrinsicSize: Rule = {
  meta: {
    id: 'pyreon/content-visibility-needs-intrinsic-size',
    category: 'frontend',
    description:
      'Require `contain-intrinsic-size` alongside `content-visibility: auto` to reserve layout space and avoid CLS.',
    severity: 'warn',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      // Shape 1 — object literals (JSX style object + styler/rocketstyle theme objects).
      ObjectExpression(node: any) {
        const props = node.properties ?? []
        let cvProp: any = null
        let hasIntrinsic = false
        for (const p of props) {
          if (p.type !== 'Property') continue
          const key = normalizeKey(p)
          if (!key) continue
          if (key === 'contentvisibility' && isAutoStringValue(p.value)) cvProp = p
          else if (INTRINSIC_KEYS.has(key)) hasIntrinsic = true
        }
        if (cvProp && !hasIntrinsic) {
          context.report({ message: MESSAGE, span: getSpan(cvProp) })
        }
      },

      // Shape 2 — CSS template literals (css`...` / styled('x')`...`).
      TemplateLiteral(node: any) {
        const text = (node.quasis ?? [])
          .map((q: any) => q.value?.cooked ?? q.value?.raw ?? '')
          .join(' ')
        if (cssTextNeedsIntrinsic(text)) {
          context.report({ message: MESSAGE, span: getSpan(node) })
        }
      },

      // Shape 3 — string style attribute (`<div style="content-visibility: auto">`).
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'style') return
        const value = node.value
        if (!value) return
        if (value.type !== 'Literal' && value.type !== 'StringLiteral') return
        if (typeof value.value === 'string' && cssTextNeedsIntrinsic(value.value)) {
          context.report({ message: MESSAGE, span: getSpan(node) })
        }
      },
    }
    return callbacks
  },
}
