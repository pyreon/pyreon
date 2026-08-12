/**
 * Bounded-concurrency map that preserves result order.
 *
 * The repo's tooling is full of loops that spawn one process per package and
 * wait: `npm view` per package (75 network round-trips), a gate per check, a
 * build per category. Those are latency-bound, not CPU-bound — measured, `npm
 * view` runs at 24-49% CPU and `npm publish --dry-run` at 4-21%, which is to
 * say they spend most of their wall time waiting. Running them one at a time
 * turns 75 round-trips into 75 round-trips of dead time.
 *
 * ## The concurrency-1 guarantee
 *
 * At `concurrency: 1` this executes tasks strictly one at a time, in order —
 * observably identical to a `for…of` with `await`. That is load-bearing, not a
 * happy accident: it lets a caller with an ordering constraint (a real `npm
 * publish` must go leaf-first, and each package's decision reads the results of
 * the ones before it) share ONE code path with a caller that has none (the same
 * publish under `--dry-run`, where nothing is uploaded and order is irrelevant).
 *
 * The alternative — a separate parallel path beside the sequential one — means
 * two implementations of the release loop that can drift apart, in the script
 * where drift is least affordable.
 *
 * Results come back in INPUT order regardless of completion order, so a caller
 * can build a deterministic summary without sorting.
 */

export interface RunPoolOptions {
  /**
   * Maximum tasks in flight. `1` means strictly sequential (see above).
   * Values below 1 are treated as 1 rather than deadlocking.
   */
  concurrency: number
}

/**
 * Run `task` over every item, at most `concurrency` at a time.
 *
 * A task that REJECTS rejects the whole call, matching what a `for…of` loop
 * would do — the caller decides whether to catch per item. Tasks already in
 * flight are not cancelled (there is no cancellation to hook into here); the
 * rejection simply wins.
 */
export async function runPool<T, R>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<R>,
  options: RunPoolOptions,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(options.concurrency))
  const results = new Array<R>(items.length)
  let next = 0

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await task(items[index]!, index)
    }
  }

  // Never spawn more workers than there is work — `Array.from({length: 0})` is
  // an empty pool, which would return before running anything.
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
