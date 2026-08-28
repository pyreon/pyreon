import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * An async function that writes captured state after an `await`, with nothing
 * to tell a stale resolution from a fresh one — memory-leak class F.
 *
 * The shape: a refetch replaces the in-flight promise but nothing cancels the
 * old one's writes. A SLOW first request and a FAST second one resolve out of
 * order, so the stale response lands last and clobbers the newer data. It is
 * not a crash and not a leak you can see in a heap snapshot — the UI simply
 * shows the wrong answer, intermittently, under load.
 *
 * The catalog records the fix as a version counter: capture the generation
 * before the await, compare it after, and discard when it has moved. An
 * `AbortSignal` works too when you own the fetch.
 *
 * **Quiet unless it can see all three parts**, because "async function writes
 * state" describes an enormous amount of correct code:
 *
 *   1. an `await` — without one there is no interleaving to lose,
 *   2. a single-argument `.set()` / `.update()` on a binding CAPTURED from an
 *      outer scope — one argument is a signal write, two is `Map.set(k, v)`,
 *      where two resolutions write the same value for the same key and order
 *      cannot matter, and
 *   3. no staleness guard anywhere in the body — no abort signal, and no
 *      `version` / `generation` / `token` / `seq` / `latest` style variable.
 *
 * Opt-in: a single-shot load that can never race is a false positive, and this
 * rule cannot tell one from a refetch.
 */

const GUARD_HINT = /abort|cancel|version|generation|token|seq|epoch|stale|latest|current|signal/i

function collect(node: any, out: any[], type: string, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 14) return
  if (node.type === type) out.push(node)
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const v = (node as Record<string, unknown>)[key]
    if (Array.isArray(v)) {
      for (const x of v) collect(x, out, type, depth + 1)
    } else if (v && typeof v === 'object') collect(v, out, type, depth + 1)
  }
}

/** Identifier names DECLARED inside this function — params and locals. */
function localNames(fn: any): Set<string> {
  const out = new Set<string>()
  for (const p of fn.params ?? []) {
    if (p?.type === 'Identifier') out.add(String(p.name))
  }
  const decls: any[] = []
  collect(fn.body, decls, 'VariableDeclarator')
  for (const d of decls) if (d.id?.type === 'Identifier') out.add(String(d.id.name))
  return out
}

export const noUnguardedAsyncSignalWrite: Rule = {
  meta: {
    id: 'pyreon/no-unguarded-async-signal-write',
    category: 'reactivity',
    description:
      'An async function that writes captured signal state after an `await` with no staleness guard — a slow earlier response resolves last and clobbers newer data (leak class F).',
    severity: 'warn',
    optIn: true,
    // Application code only. A test or a bench awaits and writes constantly and
    // cannot race with itself — measured, that was 40 of the first 42 findings.
    appliesTo: ['shared', 'client', 'server'],
    fixable: false,
  },
  create(context) {
    const check = (fn: any): void => {
      if (!fn?.async) return
      const awaits: any[] = []
      collect(fn.body, awaits, 'AwaitExpression')
      if (awaits.length === 0) return

      const source = context.getSourceText?.() ?? ''
      const span = getSpan(fn)
      const body = source.slice(span.start, span.end)
      // A guard anywhere in the body is enough — the shapes vary far too much
      // to demand a particular one, and a false positive here is worse than a
      // miss.
      if (GUARD_HINT.test(body)) return

      const locals = localNames(fn)
      const calls: any[] = []
      collect(fn.body, calls, 'CallExpression')
      const firstAwaitEnd = Math.min(...awaits.map((a) => getSpan(a).end))

      for (const call of calls) {
        const callee = call.callee
        if (callee?.type !== 'MemberExpression') continue
        if (callee.property?.type !== 'Identifier') continue
        const method = String(callee.property.name)
        if (method !== 'set' && method !== 'update') continue
        // A signal write takes ONE argument; `Map.set(key, value)` takes two.
        // Without this the rule flagged the router's `componentCache.set(record,
        // comp)` — a Map keyed by identity, where two resolutions write the
        // same value for the same key and order cannot matter.
        if ((call.arguments ?? []).length !== 1) continue
        const obj = callee.object
        if (obj?.type !== 'Identifier') continue
        const name = String(obj.name)
        if (locals.has(name)) continue
        if (getSpan(call).start < firstAwaitEnd) continue

        context.report({
          message: `\`${name}.${method}()\` runs after an \`await\` on captured state, with nothing to tell a stale resolution from a fresh one. If this can be called again before it settles, a SLOW earlier call resolves last and overwrites the newer value — the UI shows the wrong answer, intermittently. Capture a version before the await and discard when it has moved, or forward an \`AbortSignal\`.`,
          span: getSpan(call),
        })
        return
      }
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    }
    return callbacks
  },
}
