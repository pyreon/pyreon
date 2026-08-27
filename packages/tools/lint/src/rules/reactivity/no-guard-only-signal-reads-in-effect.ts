import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Flags the provably-dead narrow shape of the "conditional reads hide
 * tracking" class (the general class is documented as too-high-FP for
 * static detection — `.claude/rules/anti-patterns.md` "Ternary
 * short-circuit hiding signal tracking"):
 *
 *   effect(() => {
 *     if (ref.current) {            // non-reactive guard (a ref/plain value)
 *       chart.setOption(props.option)   // the ONLY reactive read
 *     }
 *   })
 *
 * When EVERY reactive read in the effect body sits behind a conditional
 * whose own test is provably non-reactive, the first run can
 * short-circuit before ANY reactive read — the effect subscribes to
 * nothing and NEVER re-runs (the reporter's chart never rendered).
 *
 * PROVEN reactive reads (the only thing that can trigger a report):
 *   - zero-arg calls of same-file `const x = signal(...)/computed(...)`
 *     bindings (collected top-down, same discipline as
 *     `no-signal-call-write`), excluding loop-variable shadows
 *   - `props.X` member reads (compiler-emitted reactive props are
 *     getter-backed; `props` is the bare first-param convention)
 *
 * POSSIBLE reactive reads (can only SUPPRESS a report, never cause one):
 *   any other zero-arg call — `chart.instance()`, `getThing()` — might
 *   be a signal read the rule can't prove (a signal stored on an object,
 *   an imported signal). One at an UNCONDITIONAL position means the
 *   effect may well subscribe there, so the rule bails (real-corpus FP:
 *   `const inst = chart.instance(); if (!inst) return; …` — the guard
 *   local IS a signal read).
 *
 * Zero-false-positive doctrine — the rule does NOT fire when:
 *   - any proven reactive read is reachable unconditionally
 *   - any POSSIBLE reactive read sits at an unconditional position
 *   - any guarding conditional's own test contains a reactive read (the
 *     test itself subscribes)
 *   - an if/else or ternary has proven reads in BOTH branches (one
 *     always runs)
 *   - reads sit only inside a switch body or catch block (control flow
 *     too ambiguous — when unsure, don't fire)
 *   - reads sit inside a NESTED function (sync-invoked vs stored is
 *     unknowable, and callback params can shadow tracked names — any
 *     read-like content in a nested function bails the whole analysis)
 *   - loop bodies: treated at the INHERITED guardedness, not as guarded
 *     (a loop over a local array is usually non-empty — `for (const c
 *     of computeds) sum += c()` is a working effect, not a dead one)
 *   - the effect body contains NO proven reactive read at all
 *     (`effect(() => doStuff())` may read signals inside the callee)
 *   - reads sit only inside `untrack`/`onCleanup`/nested `effect`/
 *     `computed` callbacks (those don't subscribe THIS effect's first
 *     run, so they're excluded from the analysis entirely)
 *
 * Also covers the early-return spelling of the same bug
 * (`if (!ref.current) return; chart.setOption(props.option)`) — the
 * statements after a terminating non-reactive `if` are conditionally
 * executed ("enumerate the spellings" doctrine).
 *
 * oxc visitor callbacks get NO parent pointer, so the whole analysis is
 * a self-contained recursive walk of the `effect(...)` callback at the
 * CallExpression visit — no parent tracking needed.
 */

/** Callback-taking callees whose function args do NOT subscribe the
 * enclosing effect's first run — their function-valued arguments are
 * excluded from the analysis. */
const NON_SUBSCRIBING_CALLEES = new Set([
  'effect',
  'renderEffect',
  'computed',
  'untrack',
  'onCleanup',
  'onMount',
  'onUnmount',
])

function isFunctionNode(node: any): boolean {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  )
}

/** A statement that (as a direct child of a block) guarantees exit. */
function isTerminator(stmt: any): boolean {
  return stmt?.type === 'ReturnStatement' || stmt?.type === 'ThrowStatement'
}

/** `stmt` always exits when executed: a return/throw, or a block with a
 * top-level return/throw. */
function alwaysTerminates(node: any): boolean {
  if (!node) return false
  if (isTerminator(node)) return true
  if (node.type === 'BlockStatement') {
    return (node.body ?? []).some((s: any) => isTerminator(s))
  }
  return false
}

/** Collect identifier names bound by a declaration pattern (for-of/in
 * loop variables) so shadowed reads aren't misattributed to same-file
 * signal bindings. */
function patternNames(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'VariableDeclaration') {
    for (const d of node.declarations ?? []) patternNames(d.id, out)
    return out
  }
  if (node.type === 'Identifier') {
    out.push(node.name)
    return out
  }
  if (node.type === 'ObjectPattern') {
    for (const p of node.properties ?? []) {
      patternNames(p.value ?? p.argument, out)
    }
    return out
  }
  if (node.type === 'ArrayPattern') {
    for (const el of node.elements ?? []) patternNames(el, out)
    return out
  }
  if (node.type === 'AssignmentPattern') return patternNames(node.left, out)
  if (node.type === 'RestElement') return patternNames(node.argument, out)
  return out
}

export const noGuardOnlySignalReadsInEffect: Rule = {
  meta: {
    id: 'pyreon/no-guard-only-signal-reads-in-effect',
    category: 'reactivity',
    description:
      "Flag effects whose EVERY reactive read sits behind a non-reactive guard — the first run can short-circuit before any read, so the effect subscribes to nothing and never re-runs.",
    severity: 'info',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const bindings = new Set<string>()
    /** Names shadowed by loop variables during the current walk. */
    const shadowed = new Set<string>()

    const isSignalReadCall = (node: any): boolean =>
      node?.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      bindings.has(node.callee.name) &&
      !shadowed.has(node.callee.name) &&
      (!node.arguments || node.arguments.length === 0)

    const isPropsRead = (node: any): boolean =>
      node?.type === 'MemberExpression' &&
      !node.computed &&
      node.object?.type === 'Identifier' &&
      node.object.name === 'props'

    const isPeekCall = (node: any): boolean =>
      node?.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.property?.type === 'Identifier' &&
      node.callee.property.name === 'peek'

    /** Is this a call whose function args are excluded from analysis? */
    const isNonSubscribingCall = (node: any): boolean =>
      node?.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      NON_SUBSCRIBING_CALLEES.has(node.callee.name)

    /** A zero-arg call the rule can't classify — MIGHT be a signal read
     * (`chart.instance()`, an imported signal). `.peek()` is a known
     * NON-read. */
    const isPossibleRead = (node: any): boolean => {
      if (node?.type !== 'CallExpression') return false
      if (node.arguments && node.arguments.length > 0) return false
      if (isPeekCall(node)) return false
      if (isSignalReadCall(node)) return false
      if (isNonSubscribingCall(node)) return false
      const callee = node.callee
      return (
        callee?.type === 'Identifier' ||
        (callee?.type === 'MemberExpression' && !isPropsRead(callee))
      )
    }

    /** Pure scan: does the subtree contain proven / possible reactive
     * reads (ignoring guard structure, respecting the non-subscribing
     * skips)? */
    function scanReads(node: any, out: { proven: boolean; possible: boolean }): void {
      if (!node || typeof node !== 'object' || (out.proven && out.possible)) return
      if (Array.isArray(node)) {
        for (const child of node) scanReads(child, out)
        return
      }
      if (typeof node.type !== 'string') return
      if (isSignalReadCall(node) || isPropsRead(node)) {
        out.proven = true
        return
      }
      if (isPossibleRead(node)) {
        out.possible = true
        // Still scan the callee's object (`getA().b()` shapes).
      }
      if (isNonSubscribingCall(node)) {
        for (const a of node.arguments ?? []) {
          if (!isFunctionNode(a)) scanReads(a, out)
        }
        return
      }
      for (const key of Object.keys(node)) {
        // `parent` is excluded because an ESLint-shaped AST carries a parent
        // back-reference; following it climbs back up the tree and recurses
        // until the stack blows. This walk threads guardedness state, so it
        // keeps its own recursion rather than using `walkSubtree` — but it
        // must honour the same exclusion.
        if (key === 'type' || key === 'start' || key === 'end' || key === 'parent') continue
        scanReads(node[key], out)
      }
    }

    function subtreeReads(node: any): { proven: boolean; possible: boolean } {
      const out = { proven: false, possible: false }
      scanReads(node, out)
      return out
    }

    /** Analysis result flags for one effect body. */
    let sawUnguarded = false
    let sawGuarded = false

    const mark = (guarded: boolean) => {
      if (guarded) sawGuarded = true
      else sawUnguarded = true
    }

    /** Walk children generically at guardedness `g`. */
    function walkChildren(node: any, g: boolean): void {
      for (const key of Object.keys(node)) {
        // See the `parent` note in `scanReads` above.
        if (key === 'type' || key === 'start' || key === 'end' || key === 'parent') continue
        const value = node[key]
        if (Array.isArray(value)) {
          for (const child of value) walk(child, g)
        } else if (value && typeof value === 'object') {
          walk(value, g)
        }
      }
    }

    /** Recursive walk. `g === true` means "conditionally executed on the
     * first run" (behind a guard). */
    function walk(node: any, g: boolean): void {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const child of node) walk(child, g)
        return
      }
      if (typeof node.type !== 'string') return

      // Nested functions: sync-invoked vs stored is unknowable and their
      // params can shadow tracked names — any read-like content bails
      // the whole analysis (suppresses, never causes, a report).
      if (isFunctionNode(node)) {
        const reads = subtreeReads(node.body)
        if (reads.proven || reads.possible) sawUnguarded = true
        return
      }

      switch (node.type) {
        case 'CallExpression': {
          if (isSignalReadCall(node)) {
            mark(g)
            return
          }
          if (isNonSubscribingCall(node)) {
            // Function args don't subscribe this effect — skip them.
            for (const a of node.arguments ?? []) {
              if (!isFunctionNode(a)) walk(a, g)
            }
            return
          }
          if (isPeekCall(node)) {
            walk(node.callee.object, g)
            return
          }
          if (isPossibleRead(node)) {
            // A possible read only SUPPRESSES (never causes) a report,
            // and only when it sits at an unconditional position.
            if (!g) sawUnguarded = true
            walk(node.callee, g)
            return
          }
          walk(node.callee, g)
          for (const a of node.arguments ?? []) walk(a, g)
          return
        }
        case 'MemberExpression': {
          if (isPropsRead(node)) mark(g)
          walk(node.object, g)
          if (node.computed) walk(node.property, g)
          return
        }
        case 'IfStatement': {
          walk(node.test, g)
          // if/else with proven reads in BOTH branches: one branch
          // always runs, so a read is guaranteed — register at the
          // inherited level (conservative: prevents firing at top level).
          if (
            node.alternate &&
            subtreeReads(node.consequent).proven &&
            subtreeReads(node.alternate).proven
          ) {
            mark(g)
          }
          walk(node.consequent, true)
          walk(node.alternate, true)
          return
        }
        case 'ConditionalExpression': {
          walk(node.test, g)
          if (
            subtreeReads(node.consequent).proven &&
            subtreeReads(node.alternate).proven
          ) {
            mark(g)
          }
          walk(node.consequent, true)
          walk(node.alternate, true)
          return
        }
        case 'LogicalExpression': {
          // `a && b` / `a || b` / `a ?? b` — right side short-circuits.
          walk(node.left, g)
          walk(node.right, true)
          return
        }
        case 'SwitchStatement': {
          walk(node.discriminant, g)
          // Control flow through cases/defaults is ambiguous — when
          // unsure, don't fire: proven reads register at the inherited
          // level; possible reads suppress at an unguarded position.
          for (const c of node.cases ?? []) {
            const reads = subtreeReads(c)
            if (reads.proven) mark(g)
            if (reads.possible && !g) sawUnguarded = true
            if (reads.proven && (sawUnguarded || g)) break
          }
          return
        }
        case 'TryStatement': {
          walk(node.block, g)
          // catch runs only on throw — ambiguous; bail-conservative.
          if (node.handler) {
            const reads = subtreeReads(node.handler)
            if (reads.proven) mark(g)
            if (reads.possible && !g) sawUnguarded = true
          }
          walk(node.finalizer, g)
          return
        }
        // Loop BODIES stay at the INHERITED guardedness: a loop over a
        // local collection is usually non-empty, so treating its body as
        // "guarded" would fire on ordinary working effects (`for (const
        // c of computeds) sum += c()`). Conservative direction: a
        // top-level loop-body read counts as unconditional → no report.
        case 'WhileStatement': {
          walk(node.test, g)
          walk(node.body, g)
          return
        }
        case 'DoWhileStatement': {
          walk(node.body, g)
          walk(node.test, g)
          return
        }
        case 'ForStatement': {
          walk(node.init, g)
          walk(node.test, g)
          walk(node.body, g)
          walk(node.update, g)
          return
        }
        case 'ForOfStatement':
        case 'ForInStatement': {
          walk(node.right, g)
          // Loop variables shadow same-file bindings for the body walk.
          const names = patternNames(node.left).filter((n) => !shadowed.has(n))
          for (const n of names) shadowed.add(n)
          walk(node.body, g)
          for (const n of names) shadowed.delete(n)
          return
        }
        case 'BlockStatement': {
          let currentG = g
          for (const stmt of node.body ?? []) {
            walk(stmt, currentG)
            // Early-return guard: `if (nonReactive) return` makes every
            // following statement conditionally executed. (If the test
            // WAS reactive it already registered a read at `currentG`,
            // so flipping to guarded afterward cannot cause a false
            // fire.)
            if (
              stmt.type === 'IfStatement' &&
              !stmt.alternate &&
              alwaysTerminates(stmt.consequent)
            ) {
              currentG = true
            }
            if (isTerminator(stmt)) break
          }
          return
        }
        default:
          walkChildren(node, g)
      }
    }

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        if (node.kind !== 'const') return
        for (const decl of node.declarations ?? []) {
          if (decl?.type !== 'VariableDeclarator') continue
          if (decl.id?.type !== 'Identifier') continue
          const init = decl.init
          if (!init) continue
          if (!isCallTo(init, 'signal') && !isCallTo(init, 'computed')) continue
          bindings.add(decl.id.name)
        }
      },
      CallExpression(node: any) {
        if (!isCallTo(node, 'effect')) return
        const cb = node.arguments?.[0]
        if (
          !cb ||
          (cb.type !== 'ArrowFunctionExpression' &&
            cb.type !== 'FunctionExpression')
        ) {
          return
        }

        sawUnguarded = false
        sawGuarded = false
        shadowed.clear()
        walk(cb.body, false)

        if (sawGuarded && !sawUnguarded) {
          context.report({
            message:
              "this effect's first run can short-circuit before any reactive read — it subscribes to nothing and never re-runs; read the signals before the guard, or restructure (see reactivity-rules docs)",
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
