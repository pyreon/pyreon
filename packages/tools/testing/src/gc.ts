/**
 * GC / leak matchers — collapse the hand-rolled `new WeakRef` + two-pass
 * `globalThis.gc()` ceremony (and the "did the reactive graph accumulate
 * nodes?" leak check) into single calls.
 *
 * Require `--expose-gc` (so `globalThis.gc` exists). When it's absent they
 * throw a clear, actionable error rather than silently pass — a leak test
 * that no-ops is worse than no test. Wire it via the package vitest config's
 * `execArgv: ['--expose-gc']` (see @pyreon/testing's own config for the
 * reference).
 */
import { activateReactiveDevtools, getReactiveGraph } from '@pyreon/reactivity'

const hasGc = (): boolean => typeof (globalThis as { gc?: () => void }).gc === 'function'

async function collectGarbage(): Promise<void> {
  const gc = (globalThis as { gc?: () => void }).gc!
  // Two passes with a macrotask between — finalizing DOM-shaped object graphs
  // can need a second sweep after the first clears the retaining edges.
  gc()
  await new Promise((r) => setTimeout(r, 0))
  gc()
}

function requireGc(matcher: string): void {
  if (!hasGc()) {
    throw new Error(
      `[Pyreon] ${matcher} requires \`globalThis.gc\` — run the test suite with --expose-gc (add \`execArgv: ['--expose-gc']\` to the package's vitest config test.pool options).`,
    )
  }
}

/**
 * Assert the object produced by `factory` becomes garbage-collectable once the
 * test drops its reference. Collapses the WeakRef + two-pass-gc boilerplate.
 *
 * @example
 *   await expectGarbageCollected(() => makeRow(data))
 */
export async function expectGarbageCollected(factory: () => object): Promise<void> {
  requireGc('expectGarbageCollected')
  let obj: object | null = factory()
  const ref = new WeakRef(obj)
  obj = null
  await collectGarbage()
  if (ref.deref() !== undefined) {
    throw new Error(
      '[Pyreon] expected the value to be garbage-collected after dropping all references, but it is still retained (a leak — something outside the factory still holds it).',
    )
  }
}

/**
 * Assert that running `action` (typically a mount + unmount) leaves NO net
 * new nodes in the reactive graph after GC — i.e. the effects/computeds/
 * signals it created are disposed and collectable. Catches the
 * subscription-retention leak class the framework catalogs as anti-patterns.
 *
 * @example
 *   await expectNoReactiveLeak(() => { const { unmount } = render(<List/>); unmount() })
 */
export async function expectNoReactiveLeak(action: () => void | Promise<void>): Promise<void> {
  requireGc('expectNoReactiveLeak')
  activateReactiveDevtools()
  // GC first so the baseline doesn't include already-collectable stragglers.
  await collectGarbage()
  const baseline = getReactiveGraph().nodes.length
  await action()
  await collectGarbage()
  const after = getReactiveGraph().nodes.length
  if (after > baseline) {
    throw new Error(
      `[Pyreon] reactive-graph node count grew ${baseline} → ${after} after the action and stayed grown post-GC — a subscription / effect-scope leak (nodes created by the action were not disposed).`,
    )
  }
}
