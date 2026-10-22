// Lowering of a component-local `async` function (`const shoot = async () => { await … }`).
//
// `await` is only legal inside an async scope on both targets, and a plain `func`/`fun` has none: Swift rejects `await`
// in a non-async function, Kotlin rejects a suspend call outside a coroutine. An inline `async` HANDLER already gets
// `Task { … }` / `pyreonAsyncScope.launch { … }`; the named function gets the same wrap, so a handler that calls it
// stays an ordinary synchronous callback. That is fire-and-forget — which is all a function used as an event handler
// needs, and all a Promise-returning one cannot offer: a function that RETURNS A VALUE is a Promise the caller may
// `await`, and there is no equivalent here, so it is named in a warning instead of being silently mis-lowered.

import type { ExprIR, StatementIR } from './types'

/**
 * Whether `body` contains a `return <value>` belonging to THIS function. A `return` inside a nested arrow belongs to
 * that arrow (its own async-ness and its own result), so the walk does not descend into one.
 */
export function bodyReturnsValue(body: readonly StatementIR[]): boolean {
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(walk)
    if (node === null || typeof node !== 'object') return false
    const n = node as { kind?: string; expr?: unknown }
    if (n.kind === 'arrow') return false
    if (n.kind === 'return' && n.expr !== undefined) return true
    return Object.values(node).some(walk)
  }
  return walk(body)
}

/** The warning for an async function the fire-and-forget wrap cannot represent. */
export function asyncValueReturnWarning(name: string): string {
  return (
    `async function \`${name}\` returns a value — a Promise a caller may await — and native has no equivalent: the ` +
    `fire-and-forget \`Task\` / coroutine launch it would need drops the result. Have it write its result to a ` +
    `signal (\`result.set(value)\`) and read that, or keep the function behind a \`<Web>\` escape hatch.`
  )
}

export type { ExprIR }
