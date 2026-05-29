import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/i18n` best-practice rule.
 *
 * `t('key')` returns a plain string — it cannot carry JSX. When a
 * translated string needs to interleave with markup (a `<a>` link, a
 * `<strong>` emphasis, an icon), authors often reach for
 * `<p>{t('intro')} <a href="...">{t('link')}</a></p>` and end up with
 * fragmented, untranslatable sentences (the translator never sees the
 * whole phrase). `@pyreon/i18n`'s `<Trans>` component is built exactly
 * for this: it keeps the sentence as ONE translation key and slots the
 * JSX children back in by index.
 *
 * Conservative, zero-false-positive shape: fires ONLY when a JSX
 * element contains BOTH (a) a `{t(...)}` expression-container child AND
 * (b) at least one real JSXElement child (rich content) in the SAME
 * element. A plain `<h1>{t('title')}</h1>` (no element siblings) never
 * fires — that's the correct use of `t()`. The whole decision is made
 * from the JSXElement node's own `children` array, so no `parent`
 * tracking is needed (oxc's walker doesn't pass `parent`).
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/i18n` (no noise, no config).
 */

function isTCall(node: any): boolean {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 't' &&
    Array.isArray(node.arguments) &&
    node.arguments.length >= 1
  )
}

export const i18nPreferTransForRichJsx: Rule = {
  meta: {
    id: 'pyreon/i18n-prefer-trans-for-rich-jsx',
    category: 'i18n',
    description:
      'In @pyreon/i18n projects, use <Trans> for translated text that interleaves with JSX elements instead of fragmenting it across multiple t() calls.',
    severity: 'info',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/i18n')) {
      return {}
    }

    const callbacks: VisitorCallbacks = {
      JSXElement(node: any) {
        const children = node.children
        if (!Array.isArray(children) || children.length < 2) return

        let tContainer: any = null
        let hasElementChild = false

        for (const child of children) {
          if (!child) continue
          if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
            hasElementChild = true
            continue
          }
          if (!tContainer && child.type === 'JSXExpressionContainer' && isTCall(child.expression)) {
            tContainer = child
          }
        }

        if (tContainer && hasElementChild) {
          context.report({
            message:
              'Translated text interleaved with JSX elements — replace the fragmented `{t(...)}` + element siblings with a single `<Trans>` component so the whole sentence stays one translation key.',
            span: getSpan(tContainer),
          })
        }
      },
    }
    return callbacks
  },
}
