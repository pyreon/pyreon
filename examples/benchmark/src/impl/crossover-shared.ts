/**
 * CROSSOVER suite — shared contracts (`?mode=crossover&framework=X&rows=N`).
 *
 * WHY THIS EXISTS. The main row-list suite is pinned at 1,000 rows, which is
 * exactly the size at which Pyreon and Octane tie on `select row` and
 * `partial update`. A tie at ONE size cannot distinguish two very different
 * claims:
 *
 *   (a) the two architectures cost the same, or
 *   (b) the two architectures have different SLOPES in list length and 1,000
 *       happens to be near their crossing point.
 *
 * `octane.tsrx`'s header states the architectural prediction for (b): a
 * `useState` write dirties the whole component, so every item body
 * re-evaluates and selection is O(n) by construction (~0.024µs/row measured on
 * an unclamped clock). Pyreon's `createSelector` and Solid's `createSelector`
 * are O(1) in list length. If that is right, the medians must diverge as N
 * grows and the tie is an artifact of the chosen N.
 *
 * This suite sweeps N so the SLOPE is measured rather than inferred. It is
 * deliberately ADDITIVE: it shares `runner.ts` (same warmup, same statistics,
 * same batch instrument) and touches none of the nine existing ops, so no
 * published baseline moves.
 *
 * WHAT IS MEASURED, and why each op is here:
 *
 *   - `select row`     — the hypothesis. One `selectedId` write; the rendered
 *                        DOM delta is 2 class attributes at EVERY N. Any
 *                        growth with N is architecture, not DOM work.
 *   - `partial update` — every 10th row's label. DOM delta grows as N/10 for
 *                        everyone, so both lines must slope; the question is
 *                        whether Octane's slope is steeper by the cost of
 *                        re-evaluating the other 9N/10 bodies.
 *   - `swap rows`      — the CONTROL. Both architectures do O(n) work here
 *                        (Octane re-evaluates every body; Pyreon/Solid run a
 *                        keyed reconcile over N keys), so BOTH lines should
 *                        slope. That is what makes it a control: it proves the
 *                        rig can resolve a slope in Pyreon, so a flat Pyreon
 *                        `select` line is a property of the framework and not
 *                        the instrument failing to see one.
 *
 * THE CLOCK. Chromium clamps `performance.now()` to 100µs on a non-isolated
 * page. Pyreon's `select` is under that floor at EVERY N in this sweep, so the
 * direct instrument can only ever report "0µs" for it — which is the clamp
 * announcing itself, not a measurement. Every op therefore runs on BOTH
 * instruments:
 *
 *   - DIRECT: one timed op, 20 samples. Valid only above the floor.
 *   - BATCH:  K cycles inside one timed region, reported per cycle. Valid at
 *             any speed, because K is chosen so the REGION is ~40ms — several
 *             hundred quanta — regardless of how fast one cycle is.
 *
 * Where both are valid they must AGREE; that agreement is what licenses
 * trusting the batch reading for the cells where direct is dark. Octane's
 * `select` is above the floor at N ≥ 5,000, so the sweep contains its own
 * cross-check rather than asking the reader to take the batch instrument on
 * faith.
 *
 * ONE CYCLE = TWO OPERATIONS. Every batch cycle here is `reset(); fn()`, and
 * each of these three ops is its own inverse in cost terms:
 *   - select:  deselect + select     = 2 selection changes
 *   - partial: restore + re-suffix   = 2 × (N/10) label writes
 *   - swap:    restore + swap        = 2 keyed reconciles
 * So the per-OPERATION figure is the reported per-cycle figure ÷ 2. The
 * orchestrator does that division and labels it; the raw per-cycle number is
 * kept in the JSON so the halving is auditable rather than buried.
 */

/** Row counts this suite is willing to run. Parsed from `?rows=N`. */
export const CROSSOVER_ROW_COUNTS = [100, 1_000, 5_000, 10_000, 20_000] as const

export const CROSSOVER_FRAMEWORKS = ['Pyreon', 'Octane', 'SolidJS'] as const

/**
 * Target wall-clock duration of ONE batch region, in ms.
 *
 * K is calibrated per (framework, op, N) to hit this, which is the property
 * that makes the batch instrument symmetric across arms: a fast arm and a slow
 * arm both end up with a region of the same size, hence the same dilution of
 * the 100µs quantum (~400×). Fixing K instead would leave the fast arm's region
 * quantization-dominated at exactly the sizes the hypothesis is about.
 *
 * The cost of per-arm K is that arms run different iteration counts, which
 * could in principle sit in different JIT/branch-prediction regimes. That is
 * precisely why the direct instrument is reported alongside: where both are
 * measurable they cross-check each other.
 */
export const BATCH_TARGET_MS = 40

/** Hard bounds on calibrated K. */
const K_MIN = 4
const K_MAX = 40_000

function numParam(name: string): number | null {
  const v = Number(new URL(location.href).searchParams.get(name))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Row count for this page, from `?rows=N`. Defaults to 1,000 (suite parity). */
export function crossoverRows(): number {
  const n = numParam('rows')
  return n ? Math.floor(n) : 1_000
}

/**
 * Region target for this page, from `?targetMs=N`.
 *
 * Exposed so the batch instrument's own soundness condition can be checked:
 * per-cycle cost must be INDEPENDENT of K. Sweeping `targetMs` sweeps K, and
 * if the per-cycle number moves with it, the batching is amortising something
 * the per-op path pays every iteration — a finding about the harness that has
 * to be resolved before any framework claim is made from it.
 */
export function crossoverTargetMs(): number {
  return numParam('targetMs') ?? BATCH_TARGET_MS
}

/**
 * Index of the row this suite selects and probes. The middle row, so the
 * measurement is not accidentally sampling a list end where a reconciler might
 * have a boundary fast path.
 */
export function midIndex(rows: number): number {
  return Math.floor(rows / 2)
}

/** Calibrated K values, published for the orchestrator to record per cell. */
export interface CrossoverMeta {
  framework: string
  rows: number
  targetMs: number
  k: Record<string, number>
}

export function publishMeta(meta: CrossoverMeta): void {
  ;(globalThis as { __crossoverMeta?: CrossoverMeta }).__crossoverMeta = meta
}

/**
 * Resolve the element whose children are the rendered rows, re-resolving if a
 * framework REPLACED the container's table rather than mutating it. Same
 * contract as `runner.ts`'s internal `makeParentGetter` — duplicated rather
 * than exported from there so this additive suite cannot change the behaviour
 * of the nine published ops by widening their module's surface.
 */
function makeParentGetter(container: HTMLElement): () => Element | null {
  const resolve = () =>
    container.querySelector('tbody') ?? container.querySelector('table') ?? container
  let cached: Element | null = resolve()
  return () => {
    if (!cached || !cached.isConnected) cached = resolve()
    return cached
  }
}

/**
 * Bind an O(1) probe to a container, re-resolving the row parent only when it
 * is actually replaced. Every probe below is one or two property reads plus a
 * short string test, identical work for every framework, so it cannot bias a
 * comparison — but it is inside the timed region, so it must stay O(1). In
 * particular it must never call `querySelectorAll`, which on a 20,000-row table
 * costs orders of magnitude more than the op being measured.
 */
function boundProbe(read: (parent: Element | null) => number) {
  let getParent: (() => Element | null) | null = null
  let boundTo: HTMLElement | null = null
  return (container: HTMLElement): number => {
    if (!getParent || boundTo !== container) {
      getParent = makeParentGetter(container)
      boundTo = container
    }
    return read(getParent())
  }
}

/** 1 iff the row at `index` currently carries the `selected` class. */
export function selectedAt(index: number) {
  return boundProbe((parent) => {
    const el = parent?.children[index]
    return el && el.className.includes('selected') ? 1 : 0
  })
}

/**
 * 1 iff row 0's label cell currently carries the partial-update suffix.
 *
 * Row 0 is chosen because `partial update` touches every 10th row starting at
 * 0, so it is always in the updated set at every N. A row COUNT probe would be
 * useless here — the count is identical before and after — which is the same
 * trap `selectedProbe` documents for selection.
 */
export function labelSuffixAt(rowIndex: number, suffix: string) {
  return boundProbe((parent) => {
    const cell = parent?.children[rowIndex]?.children[1]
    return cell && (cell.textContent ?? '').endsWith(suffix) ? 1 : 0
  })
}

/**
 * 1 iff the row at `index` renders `expectedId` in its id cell.
 *
 * The swap probe. A swap leaves the row count untouched, so — exactly as with
 * selection — a count probe would pass a batch in which no swap occurred. The
 * cycle is arranged as `restore-to-canonical` then `swap`, so the post-`fn()`
 * state is deterministic: index 1 must hold the id that canonically lives at
 * the far end of the list.
 */
export function idAt(index: number, expectedId: number) {
  const want = String(expectedId)
  return boundProbe((parent) => {
    const cell = parent?.children[index]?.children[0]
    return cell && cell.textContent === want ? 1 : 0
  })
}

/**
 * Choose K so that K cycles take about `targetMs`.
 *
 * Runs OUTSIDE any timed region. Warms first (a cold measurement picks a K that
 * is too large once the code tiers up, which would overshoot the region budget
 * by an order of magnitude at 20,000 rows), then times a small probe batch and
 * extrapolates linearly. Leaves the state in the post-`fn()` condition, which
 * the batch instrument's own pre-roll then normalises.
 */
export async function calibrateK(
  cycle: () => Promise<void>,
  targetMs: number,
): Promise<number> {
  for (let i = 0; i < 3; i++) await cycle()

  let probe = 2
  for (;;) {
    const t0 = performance.now()
    for (let i = 0; i < probe; i++) await cycle()
    const elapsed = performance.now() - t0
    // Below ~5 quanta the probe itself is quantization noise and would produce
    // a wild extrapolation — grow the probe until the reading is meaningful.
    if (elapsed >= 0.5 && probe <= K_MAX) {
      const perCycle = elapsed / probe
      const k = Math.round(targetMs / perCycle)
      return Math.max(K_MIN, Math.min(K_MAX, k))
    }
    if (probe >= K_MAX) return K_MAX
    probe *= 4
  }
}
