// The re-run triggers of a lowered `effect(fn)`.
//
// On the web an effect tracks what it READ during its last run. Natively that tracking does not exist for a
// component's state (SwiftUI `@State` is not Observation-tracked; Compose snapshot reads are, but only inside
// composition), so the trigger set is read off the body statically: every reactive read the body can perform — a
// signal or computed read (`count()`), a store field (`app.store.n()`), a reactive container field
// (`ws.lastMessage()`), a prop (`props.x`). It is a SUPERSET of the web's last-run set: a signal read only in a branch
// that did not run still re-runs the effect when it changes. The body then re-evaluates its own conditions with
// current values, so a guarded effect does the same thing; only work done unconditionally before the guard can run
// more often than on the web. Both targets derive the set from this one function, so they agree with each other.
//
// What is NOT a trigger, as on the web: reads inside the returned cleanup closure, reads inside `untrack(…)`, and a
// signal's `.peek()`.
//
// Each emitter emits the candidates in its own spelling and keeps those that came out as a plain property path
// (`count`, `PyreonStore_app.shared.n`, `ws.lastMessage.value`): a zero-argument call that is still a CALL after
// lowering (`go()`, `UUID()`, `Date().timeIntervalSince1970`) is not a reactive read.

import { forEachExpr } from './expr-walk'
import type { ComponentIR, ExprIR, StatementIR } from './types'

/**
 * Expressions in `body` that may be reactive reads, in source order (duplicates included; the emitters dedupe).
 * `isReactiveName` says whether a bare name is reactive state of the component (`isComponentStateName`).
 */
export function effectReadCandidates(
  body: readonly StatementIR[],
  propsParam: string | undefined,
  isReactiveName: (name: string) => boolean,
): ExprIR[] {
  const excluded = new Set<ExprIR>()
  const exclude = (e: ExprIR): void => forEachExpr(e, (n) => excluded.add(n))
  const roots: ExprIR[] = []
  forEachBodyExpr(body, (e, returned) => {
    // The returned cleanup closure runs later, untracked.
    if (returned && e.kind === 'arrow') exclude(e)
    roots.push(e)
  })
  for (const root of roots) {
    forEachExpr(root, (n) => {
      if (n.kind !== 'call') return
      // `untrack(() => …)` reads without tracking.
      if (n.callee.kind === 'identifier' && n.callee.name === 'untrack') for (const a of n.args) exclude(a)
      // `sig.peek()` reads without tracking.
      if (n.args.length === 0 && n.callee.kind === 'member' && n.callee.property === 'peek') exclude(n)
      // A callee chain is not a read of its own: `app.store.n()` is the read, not `app.store`, and `props.onDone?.()`
      // is a call. Only the member links are skipped — a call inside the chain (`todos().filter(…)`) is still a read.
      let link: ExprIR = n.callee
      while (link.kind === 'member') {
        excluded.add(link)
        link = link.object
      }
    })
  }
  const out: ExprIR[] = []
  for (const root of roots) {
    forEachExpr(root, (n) => {
      if (excluded.has(n)) return
      // A zero-argument call of a bare name is a read only when the name is the component's own state — a helper
      // (`go()`) or a module-level store hook (`useApp()`) is a call.
      if (n.kind === 'call' && n.args.length === 0) {
        if (n.callee.kind !== 'identifier' || isReactiveName(n.callee.name)) out.push(n)
      }
      else if (
        propsParam !== undefined &&
        n.kind === 'member' &&
        n.object.kind === 'identifier' &&
        n.object.name === propsParam
      )
        out.push(n)
    })
  }
  return out
}

/**
 * The final trigger list from lowered candidates: plain property paths only, deduplicated, and without a path that
 * is a prefix of another (`useApp().store.n()` lowers its `useApp()` to the store object, which is the container of
 * the read, not a read).
 */
export function effectTriggerPaths(lowered: readonly string[]): string[] {
  const paths = [...new Set(lowered.filter(isPlainPropertyPath))]
  return paths.filter((p) => !paths.some((q) => q !== p && (q.startsWith(`${p}.`) || q.startsWith(`${p}?.`))))
}

/** A lowered expression that is a plain property path — a read, not a call. */
export function isPlainPropertyPath(code: string): boolean {
  return /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/.test(code)
}

/** Visit every top-level expression of `body`, with whether it is a `return` value. */
function forEachBodyExpr(body: readonly StatementIR[], visit: (e: ExprIR, returned: boolean) => void): void {
  for (const s of body) {
    switch (s.kind) {
      case 'let':
        visit(s.expr, false)
        break
      case 'assign':
        visit(s.target, false)
        visit(s.value, false)
        break
      case 'if':
        visit(s.cond, false)
        forEachBodyExpr(s.then, visit)
        if (s.elseBody) forEachBodyExpr(s.elseBody, visit)
        break
      case 'return':
        if (s.expr) visit(s.expr, true)
        break
      case 'expr':
        visit(s.expr, false)
        break
      case 'while':
      case 'do-while':
        visit(s.cond, false)
        forEachBodyExpr(s.body, visit)
        break
      case 'for-of':
        visit(s.iterable, false)
        forEachBodyExpr(s.body, visit)
        break
      case 'for-range':
        visit(s.from, false)
        visit(s.to, false)
        if (s.step) visit(s.step, false)
        forEachBodyExpr(s.body, visit)
        break
      case 'switch':
        visit(s.discriminant, false)
        for (const c of s.cases) {
          for (const t of c.tests) visit(t, false)
          forEachBodyExpr(c.body, visit)
        }
        break
      case 'throw':
        if (s.message) visit(s.message, false)
        break
      case 'try':
        forEachBodyExpr(s.body, visit)
        if (s.catchBody) forEachBodyExpr(s.catchBody, visit)
        if (s.finallyBody) forEachBodyExpr(s.finallyBody, visit)
        break
      default:
        break
    }
  }
}

/**
 * Whether `name` is a piece of the component's own state — a signal, a computed, a service or plugin binding
 * (`useOnline()`'s `online`, `useStorage`'s signal) — rather than a function the component declares or a module-level
 * hook (`useApp`), whose zero-argument CALL is not a read.
 */
export function isComponentStateName(c: ComponentIR, name: string): boolean {
  return c.decls.some((d) => d.kind !== 'function' && 'name' in d && (d as { name?: unknown }).name === name)
}
