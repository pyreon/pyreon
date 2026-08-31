import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A `<script src>` with neither `defer` nor `async`.
 *
 * A classic script tag blocks the HTML parser at the point it appears: the
 * browser stops building the DOM, fetches, executes, and only then continues.
 * For a third-party script that means a domain you do not control sits on your
 * critical path, and its slowest day is your slowest day.
 *
 * `@pyreon/head`'s `ScriptTag` already defaults external scripts to `defer`,
 * so a hand-written tag is usually the one that got missed.
 *
 * An inline script (no `src`) does not block on the network and is not
 * reported. `type="module"` is deferred by specification, so it is fine as-is.
 */
export const noBlockingThirdPartyScript: Rule = {
  meta: {
    id: 'pyreon/no-blocking-third-party-script',
    category: 'web-perf',
    description:
      'A `<script src>` without `defer` or `async` blocks the HTML parser while a third-party domain you do not control is fetched and executed.',
    severity: 'warn',
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        if (node?.name?.type !== 'JSXIdentifier' || String(node.name.name) !== 'script') return
        const attrs = (node.attributes ?? []) as any[]
        if (attrs.some((a) => a?.type === 'JSXSpreadAttribute')) return

        const named = (n: string) =>
          attrs.find(
            (a) => a?.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && String(a.name.name) === n,
          )
        if (!named('src')) return // inline: no network block
        if (named('defer') || named('async')) return

        const type = named('type')
        const typeVal = type?.value?.type === 'Literal' ? String(type.value.value) : null
        if (typeVal === 'module') return // deferred by spec

        context.report({
          message:
            'This `<script src>` has neither `defer` nor `async`, so it stops the HTML parser where it sits: the browser fetches and executes before it builds any more DOM. For a third-party script that puts a domain you do not control on your critical path. Add `defer` (runs in order, after parsing) or `async` (runs whenever it lands) — or use `ScriptTag` from `@pyreon/head`, which defaults external scripts to `defer`.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
