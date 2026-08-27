import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A `javascript:` URL in a URL-bearing attribute.
 *
 * This executes in the page's origin with full access to it, so it is a
 * script-injection sink wearing a link's clothing. There is no legitimate use
 * in a Pyreon app: an `<a>` that runs code should be a `<button>` with
 * `onClick`, which also gets keyboard and assistive-tech behaviour for free.
 *
 * Pyreon's runtime already refuses these at the URL-attribute guard, so this
 * rule is not the only line of defence — it moves the failure from a silently
 * dropped attribute at runtime to a named diagnostic at edit time, which is
 * where a developer can act on it.
 *
 * Zero false positives by construction: it reads only static string literals.
 * Leading whitespace and control characters are stripped before matching
 * because browsers do the same — `"  \tjavascript:alert(1)"` is a live
 * script URL, and a naive `startsWith('javascript:')` misses it.
 */

/** Attributes a browser resolves as a URL. */
const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'xlink:href',
  'poster',
  'data',
  'ping',
])

/** Protocols that execute rather than navigate. */
const EXECUTABLE = /^(?:javascript|vbscript):/i

/**
 * Normalize the way a browser does before protocol matching: strip leading
 * whitespace and C0 control characters, which are ignored in URLs and are the
 * standard way this check gets bypassed.
 */
function normalizeUrl(raw: string): string {
  // Matching C0 controls is the entire point: browsers strip them before
  // resolving the scheme, so `java\tscript:alert(1)` is a LIVE script URL that
  // a naive prefix check misses. Escaped rather than written as raw bytes,
  // which would be invisible in review.
  // oxlint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u0020]/g, '')
}

function literalString(value: any): string | null {
  if (!value) return null
  if (value.type === 'Literal' && typeof value.value === 'string') return value.value
  if (
    value.type === 'JSXExpressionContainer' &&
    value.expression?.type === 'Literal' &&
    typeof value.expression.value === 'string'
  ) {
    return value.expression.value
  }
  // A template literal with no substitutions is still fully static.
  const expr =
    value.type === 'JSXExpressionContainer' ? value.expression : value
  if (
    expr?.type === 'TemplateLiteral' &&
    (expr.expressions?.length ?? 0) === 0 &&
    expr.quasis?.length === 1
  ) {
    return expr.quasis[0]?.value?.cooked ?? null
  }
  return null
}

export const noScriptUrl: Rule = {
  meta: {
    id: 'pyreon/no-script-url',
    category: 'security',
    description:
      'Disallow `javascript:` / `vbscript:` URLs — they execute in the page origin. Use a `<button>` with `onClick` for an action.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier') return
        const attrName = String(node.name.name).toLowerCase()
        if (!URL_ATTRS.has(attrName)) return

        const raw = literalString(node.value)
        if (raw === null) return
        if (!EXECUTABLE.test(normalizeUrl(raw))) return

        context.report({
          message: `\`${attrName}\` uses a script URL, which executes in this page's origin rather than navigating. Use a \`<button onClick={…}>\` for an action — it also gets keyboard and screen-reader behaviour that an \`<a>\` running code does not.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
