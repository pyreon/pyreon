import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `pyreon/init-fn-needs-idempotency` — flag an exported `init*()`
 * function that:
 *
 *   1. Has at least one `onMount(...)` call in its body (registers
 *      side effects on every invocation).
 *   2. Is ALSO called from another function in the same module
 *      (i.e. it's NOT a "call-once-from-entry" pattern — it's
 *      reentrant by construction).
 *   3. Lacks a module-level refcount / boolean guard variable.
 *
 * The conjunction of (1) + (2) + (3) is the exact bug shape behind
 * #734's `initTheme()` ThemeToggle pile-up. Pre-fix: `initTheme()`
 * was exported AND called from `ThemeToggle`'s render body — every
 * mounted ThemeToggle registered a fresh matchMedia listener +
 * effect, N components → N listeners.
 *
 * **Heuristic limits (deliberate):**
 *
 * - Cross-module analysis is NOT performed. If `initX` is exported
 *   and called only from another file, the rule doesn't fire (would
 *   need a full project scan; out of scope for a per-file lint).
 *   The same-module call requirement is conservative: false negatives
 *   on cross-module reentrancy are acceptable, false positives on
 *   legit one-shot inits would not be.
 *
 * - "Has a guard" is detected as ANY module-level `let`-declaration
 *   whose initializer is `0` / `false` / `null` / `undefined` —
 *   typical refcount / flag patterns. A more sophisticated guard
 *   shape (e.g. Map-keyed dedup) won't match, but the false negative
 *   is acceptable.
 */
export const initFnNeedsIdempotency: Rule = {
  meta: {
    id: 'pyreon/init-fn-needs-idempotency',
    category: 'lifecycle',
    description:
      'Flag exported `init*` functions called from the same module without a refcount / boolean guard — register effects N times if called from N component bodies.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    interface InitFnCandidate {
      node: any
      name: string
    }
    const candidates: InitFnCandidate[] = []
    const calledNames = new Set<string>()
    let hasModuleLevelGuard = false

    const callbacks: VisitorCallbacks = {
      Program(node: any) {
        // First pass: walk the program looking for export init* fns,
        // module-level guard variables, and call expressions.
        for (const stmt of node.body ?? []) {
          collectFromTopLevel(stmt)
        }

        if (!hasModuleLevelGuard) {
          for (const c of candidates) {
            if (calledNames.has(c.name)) {
              context.report({
                message:
                  `Exported \`${c.name}()\` calls \`onMount()\` and is invoked from this module — but no module-level refcount / boolean guard was found. If \`${c.name}\` is called from multiple component renders, each call registers a fresh listener/effect (N components → N listeners). Wrap the setup in a refcount-based guard (`
                  + `\`let _refCount = 0; … if (_refCount === 0) setup(); _refCount++\`).`,
                span: getSpan(c.node),
              })
            }
          }
        }
      },
    }

    function collectFromTopLevel(stmt: any): void {
      if (!stmt) return

      // 1. Identify an exported `init*` function declaration whose
      //    body contains `onMount(...)`.
      if (
        stmt.type === 'ExportNamedDeclaration'
        && stmt.declaration?.type === 'FunctionDeclaration'
      ) {
        const fn = stmt.declaration
        const name = fn.id?.name as string | undefined
        if (name && /^init[A-Z]/.test(name) && bodyContainsOnMount(fn.body)) {
          candidates.push({ node: fn, name })
        }
      }

      // 2. Detect module-level guard: `let X = 0|false|null|undefined`
      //    where X is plausibly a refcount / initialized flag.
      if (stmt.type === 'VariableDeclaration' && stmt.kind === 'let') {
        for (const d of stmt.declarations ?? []) {
          if (isPlausibleGuardInit(d.init)) {
            hasModuleLevelGuard = true
            break
          }
        }
      }

      // 3. Find any call expressions to init* names — both at top
      //    level AND nested inside other functions/expressions.
      collectCalls(stmt)
    }

    function bodyContainsOnMount(body: any): boolean {
      if (!body || typeof body !== 'object') return false
      if (
        body.type === 'CallExpression'
        && body.callee?.type === 'Identifier'
        && body.callee.name === 'onMount'
      ) {
        return true
      }
      for (const key in body) {
        if (key === 'parent' || key === 'loc' || key === 'range') continue
        const child = body[key]
        if (Array.isArray(child)) {
          for (const c of child) {
            if (bodyContainsOnMount(c)) return true
          }
        } else if (child && typeof child === 'object' && typeof child.type === 'string') {
          if (bodyContainsOnMount(child)) return true
        }
      }
      return false
    }

    function isPlausibleGuardInit(initNode: any): boolean {
      if (!initNode) return false
      if (initNode.type === 'Literal') {
        return initNode.value === 0 || initNode.value === false || initNode.value === null
      }
      if (initNode.type === 'NumericLiteral' && initNode.value === 0) return true
      if (initNode.type === 'BooleanLiteral' && initNode.value === false) return true
      if (initNode.type === 'NullLiteral') return true
      // `let x;` (no init) — possible flag declared later
      return false
    }

    function collectCalls(node: any): void {
      if (!node || typeof node !== 'object') return
      if (
        node.type === 'CallExpression'
        && node.callee?.type === 'Identifier'
      ) {
        const name = node.callee.name as string
        if (/^init[A-Z]/.test(name)) calledNames.add(name)
      }
      for (const key in node) {
        if (key === 'parent' || key === 'loc' || key === 'range') continue
        const child = node[key]
        if (Array.isArray(child)) {
          for (const c of child) collectCalls(c)
        } else if (child && typeof child === 'object' && typeof child.type === 'string') {
          collectCalls(child)
        }
      }
    }

    return callbacks
  },
}
