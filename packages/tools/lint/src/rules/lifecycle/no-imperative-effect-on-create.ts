import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Imperative APIs whose presence inside an `effect(() => { ... })`
 * callback signals that the effect is doing setup work that belongs
 * in `onMount` — not reactive signal tracking. Calls to these inside
 * an effect at component body level cause the work to run
 * synchronously during component setup, which is the bug shape #268
 * surfaced (per-instance effect allocation under load).
 *
 * The list is intentionally narrow: each entry is a pattern that
 * cannot be a pure reactive read. `fetch(...)` triggers IO,
 * `setTimeout(fn)` schedules a deferred callback, `addEventListener`
 * mutates a global. None of these track signals; using `effect()` to
 * run them per-instance is the bug.
 *
 * Do NOT add: signal reads (`.value`, `()`), `console.log`, `Math.X`,
 * `JSON.X` — those are the legitimate reactive-tracking uses of
 * `effect()`.
 */
const IMPERATIVE_GLOBAL_CALLS = new Set([
  'fetch',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'requestIdleCallback',
  'queueMicrotask',
])

const IMPERATIVE_MEMBER_METHODS = new Set([
  'addEventListener',
  'removeEventListener',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'getBoundingClientRect',
  'getComputedStyle',
  'focus',
  'blur',
  'scrollIntoView',
  'scrollTo',
  'scrollBy',
  'requestFullscreen',
  'play',
  'pause',
])

const IMPERATIVE_BROWSER_OBJECTS = new Set([
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
])

/**
 * Constructor names whose presence inside an `effect()` body signals
 * imperative API setup (observers, workers, network sockets) that
 * should run from `onMount` — not synchronously per-instance at
 * component setup time. Observer registration and socket allocation
 * are unambiguously imperative and never tracked as reactive reads.
 */
const IMPERATIVE_CONSTRUCTORS = new Set([
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
  'PerformanceObserver',
  'Worker',
  'SharedWorker',
  'WebSocket',
  'EventSource',
  'BroadcastChannel',
])

/**
 * Returns true when `node` is an immediately-invoked function
 * expression — i.e. a `CallExpression` whose callee is a function
 * literal: `(() => { ... })()` or `(function () { ... })()`. The body
 * runs synchronously at the call site, so for our purposes it should
 * be walked even though it's structurally a "nested function".
 *
 * Parenthesized callees (`(arrow)()`) come through as
 * `ParenthesizedExpression` wrapping the function — unwrap one level.
 */
function isIIFE(node: any): boolean {
  if (!node || node.type !== 'CallExpression') return false
  let callee = node.callee
  if (callee?.type === 'ParenthesizedExpression') callee = callee.expression
  return (
    callee?.type === 'ArrowFunctionExpression' || callee?.type === 'FunctionExpression'
  )
}

/**
 * Walk the effect callback body and look for imperative patterns.
 * Returns the first matching node + a short label describing what was
 * found, or null when the body is pure reactive tracking.
 *
 * Stops at nested function boundaries — code inside a nested function
 * (e.g. an event handler the effect attaches) is deferred-execution
 * and doesn't run synchronously at effect setup. The exception is
 * IIFE callees: those run at the call site, so we descend into them.
 */
function findImperativePattern(node: any, insideIIFE = false): { node: any; label: string } | null {
  if (!node || typeof node !== 'object') return null

  // Stop descent into nested functions — their bodies run later — UNLESS
  // we descended via an IIFE call (the inline-invoked function body
  // does run synchronously at the call site).
  if (
    !insideIIFE &&
    (node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration' ||
      node.type === 'ArrowFunctionExpression')
  ) {
    return null
  }

  // `await` keyword — signals async work in the effect body.
  if (node.type === 'AwaitExpression') {
    return { node, label: '`await` (async work)' }
  }

  // `new IntersectionObserver(...)` / `new Worker(...)` / etc.
  if (node.type === 'NewExpression') {
    const callee = node.callee
    if (callee?.type === 'Identifier' && IMPERATIVE_CONSTRUCTORS.has(callee.name)) {
      return { node, label: `\`new ${callee.name}(...)\`` }
    }
  }

  // `fetch(...)` / `setTimeout(...)` / etc.
  if (node.type === 'CallExpression') {
    const callee = node.callee
    if (callee?.type === 'Identifier' && IMPERATIVE_GLOBAL_CALLS.has(callee.name)) {
      return { node, label: `\`${callee.name}(...)\`` }
    }
    // Member calls like `el.addEventListener(...)`, `document.querySelector(...)`,
    // `localStorage.setItem(...)`, `.then(...)` (Promise chain).
    if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
      const method = callee.property.name
      if (IMPERATIVE_MEMBER_METHODS.has(method)) {
        return { node, label: `\`.${method}(...)\`` }
      }
      // `.then(...)` / `.catch(...)` — Promise consumption.
      if (method === 'then' || method === 'catch' || method === 'finally') {
        return { node, label: `\`.${method}(...)\` (Promise chain)` }
      }
      // localStorage.setItem / sessionStorage.getItem / etc.
      const obj = callee.object
      if (obj?.type === 'Identifier' && IMPERATIVE_BROWSER_OBJECTS.has(obj.name)) {
        return { node, label: `\`${obj.name}.${method}(...)\`` }
      }
    }

    // IIFE — descend into the function body even though it's a nested
    // function, because it runs synchronously here.
    if (isIIFE(node)) {
      let calleeFn = callee
      if (calleeFn?.type === 'ParenthesizedExpression') calleeFn = calleeFn.expression
      const body = calleeFn?.body
      if (body) {
        const found = findImperativePattern(body, true)
        if (found) return found
      }
    }
  }

  // `document.X` / `window.X` member READS that aren't part of a call —
  // e.g. `const el = document.body`, `window.location.href = '/x'`.
  if (
    node.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    IMPERATIVE_BROWSER_OBJECTS.has(node.object.name) &&
    // Skip when the member is `localStorage`/`sessionStorage` ON window —
    // those go through the call form below.
    node.property?.type === 'Identifier'
  ) {
    return { node, label: `\`${node.object.name}.${node.property.name}\`` }
  }

  // Recurse. After we've descended INTO an IIFE body, child nodes
  // shouldn't keep treating themselves as "inside an IIFE" forever —
  // we want the next nested function (a real handler) to bail. So
  // pass `false` to recursive calls: only the immediate IIFE-body
  // first-level walk gets `true`, then it resets.
  for (const key in node) {
    if (key === 'parent' || key === 'loc' || key === 'range' || key === 'type') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findImperativePattern(child, false)
        if (found) return found
      }
    } else if (value && typeof value === 'object') {
      const found = findImperativePattern(value, false)
      if (found) return found
    }
  }
  return null
}

/**
 * Safe wrapper names — `effect()` calls inside these don't fire
 * synchronously at component setup, so imperative work in their
 * callbacks is fine.
 *
 * `onMount` / `onUnmount` / `onCleanup` — explicit lifecycle hooks.
 * `renderEffect` — runs after mount, similar lifecycle.
 *
 * `effect` is intentionally NOT in this set — the rule's whole purpose
 * is to walk an effect's body. A nested effect inside another effect
 * is a separate problem (`no-nested-effect`), not this rule's concern.
 */
const SAFE_WRAPPER_NAMES = new Set(['onMount', 'onUnmount', 'onCleanup', 'renderEffect'])

export const noImperativeEffectOnCreate: Rule = {
  meta: {
    id: 'pyreon/no-imperative-effect-on-create',
    category: 'lifecycle',
    description:
      'Flag `effect()` calls at component body level whose callback does imperative work (DOM access, async/IO, addEventListener, setTimeout) — that work belongs in `onMount`, not in a per-instance reactive effect.',
    severity: 'warn',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    let safeWrapperDepth = 0

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee
        if (callee?.type === 'Identifier') {
          if (SAFE_WRAPPER_NAMES.has(callee.name)) {
            safeWrapperDepth++
          }
        }

        if (safeWrapperDepth > 0) return // already inside a safe wrapper
        if (!isCallTo(node, 'effect')) return

        const args = node.arguments
        if (!args || args.length === 0) return
        const fn = args[0]
        if (!fn) return

        let body: any = null
        if (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') {
          body = fn.body
        }
        if (!body) return

        // Walk the body for imperative patterns.
        const found = findImperativePattern(body)
        if (!found) return

        context.report({
          message:
            `\`effect()\` at component body level contains ${found.label} — imperative work belongs in \`onMount\`. Pyreon's \`effect()\` runs synchronously per instance during component setup; per-instance imperative work (DOM access, IO, scheduling) accumulates O(N) at mount under load (cf. PR #268). Wrap the imperative call in \`onMount(() => { ... })\` and keep \`effect()\` for pure signal-tracking subscriptions.`,
          span: getSpan(node),
        })
      },
      'CallExpression:exit'(node: any) {
        const callee = node.callee
        if (callee?.type === 'Identifier' && SAFE_WRAPPER_NAMES.has(callee.name)) {
          safeWrapperDepth--
        }
      },
    }
    return callbacks
  },
}
