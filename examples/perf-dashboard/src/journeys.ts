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
}
