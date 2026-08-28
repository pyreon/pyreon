import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `dangerouslySetInnerHTML={{ __html: <something that is not a literal> }}`.
 *
 * Pyreon's runtime assigns `__html` **raw**, by design — React parity, the
 * developer owns sanitization, and no `setSanitizer` policy applies to it.
 * (The sibling `innerHTML` prop IS sanitized; these are two different props
 * and only one of them is safe by default.) So an interpolated value here is
 * the single most direct XSS vector a Pyreon app has, and it is the one shape
 * neither this linter nor oxlint's default tiers caught.
 *
 * That gap was not hypothetical: this repo's own `.pyreonlintrc.json` carried
 * a `pyreon/dangerously-set-inner-html` entry — complete with an exemption
 * for the one file that legitimately uses it — for a rule that had never been
 * written. The intent was recorded; the rule was not.
 *
 * **Deliberately quiet on everything it cannot prove**, because a security
 * rule with false positives is a security rule people switch off:
 *
 *  - a string literal, or a template literal with no substitutions, is markup
 *    the author typed — nothing user-controlled can reach it;
 *  - a call that looks like sanitization (`sanitizeHtml(x)`,
 *    `DOMPurify.sanitize(x)`, `purify(x)`, `escapeHtml(x)`) is the documented
 *    correct shape;
 *  - an identifier is resolved against its `const` initializer in the same
 *    file first, so the idiomatic two-line form
 *    `const clean = sanitizeHtml(dirty)` … `__html: clean` is recognised.
 *
 * Opt-in: it is a judgement call about a prop that is legitimately used with
 * your own sanitizer, and there is no corpus in this repository to validate it
 * against (zero real uses), so it must not gate anyone's CI by default.
 */

/** Callee names that indicate the value has been sanitized. */
const SANITIZER = /(sanitiz|purif|escape|scrub|clean)/i

function calleeName(node: any): string | null {
  const c = node?.callee
  if (!c) return null
  if (c.type === 'Identifier') return String(c.name)
  // `DOMPurify.sanitize(x)` / `purifier.clean(x)` — the property is the verb.
  if (c.type === 'MemberExpression' && c.property?.type === 'Identifier') {
    return `${c.object?.type === 'Identifier' ? String(c.object.name) + '.' : ''}${String(c.property.name)}`
  }
  return null
}

/** A value the author typed, or one a sanitizer produced. */
function isProvablySafe(expr: any): boolean {
  if (!expr) return false
  if (expr.type === 'Literal' && typeof expr.value === 'string') return true
  // A template literal is only safe with NOTHING interpolated into it.
  if (expr.type === 'TemplateLiteral') return (expr.expressions ?? []).length === 0
  if (expr.type === 'CallExpression') {
    const name = calleeName(expr)
    return name !== null && SANITIZER.test(name)
  }
  // `x as string` / `(x)` — unwrap and re-test.
  if (expr.type === 'TSAsExpression' || expr.type === 'TSNonNullExpression') {
    return isProvablySafe(expr.expression)
  }
  return false
}

export const noUnsanitizedInnerHtml: Rule = {
  meta: {
    id: 'pyreon/no-unsanitized-inner-html',
    category: 'security',
    description:
      'Flag `dangerouslySetInnerHTML={{ __html: X }}` where X is not a literal and not the result of a sanitizer — Pyreon assigns `__html` raw, so an interpolated value is a direct XSS vector.',
    severity: 'warn',
    optIn: true,
    fixable: false,
  },
  create(context) {
    /** `const NAME = <init>` seen at any scope in this file. */
    const constInit = new Map<string, any>()

    const callbacks: VisitorCallbacks = {
      VariableDeclarator(node: any) {
        if (node?.id?.type === 'Identifier' && node.init) {
          constInit.set(String(node.id.name), node.init)
        }
      },
      JSXAttribute(node: any) {
        if (node?.name?.type !== 'JSXIdentifier') return
        if (String(node.name.name) !== 'dangerouslySetInnerHTML') return

        const value = node.value
        if (value?.type !== 'JSXExpressionContainer') return
        const obj = value.expression
        if (obj?.type !== 'ObjectExpression') return

        for (const prop of obj.properties ?? []) {
          if (prop.type !== 'Property') continue
          const key = prop.key
          const keyName =
            key?.type === 'Identifier'
              ? String(key.name)
              : key?.type === 'Literal'
                ? String(key.value)
                : null
          if (keyName !== '__html') continue

          // Follow same-file `const` bindings until something is provably
          // safe, or the chain ends. The idiomatic
          // `const clean = sanitizeHtml(dirty)` is two lines, and a rename in
          // between (`const body = clean`) is three — flagging either is the
          // false positive that gets a security rule switched off.
          //
          // Bounded, and cycle-guarded: `const a = b; const b = a` is not
          // valid TS but a linter must not hang on invalid input.
          let expr = prop.value
          const seen = new Set<string>()
          for (let hop = 0; hop < 4; hop++) {
            if (isProvablySafe(expr)) return
            if (expr?.type !== 'Identifier') break
            const name = String(expr.name)
            if (seen.has(name)) break
            seen.add(name)
            const init = constInit.get(name)
            if (!init) break
            expr = init
          }

          context.report({
            message:
              'Raw `dangerouslySetInnerHTML` — Pyreon assigns `__html` verbatim (no sanitizer applies to this prop), so any user-controlled part of this value executes in the page origin. Pass it through a sanitizer (`DOMPurify.sanitize(html)`), or use the sanitized `innerHTML` prop instead if the markup is simple.',
            span: getSpan(node),
          })
          return
        }
      },
    }
    return callbacks
  },
}
