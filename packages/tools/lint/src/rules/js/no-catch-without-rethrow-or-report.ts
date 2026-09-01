import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A `catch` that neither rethrows nor reports — the swallowed error.
 *
 * This repo's own catalog documents the shape repeatedly, and the reason it
 * keeps recurring is that a swallowed error is strictly worse than a crash:
 * the crash is a bug report, the swallow is a mystery. Two of the instances
 * already recorded are exactly this — a `require()` inside `try/catch` that
 * silently returned a fallback under Node, and a certificate reader whose
 * caught ReferenceError turned an 825-day expiry into 24 hours.
 *
 * What counts as handling it, deliberately broadly, because the rule should
 * not dictate a style: rethrowing, logging, calling an error callback,
 * assigning the error somewhere, or returning a value DERIVED from it. Only a
 * catch block that does none of those — including the empty one — is reported.
 *
 * `catch { /* intentional *\/ }` with a comment explaining why is a legitimate
 * answer to this rule; the point is that the decision becomes visible.
 */
const REPORTERS = /^(log|warn|error|report|capture|track|notify|emit|debug|info|trace)$/i

export const noCatchWithoutRethrowOrReport: Rule = {
  meta: {
    id: 'pyreon/no-catch-without-rethrow-or-report',
    category: 'js',
    description:
      'A catch block that neither rethrows nor reports turns a failure into a mystery — the crash is a bug report, the swallow is a support ticket six months later.',
    severity: 'warn',
    // Opt-in, on measured volume rather than principle: run over this repo it
    // reports 411 findings — 49 empty catches and 86 unhandled ones in
    // `core` + `fundamentals` alone. A good share are deliberate (an optional
    // operation whose failure genuinely does not matter), and the repo's own
    // ratchet rule is that a baseline never absorbs findings. So this ships
    // where volume is the consumer's decision: `best-practices`, or per-rule
    // config. The empty-catch half is the higher-confidence signal if you want
    // to start somewhere.
    optIn: true,
    fixable: false,
  },
  create(context) {
    /** Does this subtree do anything with the failure? */
    function handles(node: any, bound: string, depth = 0): boolean {
      if (!node || typeof node !== 'object' || depth > 10) return false

      if (node.type === 'ThrowStatement') return true

      if (node.type === 'CallExpression') {
        const c = node.callee
        if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') {
          if (REPORTERS.test(String(c.property.name))) return true
        }
        if (c?.type === 'Identifier' && REPORTERS.test(String(c.name))) return true
        // Passing the error anywhere counts — `onError(err)`, `reject(err)`.
        if (
          bound.length > 0 &&
          (node.arguments ?? []).some((a: any) => a?.type === 'Identifier' && String(a.name) === bound)
        ) {
          return true
        }
      }

      // `state.error = err` / `return mapError(err)` — the error is used.
      if (
        bound.length > 0 &&
        (node.type === 'AssignmentExpression' || node.type === 'ReturnStatement') &&
        mentionsBound(node, bound)
      ) {
        return true
      }

      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
        const v = (node as Record<string, unknown>)[k]
        if (Array.isArray(v)) {
          for (const c of v) if (handles(c, bound, depth + 1)) return true
        } else if (v && typeof v === 'object' && handles(v, bound, depth + 1)) return true
      }
      return false
    }

    function mentionsBound(node: any, bound: string, depth = 0): boolean {
      if (!node || typeof node !== 'object' || depth > 6) return false
      if (node.type === 'Identifier' && String(node.name) === bound) return true
      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
        const v = (node as Record<string, unknown>)[k]
        if (Array.isArray(v)) {
          for (const c of v) if (mentionsBound(c, bound, depth + 1)) return true
        } else if (v && typeof v === 'object' && mentionsBound(v, bound, depth + 1)) return true
      }
      return false
    }

    const callbacks: VisitorCallbacks = {
      CatchClause(node: any) {
        const bound = node?.param?.type === 'Identifier' ? String(node.param.name) : ''
        const body = node?.body
        const stmts = (body?.body ?? []) as any[]

        if (stmts.length > 0 && handles(body, bound)) return

        context.report({
          message:
            stmts.length === 0
              ? 'This catch block is empty, so the failure disappears entirely — no throw, no log, nothing. A crash is a bug report; a swallow is a support ticket six months later with no stack. Rethrow with `{ cause }`, log it, or keep the block empty WITH a comment saying why that is right here.'
              : 'This catch neither rethrows nor reports the error, so the failure becomes a mystery: execution continues on a fallback and nothing records what went wrong. Rethrow with `{ cause }`, hand it to an error callback, or log it — and if swallowing genuinely is correct, say so in a comment so the next reader knows it was a decision.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
