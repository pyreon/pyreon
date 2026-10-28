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

/**
 * Whether `body` awaits a FALLIBLE expression belonging to THIS function (`isFallible` says which awaited expressions
 * can fail — a plugin request). Like {@link bodyReturnsValue} the walk stops at a nested arrow: an `await` inside one
 * belongs to that arrow's own async scope, which gets its own wrap.
 *
 * Why it matters: on the web a rejected `await` ends the async function there and is reported as an unhandled
 * rejection. Natively the same failure must end the handler (Swift `try` inside a `do`), and must NOT escape the
 * Kotlin `launch` — an uncaught exception there crashes the app instead of being reported.
 */
export function bodyAwaitsFallible(body: unknown, isFallible: (e: ExprIR) => boolean): boolean {
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(walk)
    if (node === null || typeof node !== 'object') return false
    const n = node as { kind?: string; expr?: ExprIR }
    if (n.kind === 'arrow') return false
    if (n.kind === 'await' && n.expr !== undefined && isFallible(n.expr)) return true
    return Object.values(node).some(walk)
  }
  return walk(body)
}

/**
 * What an unhandled failure in an async handler does natively: report it the way the web reports an unhandled
 * rejection, and stop. Swift prints to the device log; Kotlin prints to `System.err` (logcat `W/System.err`),
 * re-throwing a cancellation so a disposed composition's coroutine still unwinds as cancelled.
 */
/**
 * The Swift concurrency `Task`, spelled through its module. An app's own model named `Task` — the first type a to-do
 * or project app declares — is a struct in the same module as the emit, and a bare `Task { … }` then resolves to ITS
 * initializer (`trailing closure passed to parameter of type 'any Decoder'`). The co-located runtimes already spell it
 * this way for the same reason.
 */
export const SWIFT_TASK = '_Concurrency.Task'

export const SWIFT_UNHANDLED_ASYNC = 'catch { print("[Pyreon] Unhandled error in an async handler: \\(error)") }'
export const KOTLIN_UNHANDLED_ASYNC =
  'catch (e: Throwable) { if (e is kotlin.coroutines.cancellation.CancellationException) throw e; System.err.println("[Pyreon] Unhandled error in an async handler: $e") }'

/** Indent every non-empty line of `text` by `by` more spaces (the `do { … }` wrap nests the body one level). */
export function indentLines(text: string, by: number): string {
  const pad = ' '.repeat(by)
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n')
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
