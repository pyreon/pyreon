/**
 * The mount seam shared by the startup + memory benchmarks.
 *
 * ## Why this exists
 *
 * `bench-fair.ts` measures OPERATIONS on an already-mounted app, in ONE page
 * that bundles all eight frameworks and selects between them with
 * `?framework=X`. Neither of the metric families added here can be measured
 * that way:
 *
 *   - **startup** (script bootup / main-thread work / bytes) is dominated by
 *     parse+compile+evaluate of the bundle. A page carrying all eight
 *     frameworks reports the same number eight times.
 *   - **memory** (krausest `21/22/23/24/25/26`) is a whole-agent measurement,
 *     so any other framework resident in the page is counted against every
 *     framework.
 *
 * Both therefore need a PER-FRAMEWORK ISOLATED BUILD whose entry mounts one
 * framework's app and nothing else. `AppHandle` is the contract those entries
 * expose.
 *
 * ## The fairness rule this file enforces
 *
 * `mount<Framework>()` is extracted FROM the existing `bench-fair` impl and
 * `run<Framework>()` then calls it — so there is exactly ONE model per
 * framework and the startup/memory benches cannot silently drift onto a
 * different (faster or slower) shape than the one the op benchmarks use. That
 * matters here more than usual: this campaign has already had to retract
 * numbers produced by a competitor running a non-idiomatic model (Vue on a
 * deep `ref`, Svelte on deep `$state`). Those corrections live in the impls;
 * routing through the same mount is what makes them apply here too.
 *
 * The ONE documented exception is `vanilla.ts` — see the NOTE there.
 *
 * ## Method naming
 *
 * Named after the krausest control they stand in for, so the mapping to the
 * upstream benchmark definition is checkable:
 *
 *   `create(1000)`  = `#run`      `create(10000)` = `#runlots`
 *   `update()`      = `#update`   `clear()`       = `#clear`
 */

/**
 * The four operations krausest's memory benchmarks drive, plus teardown.
 *
 * Every method is async because the frameworks disagree on when a commit is
 * observable: Pyreon/Solid/Vanilla are synchronous, React/Octane use
 * `flushSync`, Svelte uses `flushSync()`, Vue awaits `nextTick()`, and Preact
 * batches onto a microtask. Awaiting uniformly means the harness never reads
 * memory (or the DOM) mid-commit for the frameworks that defer — which would
 * charge deferred work to whichever framework happened to defer it.
 */
export interface AppHandle {
  /**
   * Replace the entire list with `n` freshly-built rows.
   * krausest `#run` (n = 1000) / `#runlots` (n = 10000).
   */
  create(n: number): Promise<void>
  /**
   * Append `" !!!"` to the label of every 10th row. krausest `#update`.
   * Uses each impl's OWN partial-update path (per-row signal write for
   * Pyreon/Solid, immutable row rebuild for the `useState`-model entries) —
   * the same per-framework modelling the op bench documents.
   */
  update(): Promise<void>
  /** Empty the list. krausest `#clear`. */
  clear(): Promise<void>
  /** Tear the app down. Not a krausest step — harness cleanup only. */
  unmount(): void
}

/**
 * Wire an `AppHandle` to the page so the Playwright-driven memory harness can
 * drive it, and publish a readiness flag the harness waits on.
 *
 * `__benchReady` is set only AFTER the initial mount has committed, so the
 * `21_ready-memory` reading cannot race a framework that mounts
 * asynchronously (React and Octane publish their setters from a post-commit
 * `useEffect`; Preact from a microtask). Without it, "memory after page load"
 * would mean "after page load, plus however much of the mount happened to be
 * done" — different per framework, i.e. exactly the kind of cross-impl
 * inconsistency that produces a fake winner.
 */
export function publishApp(app: AppHandle): void {
  const g = globalThis as unknown as {
    __benchApp?: AppHandle
    __benchReady?: boolean
  }
  g.__benchApp = app
  g.__benchReady = true
}
