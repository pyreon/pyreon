/**
 * Gate-then-time driver shared by the scenarios that carry an explicit
 * pre-timing correctness gate (`scenario-maplist.ts`, `scenario-router.ts`).
 *
 * Phase 1 runs every op ONCE on its prepared state and checks the result (the
 * op's `after`, plus the batch probe before and after the op when it has a
 * batch twin). An op that fails is recorded in `suite.gateFailures` and is NOT
 * timed for this arm; `bench-scenarios.ts` prints it in place of a number.
 * Phase 2 times every op that passed, through `bench()`, which re-verifies
 * every iteration; a failure there aborts the arm, the suite's usual rule.
 */
import type { BenchOptions, BenchSuite } from '../runner'
import { bench } from '../runner'

export type BatchOptions = Required<Pick<BenchOptions, 'batchK' | 'batchProbe' | 'batchPreExpect' | 'batchExpect'>>

export interface GatedOp {
  name: string
  /** Untimed, once before the op's gate run and once before its timing. */
  prepare?: () => void | Promise<void>
  /** `bench()` reset: untimed per-op, inside the region in batch mode. */
  reset?: () => void | Promise<void>
  /** The timed op. */
  fn: () => void | Promise<void>
  /** Model update + DOM check after every iteration (untimed). */
  after: () => void
  /** Batch twin options, resolved after `prepare` (they may depend on its state). */
  batch?: () => BatchOptions
  /**
   * Starts an audit of a side effect `after` cannot see on the DOM (e.g. a
   * guard's call count); the returned function throws if it does not hold.
   * Runs around the gate run and around the whole timed op.
   */
  audit?: () => () => void
}

async function gateOne(container: HTMLElement, op: GatedOp, tag: string): Promise<void> {
  const finish = op.audit?.()
  await op.prepare?.()
  await op.reset?.()
  const b = op.batch?.()
  if (b && b.batchProbe(container) !== b.batchPreExpect) {
    throw new Error(`[${tag}] correctness gate failed — batch precondition probe is ${b.batchProbe(container)}, expected ${b.batchPreExpect}`)
  }
  await op.fn()
  op.after()
  if (b && b.batchProbe(container) !== b.batchExpect) {
    throw new Error(`[${tag}] correctness gate failed — batch probe after the op is ${b.batchProbe(container)}, expected ${b.batchExpect}`)
  }
  finish?.()
}

export async function gateThenTime(suite: BenchSuite, ops: readonly GatedOp[], tag: string): Promise<void> {
  const failed = new Set<string>()
  for (const op of ops) {
    try {
      await gateOne(suite.container, op, tag)
    } catch (err) {
      failed.add(op.name)
      ;(suite.gateFailures ??= []).push({ name: op.name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  for (const op of ops) {
    if (failed.has(op.name)) continue
    await op.prepare?.()
    const finish = op.audit?.()
    const options: BenchOptions = { verify: op.after, ...op.batch?.() }
    if (op.reset) options.reset = op.reset
    await bench(op.name, suite, op.fn, options)
    finish?.()
  }
}
