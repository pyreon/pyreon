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

/**
 * Attributes a browser resolves as a URL, by LOCAL name.
 *
 * `xlink:href` is deliberately absent: it is matched by its local name
 * `href` (see `attrLocalName`). Listing the qualified form here was dead —
 * the lookup never sees one — which is exactly how the SVG vector hides.
 */
const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
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
  // `href="…"` — a bare string attribute.
  if (value.type === 'Literal' && typeof value.value === 'string') return value.value
  // Anything else static arrives inside `{…}`.
  if (value.type !== 'JSXExpressionContainer') return null
  const expr = value.expression
  if (expr?.type === 'Literal' && typeof expr.value === 'string') return expr.value
  // A template literal with no substitutions is still fully static.
  if (expr?.type === 'TemplateLiteral' && expr.expressions?.length === 0) {
    return expr.quasis?.[0]?.value?.cooked ?? null
  }
  return null
}

/**
 * The attribute's LOCAL name, lowercased — `href` for BOTH `href` and
 * `xlink:href`.
 *
 * SVG's `xlink:href` executes a script URL exactly like `href` does, and a
 * check keyed on the qualified name misses it. This repo's own catalog
 * records that same bug in the runtime sanitizer: *"the attribute URL-guard
 * keyed on `URL_ATTRS.has(attr.name)` MISSES SVG's `xlink:href` … guard on
 * `attr.localName === 'href'` too, or an `<a xlink:href="javascript:…">`
 * slips through."* Keying on the qualified name here would have repeated it.
 */
function attrLocalName(name: any): string | null {
  if (name?.type === 'JSXIdentifier') return String(name.name).toLowerCase()
  if (name?.type === 'JSXNamespacedName' && name.name?.type === 'JSXIdentifier') {
    return String(name.name.name).toLowerCase()
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
        const attrName = attrLocalName(node.name)
        if (attrName === null || !URL_ATTRS.has(attrName)) return

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
