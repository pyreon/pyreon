/**
 * Shared data + DOM contracts for the REACTIVE-GRAPH scenarios
 * (`?mode=scenarios&scenario=effects|memo`).
 *
 * One module so every framework consumes byte-identical inputs and is verified
 * against byte-identical expectations — the same anti-drift discipline as
 * `scenario-shared.ts` and `hydration-shared.ts`.
 *
 * ## Why these two, and why they are one family
 *
 * The suite measures a reactive graph's BREADTH of rendering (nine row-list
 * ops, dbmon, deep tree) but nothing about the graph's own behaviour. These are
 * two axes of a reactive graph, neither measured before:
 *
 *  - **effects** — BREADTH of subscription, and TEARDOWN. N independent
 *    side-effecting subscriptions firing, and then being disposed. Exercises
 *    the notify path, the batch drain, and the per-subscription teardown the
 *    suite's own record blames for its one lost row-list op.
 *  - **memo** — BLOCKING. A derived value that frequently evaluates to the same
 *    result. Downstream should do NOTHING when it does. This is the scenario
 *    where a framework that propagates unconditionally pays for it, and it is
 *    the complement of dbmon: dbmon showed that when EVERYTHING changes a
 *    signal graph has no structural advantage, so this asks what happens when
 *    nothing meaningfully does.
 *
 * Together they answer a question the row-list suite structurally cannot: when
 * the DOM work is held constant and near-zero, how much does the graph itself
 * cost?
 *
 * ## Fairness contract (read before editing any arm)
 *
 * Every framework runs ITS OWN documented model. This repo has retracted three
 * published multipliers that turned out to be our own competitor handicaps, so
 * the bar is: if a framework's docs prescribe a faster path for this shape, the
 * arm uses that path. Deviations are documented AT the arm with the reason.
 *
 * The effect/derivation BODIES are deliberately trivial and identical in every
 * arm — the measurement is dispatch, not the body. Any real work in the body
 * would be added equally to every framework and would only dilute the signal.
 */

// ─── Seeded RNG ──────────────────────────────────────────────────────────────
// Independent of runner.ts and scenario-shared.ts so these scenarios' data is
// identical regardless of what any other suite drew first.

function makeRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Scenario 1: effect-heavy list ───────────────────────────────────────────

/**
 * 500 rows, each an independent component owning ONE side-effecting
 * subscription over its own value.
 *
 * 500 rather than 1,000: `update all` must sit well clear of Chromium's 100µs
 * timer clamp without running so long that the driver's wall clock balloons. At
 * 500 the update-all region is ~0.9-1.8ms across the field, and `dispose` —
 * which does no layout — spans 15µs to 300µs, comfortably rankable.
 *
 * Every row is a real component in every framework — not a bare `effect()` in
 * a loop. React cannot express "an effect" outside a component, so a loop of
 * framework-level effects would be comparing N components against N raw
 * subscriptions. N components each owning one subscription is the shape all
 * seven can express faithfully.
 */
export const EFFECT_ROWS = 500

/**
 * Row index touched by the TARGETING GATE — mid-list, so a framework that scans
 * from either end gets no positional advantage.
 *
 * There is deliberately no `update one` TIMED op. A single targeted dispatch is
 * ~1µs, and any instrument that can observe it must force a layout, which on
 * this 500-element list costs ~750µs (the batch instrument forces two per
 * cycle). Measured, every arm reported ~1.5ms including the hand-written
 * Vanilla floor — floor == ceiling, i.e. the instrument measuring itself. The
 * question is answered by COUNTING subscription runs instead; see the gate in
 * `scenario-effects.ts`.
 */
export const EFFECT_TARGET_ROW = 250

/** Rotated value sets, so consecutive timed runs always apply DIFFERENT data
 * and nothing can be short-circuited as unchanged or hoisted as loop-invariant.
 * Mirrors the rotated-input contract in `bench-ssr.ts` and dbmon. */
export const EFFECT_SAMPLES = 8

/**
 * `EFFECT_SAMPLES` complete value sets for all `EFFECT_ROWS` rows, generated
 * once at module load from a fixed seed. Values are distinct across samples for
 * every row, so an update is always a real change.
 */
export const EFFECT_TICKS: number[][] = (() => {
  const rnd = makeRng(0x2f6b41d7)
  return Array.from({ length: EFFECT_SAMPLES }, (_, s) =>
    Array.from({ length: EFFECT_ROWS }, () => s * 1_000_000 + Math.floor(rnd() * 1_000_000)),
  )
})()

/**
 * The sink an arm's subscriptions write into.
 *
 * This is the load-bearing half of the scenario: the correctness gate asserts
 * the SUBSCRIPTION RAN by reading its output, not by reading rendered text. A
 * framework whose effects are still queued when the timer stops fails the run
 * instead of posting a fast number — which is exactly the failure mode
 * `useEffect`'s after-paint scheduling could otherwise produce.
 */
export interface EffectSink {
  /** Last value observed by row i's subscription. */
  values: number[]
  /** Total subscription invocations since the last `resetRuns()`. */
  runs: number
}

export function makeEffectSink(): EffectSink {
  return { values: new Array<number>(EFFECT_ROWS).fill(-1), runs: 0 }
}

/**
 * Assert every row's subscription observed the values just applied, AND that
 * the rendered DOM agrees.
 *
 * Both halves matter and neither implies the other: a framework could commit
 * the DOM while its effects are still queued (React's passive effects), or run
 * effects while a render is still pending. Checking one alone would let the
 * other slip.
 */
export function verifyEffectAll(
  container: HTMLElement,
  sink: EffectSink,
  applied: number[],
): void {
  const cells = container.querySelectorAll('.fx-row')
  if (cells.length !== EFFECT_ROWS) {
    throw new Error(`[effects] expected ${EFFECT_ROWS} rows, got ${cells.length}`)
  }
  for (let i = 0; i < EFFECT_ROWS; i++) {
    const want = applied[i] as number
    if (sink.values[i] !== want) {
      throw new Error(
        `[effects] row ${i} subscription: expected ${want}, got ${sink.values[i]} — ` +
          `the subscription had not run when the timer stopped, so the timing is not a ` +
          `measurement of it`,
      )
    }
    const text = (cells[i] as HTMLElement).textContent
    if (text !== String(want)) {
      throw new Error(`[effects] row ${i} DOM: expected "${want}", got "${text}"`)
    }
  }
}

/** Assert the single targeted row's subscription observed the new value. */
export function verifyEffectOne(container: HTMLElement, sink: EffectSink, want: number): void {
  if (sink.values[EFFECT_TARGET_ROW] !== want) {
    throw new Error(
      `[effects] row ${EFFECT_TARGET_ROW} subscription: expected ${want}, got ` +
        `${sink.values[EFFECT_TARGET_ROW]} — subscription had not run when the timer stopped`,
    )
  }
  const cell = container.querySelectorAll('.fx-row')[EFFECT_TARGET_ROW] as HTMLElement | undefined
  if (cell?.textContent !== String(want)) {
    throw new Error(`[effects] row ${EFFECT_TARGET_ROW} DOM: expected "${want}", got "${cell?.textContent}"`)
  }
}

/** Assert the list is fully unmounted (the `dispose` op's effect). */
export function verifyEffectDisposed(container: HTMLElement): void {
  const cells = container.querySelectorAll('.fx-row')
  if (cells.length !== 0) {
    throw new Error(`[effects] expected 0 rows after dispose, got ${cells.length}`)
  }
}

// ─── Scenario 2: memoization wall ────────────────────────────────────────────

/**
 * A source counter feeds a derived value that COLLAPSES it:
 * `bucket = floor(source / MEMO_BUCKET)`. `MEMO_BUCKET` consecutive source
 * values therefore map to the SAME bucket.
 *
 * `MEMO_CONSUMERS` components render the bucket. A source change that leaves
 * the bucket unchanged should cost ONE binding update (the source readout) and
 * nothing else; a change that crosses a bucket boundary must update all
 * `MEMO_CONSUMERS`.
 *
 * The gap between those two ops is what the wall is worth. The ABSOLUTE cost of
 * the blocked op is the finding: a framework whose derived value notifies
 * unconditionally pays the consumer fan-out on every source change, wall or no
 * wall.
 */
export const MEMO_BUCKET = 64
export const MEMO_CONSUMERS = 300

/**
 * Cycles per timed region. A blocked update should be near-free in a framework
 * that short-circuits, so it is far below the 100µs clamp — batching is the
 * only way to rank it. Passthrough uses the same K so the two ops are measured
 * by an identical instrument and their ratio is meaningful.
 */
export const MEMO_K = 200

/**
 * Base source value for the blocked cycle. Chosen mid-bucket so that both
 * `MEMO_BLOCKED_BASE` and `MEMO_BLOCKED_BASE + 1` fall in the same bucket.
 */
export const MEMO_BLOCKED_BASE = MEMO_BUCKET * 4 + 1
export const MEMO_BLOCKED_BUCKET = Math.floor(MEMO_BLOCKED_BASE / MEMO_BUCKET)

/**
 * Base source value for the passthrough cycle: the LAST value of a bucket, so
 * `+ 1` crosses the boundary and the derived value genuinely changes.
 */
export const MEMO_CROSS_BASE = MEMO_BUCKET * 6 - 1
export const MEMO_CROSS_FROM = Math.floor(MEMO_CROSS_BASE / MEMO_BUCKET)
export const MEMO_CROSS_TO = Math.floor((MEMO_CROSS_BASE + 1) / MEMO_BUCKET)

/**
 * Composite O(1) batch probe: `source * 1e6 + bucket`, both read from the DOM.
 *
 * A row COUNT cannot see this scenario at all, and either half alone is a hole:
 * probing only the bucket passes a cycle in which the source write never
 * happened (the bucket is unchanged either way — precisely the state the
 * blocked op is supposed to distinguish), and probing only the source passes a
 * cycle in which the wall silently leaked. Encoding both in one number lets the
 * batch machinery assert the whole precondition/postcondition pair.
 */
export function memoProbe(container: HTMLElement): number {
  const src = container.querySelector('.memo-source')
  const bucket = container.querySelector('.memo-bucket')
  const s = Number(src?.textContent)
  const b = Number(bucket?.textContent)
  if (!Number.isFinite(s) || !Number.isFinite(b)) return -1
  return s * 1_000_000 + b
}

/** Assert all `MEMO_CONSUMERS` render the expected bucket. */
export function verifyMemoConsumers(container: HTMLElement, bucket: number): void {
  const consumers = container.querySelectorAll('.memo-consumer')
  if (consumers.length !== MEMO_CONSUMERS) {
    throw new Error(`[memo] expected ${MEMO_CONSUMERS} consumers, got ${consumers.length}`)
  }
  for (let i = 0; i < consumers.length; i++) {
    const text = (consumers[i] as HTMLElement).textContent
    if (text !== String(bucket)) {
      throw new Error(
        `[memo] consumer ${i}: expected bucket "${bucket}", got "${text}" — the derived ` +
          `value did not reach every consumer before the timer ended`,
      )
    }
  }
}
