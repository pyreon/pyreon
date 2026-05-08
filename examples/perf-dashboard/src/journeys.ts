/**
 * Journey catalog for scripts/perf/record.ts.
 *
 * Each journey is a named async function that takes a Playwright-ish `page`
 * handle (just `click` / `fill` / `evaluate` — typed loosely so the example
 * doesn't need a Playwright dep). The record script imports this module,
 * iterates the journeys, and captures counter snapshots around each run.
 *
 * Journeys should be short (< 2s each), deterministic (same interaction
 * every run), and read-only of state that would affect subsequent
 * journeys — this script runs them sequentially against the same page.
 */

export interface PageLike {
  click: (selector: string) => Promise<void>
  fill: (selector: string, value: string) => Promise<void>
  waitForSelector: (selector: string) => Promise<void>
  evaluate: <T>(fn: () => T) => Promise<T>
  reload: (opts?: { waitUntil?: string }) => Promise<unknown>
}

export const journeys: Record<string, (page: PageLike) => Promise<void>> = {
  /**
   * Baseline: reload the page and let the full boot happen under fresh
   * counters. Record loop resets counters before the journey runs, so the
   * reload-then-let-the-app-boot flow captures mount + first-paint work.
   */
  boot: async (page) => {
    await page.reload({ waitUntil: 'networkidle' })
    // Wait for the first paint to settle — the install() in main.tsx re-runs
    // after reload so the harness is live again by this point.
    await page.waitForSelector('[data-testid="toggle-theme"]')
  },

  /** Theme swap — stresses the dynamic-styled re-resolve path. */
  toggleTheme: async (page) => {
    await page.click('[data-testid="toggle-theme"]')
  },

  /** Theme-thrash — 10 toggles. */
  themeThrash: async (page) => {
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="toggle-theme"]')
    }
  },

  /** List shuffle — stresses mountFor LIS + keyed reorder. */
  shuffleRows: async (page) => {
    await page.click('[data-testid="shuffle-rows"]')
  },

  /** List regenerate — brand-new array, forces mount/unmount churn. */
  regenRows: async (page) => {
    await page.click('[data-testid="regen-rows"]')
  },

  /** Open + close modal — stresses runtime.mount / runtime.unmount. */
  modalCycle: async (page) => {
    await page.click('[data-testid="open-modal"]')
    await page.waitForSelector('[data-testid="modal-backdrop"]')
    await page.click('[data-testid="close-modal"]')
  },

  // ─── Canonical journeys (perf-record / perf-diff baselines) ───────────
  //
  // Three real-app-shape workloads — wins/regressions show up the way they
  // would in production, not just on synthetic microbenchmarks. Every
  // architectural experiment's PR runs all three and reports the delta.

  /**
   * **chat** — append-heavy list, ~1000 messages total.
   *
   * Resets the message log to 50, then appends 10 batches of 100 messages
   * incrementally (1050 total). Models a chat / live-feed shape: monotonic
   * append, no key reordering, mountFor takes the append-only fast path.
   * Stresses `runtime.mountFor.lisOps` (should stay 0 throughout).
   */
  chat: async (page) => {
    await page.click('[data-testid="chat-reset"]')
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="chat-append-100"]')
    }
  },

  /**
   * **dashboard** — 50 reactive widgets, 5s of churn.
   *
   * Starts a 100ms-tick interval that updates 5 random widget values per
   * tick (50 updates/sec). After 5s, ~250 widget updates have fired.
   * Stresses `signalWrite` + `effectRun` + `styler.resolve` cascades in
   * a real-app shape (live-data dashboard, observability panel).
   */
  dashboard: async (page) => {
    await page.click('[data-testid="dashboard-churn-start"]')
    await new Promise((r) => setTimeout(r, 5000))
    await page.click('[data-testid="dashboard-churn-stop"]')
  },

  /**
   * **form** — 30 fields, 60 keystrokes total, cross-field validation.
   *
   * Fills 28 plain fields + a password + confirm-password pair. Stresses
   * per-field `signalWrite` + `computedRecompute` for the `passwordsMatch`
   * derived signal.
   *
   * Each invocation rotates a module-level seed so the values differ from
   * run to run. Without this, Playwright's `page.fill` skips fills when
   * the new value matches the current one — runs 2..N would show 0
   * counter activity (only the first run does real work) and the median
   * would misleadingly be 0.
   */
  form: async (page) => {
    // Reset all field signals to their original defaults BEFORE filling.
    // Without this, Playwright's page.fill on runs 2..N sees values that
    // are still close to the previous fill, and even a value mismatch
    // somehow doesn't trigger Pyreon signal writes reliably (likely a
    // value-prop reactive-binding interaction). Direct signal reset via
    // a window helper makes the work-shape identical across N runs:
    // every field transitions default → vN, every run.
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dashboard?: { resetForm?: () => void }
      }
      w.__pyreon_perf_dashboard?.resetForm?.()
    })
    for (let i = 0; i < 28; i++) {
      await page.fill(`[data-testid="form-field-${i}"]`, `v${i}`)
    }
    await page.fill('[data-testid="form-password"]', 'secret')
    await page.fill('[data-testid="form-confirm-password"]', 'secret')
  },

  // ─── @pyreon/form 10k-field stress journeys (forms-stress benchmark) ────
  //
  // Five journeys exercising the @pyreon/form package at production-stress
  // scale (10,000 fields). Default page state has the FormStressSection
  // unmounted (scale=0); each journey flips the scale signal via the
  // window helper to drive deterministic mount / edit / state-read paths.
  //
  // Counter signature predicted by the audit:
  //   - formMount-10k        → ~60k form.fieldSignalCreate, ~10k form.fieldEffectCreate
  //   - formEditSingle-10k   → 1 reactivity.signalWrite, small const effectRun
  //   - formEditBatch-10k    → 100 signalWrite, proportional effectRun
  //   - formStateRead-10k    → 1 form.formStateScan, 10k form.formStateScan.fieldsRead
  //   - formStateReadSelector-10k → if narrows: ~3 fieldsRead. If not: 10k (confirms the bottleneck)

  /**
   * **formMount-10k** — mount cost of useForm with 10,000 field defs.
   *
   * Resets scale to 0 (unmount any existing FormAtScale), then sets to
   * 10000 (mount fresh). Counter reset in record.ts:170 happens BEFORE
   * the journey body, so this journey's snapshot captures BOTH paths
   * (the unmount + the mount). Run-to-run consistency: every run
   * unmounts whatever was there and mounts 10k → identical work shape
   * across all 5 runs → median is meaningful.
   */
  'formMount-10k': async (page) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { setScale: (n: number) => void } }
      ).__pyreon_perf_forms?.setScale(0)
    })
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { setScale: (n: number) => void } }
      ).__pyreon_perf_forms?.setScale(10000)
    })
    await page.waitForSelector('[data-testid="forms-stress-ready"]')
  },

  /**
   * **formEditSingle-10k** — single-field write in a 10k-field context.
   *
   * Ensures scale=10000 (no-op if already mounted from prior journey),
   * then writes ONE field. Per-field write cost should be O(1) regardless
   * of N — the audit's prediction. If `effectRun` scales with N here,
   * we have a per-field cascade leak.
   */
  'formEditSingle-10k': async (page) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { setScale: (n: number) => void } }
      ).__pyreon_perf_forms?.setScale(10000)
    })
    await page.waitForSelector('[data-testid="forms-stress-ready"]')
    // Write directly via the window helper to skip Playwright's locator
    // resolution + event dispatch. We're measuring the SIGNAL write path,
    // not Playwright's fill machinery.
    //
    // Use Date.now() so each run writes a UNIQUE value — without it, run
    // 2+ would short-circuit via `Object.is` (signal value unchanged from
    // prior run's persisted state) and counters would land at 0. The
    // rotating value forces every run to do the same work.
    await page.evaluate(() => {
      const stamp = String(Date.now())
      ;(
        window as unknown as {
          __pyreon_perf_forms?: { fillField: (name: string, value: string) => void }
        }
      ).__pyreon_perf_forms?.fillField('f0', stamp)
    })
  },

  /**
   * **formEditBatch-10k** — 100 field writes in a 10k-field context.
   *
   * Realistic partial-update shape (form-fill, paste-prefill, autosave-
   * dirtying). Should scale linearly with K (=100), NOT N (=10000). If
   * counter signature shows N-scaled work, there's an O(N) per-write
   * something hiding in the form pipeline.
   */
  'formEditBatch-10k': async (page) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { setScale: (n: number) => void } }
      ).__pyreon_perf_forms?.setScale(10000)
    })
    await page.waitForSelector('[data-testid="forms-stress-ready"]')
    await page.evaluate(() => {
      const hooks = (
        window as unknown as {
          __pyreon_perf_forms?: { fillField: (name: string, value: string) => void }
        }
      ).__pyreon_perf_forms
      if (!hooks) return
      // Use a stamp to force unique values across runs — see
      // formEditSingle-10k for the Object.is short-circuit reason.
      const stamp = Date.now()
      // Spread writes across the field range so the test exercises
      // hashing / map lookup variance — not just the same hot field.
      for (let i = 0; i < 100; i++) {
        const idx = Math.floor((i * 9973) % 10000) // pseudo-random spread, deterministic
        hooks.fillField(`f${idx}`, `batch-${stamp}-${i}`)
      }
    })
  },

  /**
   * **formStateRead-10k** — useFormState() WITHOUT selector, on a
   * 10k-field form.
   *
   * Single read fires `form.formStateScan` once. The smoking-gun counter
   * is `form.formStateScan.fieldsRead` — should equal 10000 because
   * useFormState's `buildSummary` always iterates every field, even on a
   * no-selector read. Pre-fix expectation: 10000. Post-PR-3 fix: should
   * drop dramatically (selector-narrowed) but no-selector read keeps
   * scanning — that's correct.
   */
  'formStateRead-10k': async (page) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { setScale: (n: number) => void } }
      ).__pyreon_perf_forms?.setScale(10000)
    })
    await page.waitForSelector('[data-testid="forms-stress-ready"]')
    // Force a fresh dirty/touched state each run so the atomic computed
    // memoization in PR 2 doesn't conflate "selector + memoized" with
    // "selector narrowing." Reset → write → read produces invalidation
    // each run; median represents "real-world: a state read AFTER a
    // field change" — the common UI pattern (input changes → submit
    // button re-evaluates `canSubmit`).
    await page.evaluate(() => {
      const hooks = (
        window as unknown as {
          __pyreon_perf_forms?: {
            resetField: (n: string) => void
            fillField: (n: string, v: string) => void
          }
        }
      ).__pyreon_perf_forms
      if (!hooks) return
      hooks.resetField('f0')
      hooks.fillField('f0', `read-${Date.now()}`)
    })
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { triggerStateRead: () => void } }
      ).__pyreon_perf_forms?.triggerStateRead()
    })
  },

  /**
   * **formStateReadSelector-10k** — useFormState(form, s => s.isValid)
   * on a 10k-field form.
   *
   * The selector touches only `isValid` — a properly-narrowed selector
   * should subscribe to ~1-3 signals (the `_invalidFieldCount` derived
   * signal in PR 4 candidate, or just `form.isValid()` today). Today's
   * implementation scans all 10k fields anyway (PR 3 candidate fix).
   * This journey is the regression-pin for the narrowing improvement —
   * post-PR-3 the `fieldsRead` counter should drop to ~3.
   */
  'formStateReadSelector-10k': async (page) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { setScale: (n: number) => void } }
      ).__pyreon_perf_forms?.setScale(10000)
    })
    await page.waitForSelector('[data-testid="forms-stress-ready"]')
    // Same reset → write → read pattern as formStateRead-10k for
    // honest measurement. Selector reads `s.isValid` only — should
    // touch zero atomic computeds (the win this PR delivers).
    await page.evaluate(() => {
      const hooks = (
        window as unknown as {
          __pyreon_perf_forms?: {
            resetField: (n: string) => void
            fillField: (n: string, v: string) => void
          }
        }
      ).__pyreon_perf_forms
      if (!hooks) return
      hooks.resetField('f0')
      hooks.fillField('f0', `selector-${Date.now()}`)
    })
    await page.evaluate(() => {
      ;(
        window as unknown as { __pyreon_perf_forms?: { triggerStateReadSelector: () => void } }
      ).__pyreon_perf_forms?.triggerStateReadSelector()
    })
  },

  // ─── @pyreon/store stress journeys ─────────────────────────────────────
  //
  // All journeys go through `window.__pyreon_perf_stores` exposed in
  // src/components/StoreStressSection.tsx. Pattern matches `form`:
  // window helper instead of `.click()` to avoid Playwright cost
  // dominating the counter signal.
  //
  // Each journey calls `clearAll()` first so re-runs against the same page
  // start from a clean slate. NOTE: registered plugins persist across
  // `clearAll` (no unregister API). The pluginScale journey uses idempotent
  // `registerPlugins` semantics so cycle 2..N is a no-op for plugin
  // registration — every cycle measures `pluginCount × storeCount` exactly.

  /**
   * **storeMount-1000** — mount 1k fresh stores.
   * Measures `store.defineStore` × 1000 + `store.pluginRun` × 1000 × P
   * (where P is the count of registered plugins, typically 0 in baseline).
   */
  'storeMount-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_stores?: {
          clearAll: () => void
          seedStores: (n: number) => void
        }
      }
      w.__pyreon_perf_stores?.clearAll()
      w.__pyreon_perf_stores?.seedStores(1000)
    })
  },

  /**
   * **storeAction-10k** — 10k action invocations across 10 stores, each with
   * 5 onAction listeners. Measures `store.actionCall` × 10k +
   * `store.actionListenerNotify` × 50k. The 5:1 ratio is the structural
   * number; divergence run-over-run = listener leak.
   */
  'storeAction-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_stores?: {
          clearAll: () => void
          seedStores: (n: number) => void
          actionLoop: (calls: number, listenersPerStore: number) => void
        }
      }
      w.__pyreon_perf_stores?.clearAll()
      w.__pyreon_perf_stores?.seedStores(10)
      w.__pyreon_perf_stores?.actionLoop(10000, 5)
    })
  },

  /**
   * **storeWrite-10k** — 1k `patch()` calls × 3 keys each across 10 stores.
   * Measures `store.patchKey` × 30k (1k patches × 3 keys × 10 stores). The
   * underlying batch should make the per-patch subscriber notify O(1).
   */
  'storeWrite-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_stores?: {
          clearAll: () => void
          seedStores: (n: number) => void
          patchLoop: (patchesPerStore: number, keysPerPatch: number) => void
        }
      }
      w.__pyreon_perf_stores?.clearAll()
      w.__pyreon_perf_stores?.seedStores(10)
      w.__pyreon_perf_stores?.patchLoop(1000, 3)
    })
  },

  /**
   * **storeSubscribeNotify-1k** — 100 stores × 10 subscribers each, then
   * 1 write per store. Measures `store.subscribeNotify` × 1000.
   * Tracks per-write fan-out cost.
   */
  'storeSubscribeNotify-1k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_stores?: {
          clearAll: () => void
          seedStores: (n: number) => void
          subscribeFan: (subscribersPerStore: number) => void
        }
      }
      w.__pyreon_perf_stores?.clearAll()
      w.__pyreon_perf_stores?.seedStores(100)
      w.__pyreon_perf_stores?.subscribeFan(10)
    })
  },

  /**
   * **storePluginScale-1000** — 1k stores under 5 registered plugins.
   * Measures `store.pluginRun` × 5000 (5 plugins × 1000 stores). The
   * audit flagged plugin chain as uncached — this journey isolates that
   * O(stores × plugins) cost cleanly. Likely target for the first
   * follow-up optimization PR.
   *
   * `registerPlugins` is idempotent (top-up to N), so cycle 2..N is a
   * no-op for plugin registration — every cycle measures exactly
   * `pluginCount × storeCount`.
   */
  'storePluginScale-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_stores?: {
          fullReset: () => void
          registerPlugins: (n: number) => void
          seedStores: (n: number) => void
        }
      }
      w.__pyreon_perf_stores?.fullReset()
      w.__pyreon_perf_stores?.registerPlugins(5)
      w.__pyreon_perf_stores?.seedStores(1000)
    })
  },

  // ─── @pyreon/rx stress journeys ────────────────────────────────────────
  //
  // All journeys go through `window.__pyreon_perf_rx` exposed in
  // src/components/RxStressSection.tsx. Pattern matches store/form:
  // window helper instead of `.click()` so the counter signal is clean.

  /**
   * **rxFilterMap-10k** — 10k-item array signal, then `rx.filter` + `rx.map`
   * chained as separate calls. Measures `rx.transform.signal: 2` +
   * 2 `reactivity.computedRecompute` calls. Compare to `rxPipe-10k`
   * to see the structural win of pipe.
   */
  'rxFilterMap-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_rx?: { filterMap: (n: number) => void }
      }
      w.__pyreon_perf_rx?.filterMap(10000)
    })
  },

  /**
   * **rxPipe-10k** — same shape as `rxFilterMap-10k` but composed via
   * `rx.pipe()`. Pipe collapses the entire chain into ONE computed →
   * `rx.pipe: 1`, `rx.transform.signal: 0` (pipe doesn't go through
   * `reactive()`). Counter signature proves the structural difference.
   */
  'rxPipe-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_rx?: { pipeChain: (n: number) => void }
      }
      w.__pyreon_perf_rx?.pipeChain(10000)
    })
  },

  /**
   * **rxSortBy-10k** — sortBy on 10k items. One transform allocation +
   * one computed recompute. Mostly stresses `reactivity.computedRecompute`
   * cost; rx-side counters are fixed at 1.
   */
  'rxSortBy-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_rx?: { sortBy: (n: number) => void }
      }
      w.__pyreon_perf_rx?.sortBy(10000)
    })
  },

  /**
   * **rxDebounceRapid-1k** — 1000 rapid signal writes through a 16ms
   * debounced signal. Measures `rx.debounce.create: 1` plus the
   * downstream debounce settling work. Awaits one debounce cycle so
   * the timer fires inside the journey body (not after the snapshot).
   */
  'rxDebounceRapid-1k': async (page) => {
    await page.evaluate(async () => {
      const w = window as unknown as {
        __pyreon_perf_rx?: { debounceRapid: (writes: number) => Promise<void> }
      }
      await w.__pyreon_perf_rx?.debounceRapid(1000)
    })
  },

  /**
   * **rxAggregate-10k** — 4 parallel aggregations (sum / count / min / max)
   * over a 10k array signal. Each aggregation allocates its own computed
   * (no shared computeds across calls). Measures `rx.transform.signal: 4`
   * plus 4 `reactivity.computedRecompute` calls.
   */
  'rxAggregate-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_rx?: { aggregate: (n: number) => void }
      }
      w.__pyreon_perf_rx?.aggregate(10000)
    })
  },

  // ─── @pyreon/query stress journeys (query foundation) ──────────────────
  //
  // Four journey shapes, each driven through window.__pyreon_perf_query.
  // The setup call mounts QueryAtScale (via signal-driven `<For>` in
  // QueryStressSection); the drive call runs the imperative loop AFTER
  // mount completes via `await page.waitForSelector(...)`.
  //
  // Counter signatures observed in baselines:
  //   - queryMount-1000          → 1000 query.useQuery + 2000 observerNotify
  //                                (initial subscribe pass × 2 — getCurrentResult + subscribe).
  //   - queryNotify-10k          → 10 useQuery + ≈10000 observerNotify (10 × 1000).
  //   - mutationInvalidate-1000  → 1 useMutation + 1000 × 5 = 5000 invalidate.
  //   - isFetchingScan-10k       → 1 useIsFetching + ≈20000 scan
  //                                (each setQueryData fires 2 cache events).
  //
  // queryReactiveKey-1000 is deferred — see the comment block on that
  // journey below.

  /**
   * **queryMount-1000** — mount 1000 useQuery hooks with distinct keys.
   * Pure mount-N baseline. The reset-and-re-set sequence forces a fresh
   * unmount + remount cycle so each run measures the same work shape.
   */
  'queryMount-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { clearAll: () => void; setMount: (n: number) => void }
      }
      w.__pyreon_perf_query?.clearAll()
    })
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { setMount: (n: number) => void }
      }
      w.__pyreon_perf_query?.setMount(1000)
    })
    await page.waitForSelector('[data-testid="query-stress-ready"][data-mode="mount"]')
  },

  /**
   * **queryNotify-10k** — 10 subscribers on the same key + 1000 cache
   * updates. Each setQueryData fires every observer's subscribe callback,
   * so the total notify count is 10 × 1000 = 10000. Reveals if the
   * 9-signal-set-per-notify fan-out is structurally O(N × subscribers).
   */
  'queryNotify-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { clearAll: () => void; setNotify: (n: number) => void }
      }
      w.__pyreon_perf_query?.clearAll()
      w.__pyreon_perf_query?.setNotify(10)
    })
    await page.waitForSelector('[data-testid="query-stress-ready"][data-mode="notify"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { notifyDrive: (events: number) => void }
      }
      w.__pyreon_perf_query?.notifyDrive(1000)
    })
  },

  /**
   * **queryReactiveKey-1000** — 100 useQuery hooks reading a shared reactive
   * `reactKey` signal in their queryKey closure, flipped 10 times → expected
   * 100 × 10 = 1000 setOptions runs.
   *
   * Originally deferred from PR #490: tight-loop signal writes weren't
   * propagating to subscribers under the real-app `<For>`-wrapped shape.
   * Root cause was the For-effect tracking signal reads during child
   * component setup — fixed by `mountFor` / `mountKeyedList` wrapping
   * their render work in `runUntracked` (mirrors mountReactive's pattern).
   * Regression test: `packages/core/runtime-dom/src/tests/fanout-repro.test.tsx`.
   */
  'queryReactiveKey-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { clearAll: () => void; setReactive: (n: number) => void }
      }
      w.__pyreon_perf_query?.clearAll()
      w.__pyreon_perf_query?.setReactive(100)
    })
    await page.waitForSelector('[data-testid="query-stress-ready"][data-mode="reactive"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { reactiveFlip: (flips: number) => void }
      }
      w.__pyreon_perf_query?.reactiveFlip(10)
    })
  },

  /**
   * **mutationInvalidate-1000** — 100 cached queries + 1 mutation with 5
   * invalidates, fired 1000 times. Each mutation runs its onSuccess
   * which invalidates 5 keys → 1000 × 5 = 5000 invalidate emissions.
   * Each invalidate also fans out to matching observers in the cache.
   */
  'mutationInvalidate-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { clearAll: () => void; setInvalidate: (n: number) => void }
      }
      w.__pyreon_perf_query?.clearAll()
      w.__pyreon_perf_query?.setInvalidate(100)
    })
    await page.waitForSelector('[data-testid="query-stress-ready"][data-mode="invalidate"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { invalidateDrive: (mutations: number) => void }
      }
      w.__pyreon_perf_query?.invalidateDrive(1000)
    })
  },

  /**
   * **isFetchingScan-10k** — 100 cached queries + useIsFetching + 10k
   * cache events. Each cache event triggers the queryCache.subscribe
   * channel, which fires useIsFetching's listener, which calls
   * `client.isFetching(filters)` to walk the cache → 10k full-cache
   * scans. Reveals how O(cacheSize) the global counter pattern is.
   */
  'isFetchingScan-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { clearAll: () => void; setScan: (n: number) => void }
      }
      w.__pyreon_perf_query?.clearAll()
      w.__pyreon_perf_query?.setScan(100)
    })
    await page.waitForSelector('[data-testid="query-stress-ready"][data-mode="scan"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_query?: { scanDrive: (events: number) => void }
      }
      w.__pyreon_perf_query?.scanDrive(10000)
    })
  },

  // ─── @pyreon/runtime-dom stress journeys (DOM rendering foundation) ────
  //
  // Five journeys exercising runtime-dom hot paths at production-stress
  // scale via window.__pyreon_perf_dom helpers. Each journey isolates a
  // counter signature so a regression bisects cleanly.
  //
  // Counter signatures predicted:
  //   - domMount-1000              → ≈1000 mountChild, applyProp ≈ N×1000,
  //                                  bindText proportional to reactive text
  //   - domShuffleLis-1000         → mountFor.lisOps non-zero (full reversal
  //                                  worst case for LIS at n=1000)
  //   - domAppend-10k              → mountFor.lisOps ≈ 0 (extend tier of the
  //                                  three-tier fast path), mountChild linear
  //   - domConditionalToggle-1000  → mountReactive ≈ 1000 + cleanup ≈ 4000
  //   - domEventAttach-1000        → applyEvent ≈ 1000, applyProp ≈ N×1000
  //                                  (decoupling proof — applyEvent is
  //                                  strict subset of applyProp)

  /**
   * **domMount-1000** — mount 1000 elements with mixed props (class, style,
   * data-*, reactive text). Pure mount-N baseline for the rendering layer.
   */
  'domMount-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { clearAll: () => void; setMount: (n: number) => void }
      }
      w.__pyreon_perf_dom?.clearAll()
      w.__pyreon_perf_dom?.setMount(1000)
    })
    await page.waitForSelector('[data-testid="dom-stress-ready"][data-mode="mount"]')
  },

  /**
   * **domShuffleLis-1000** — 1000 keyed items, then ONE arr.reverse() on the
   * items signal. Reversal degenerates LIS length to 1 → maximum probe count
   * for n=1000 (~5000+ binary-search probes). Pin the worst-case
   * mountFor.lisOps signal.
   */
  'domShuffleLis-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { clearAll: () => void; setShuffle: (n: number) => void }
      }
      w.__pyreon_perf_dom?.clearAll()
      w.__pyreon_perf_dom?.setShuffle(1000)
    })
    await page.waitForSelector('[data-testid="dom-stress-ready"][data-mode="shuffle"]')
    await page.evaluate(() => {
      const w = window as unknown as { __pyreon_perf_dom?: { shuffleDrive: () => void } }
      w.__pyreon_perf_dom?.shuffleDrive()
    })
  },

  /**
   * **domAppend-10k** — start at 0, then push 10 batches of 1000 items
   * monotonically. Three-tier fast path's "extend" tier — `mountFor.lisOps`
   * MUST stay 0. If it becomes non-zero, the append fast path regressed.
   */
  'domAppend-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { clearAll: () => void; setAppend: (start: number) => void }
      }
      w.__pyreon_perf_dom?.clearAll()
      w.__pyreon_perf_dom?.setAppend(0)
    })
    await page.waitForSelector('[data-testid="dom-stress-ready"][data-mode="append"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { appendDrive: (batches: number, perBatch: number) => void }
      }
      w.__pyreon_perf_dom?.appendDrive(10, 1000)
    })
  },

  /**
   * **domConditionalToggle-1000** — 1000 `<Show when={signal}>` items.
   * `toggleDrive(2)` flips ALL signals true→false→true→false (2 cycles ×
   * 2 directions). Counter signature: mountReactive ≈ 1000 at mount,
   * cleanup ≈ 4000 (off-cycles re-mount the subtree). Catches signal-driven
   * mount-churn regressions (the bug shape PR #505 fixed at root).
   */
  'domConditionalToggle-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { clearAll: () => void; setToggle: (n: number) => void }
      }
      w.__pyreon_perf_dom?.clearAll()
      w.__pyreon_perf_dom?.setToggle(1000)
    })
    await page.waitForSelector('[data-testid="dom-stress-ready"][data-mode="toggle"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { toggleDrive: (cycles: number) => void }
      }
      w.__pyreon_perf_dom?.toggleDrive(2)
    })
  },

  /**
   * **domEventAttach-1000** — 1000 buttons each with `onClick`. Counter
   * signature: applyEvent ≈ 1000 (subset of applyProp ≈ N×1000). Decoupling
   * test — proves applyProp counts ALL props (including events) and
   * applyEvent is a strict subset, not disjoint.
   */
  'domEventAttach-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_dom?: { clearAll: () => void; setEvents: (n: number) => void }
      }
      w.__pyreon_perf_dom?.clearAll()
      w.__pyreon_perf_dom?.setEvents(1000)
    })
    await page.waitForSelector('[data-testid="dom-stress-ready"][data-mode="events"]')
  },

  // ─── @pyreon/i18n perf-foundation journeys ─────────────────────────
  //
  // Four journeys exercising i18n's hot path. Each uses the
  // `__pyreon_perf_i18n` window helper to stage state deterministically;
  // the journey body is short and the COUNTERS are the measurement.
  //
  // Predicted counter signatures (per journey diff vs baseline):
  //
  //   - i18nT-1000           → ~1000 i18n.t, ~1000 i18n.lookupKey,
  //                            1000 i18n.interpolate (greeting has {{name}})
  //   - i18nT-interpolate-10k → 10000 i18n.t, 10000 i18n.lookupKey,
  //                             10000 i18n.interpolate
  //   - i18nT-localeFlip-100 → 100 (initial render) + 100×10 (re-runs after
  //                            10 flips) ≈ 1100 i18n.t, ≈10 reactivity.signalWrite
  //   - i18nT-plural-1000    → 1000 i18n.t, 1000 i18n.pluralResolve,
  //                            ~2000 i18n.lookupKey (plural-suffix probe + fallback path)

  /**
   * Render 1000 nodes each subscribing to t('greeting', {name: 'UserN'}).
   * Smoking-gun for "what does a localized list page cost on mount?"
   */
  'i18nT-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as { __pyreon_perf_i18n?: { reset: () => void } }
      w.__pyreon_perf_i18n?.reset()
    })
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_i18n?: { setRenderScale: (n: number) => void }
      }
      w.__pyreon_perf_i18n?.setRenderScale(1000)
    })
    await page.waitForSelector('[data-testid="i18n-item-999"]')
  },

  /**
   * 10k tight-loop t() calls with interpolation. Pure throughput shape;
   * the result strings are discarded — only the counters matter.
   *
   * If `i18n.interpolate` dominates wall-clock time vs `i18n.lookupKey`,
   * the regex per-call is the bottleneck (the data-driven trigger for a
   * follow-up parsed-template-cache PR).
   */
  'i18nT-interpolate-10k': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as { __pyreon_perf_i18n?: { reset: () => void } }
      w.__pyreon_perf_i18n?.reset()
    })
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_i18n?: { runInterpolate: (n: number) => void }
      }
      w.__pyreon_perf_i18n?.runInterpolate(10000)
    })
  },

  /**
   * 100 t-subscribers × 10 locale flips. Tests fan-out from the locale
   * signal — one signal write notifies N effects. Predicts roughly
   * 100 + 100×10 = 1100 t() calls and 10 reactivity.signalWrite.
   */
  'i18nT-localeFlip-100': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as { __pyreon_perf_i18n?: { reset: () => void } }
      w.__pyreon_perf_i18n?.reset()
    })
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_i18n?: { setRenderScale: (n: number) => void }
      }
      w.__pyreon_perf_i18n?.setRenderScale(100)
    })
    await page.waitForSelector('[data-testid="i18n-item-99"]')
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_i18n?: { flipLocale: () => void }
      }
      for (let i = 0; i < 10; i++) w.__pyreon_perf_i18n?.flipLocale()
    })
  },

  /**
   * 1000 t() calls with `count` value — exercises the plural path.
   * `i18n.pluralResolve` should equal 1000 (one allocation per call).
   */
  'i18nT-plural-1000': async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as { __pyreon_perf_i18n?: { reset: () => void } }
      w.__pyreon_perf_i18n?.reset()
    })
    await page.evaluate(() => {
      const w = window as unknown as {
        __pyreon_perf_i18n?: { runPlural: (n: number) => void }
      }
      w.__pyreon_perf_i18n?.runPlural(1000)
    })
  },
}
