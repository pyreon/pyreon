/**
 * Shared wall-clock budget + descriptive request helpers for the integration
 * tests that boot a REAL Vite dev server.
 *
 * WHY THIS EXISTS
 * ---------------
 * `dev-proxy`, `dev-404-ssg`, `dev-404-i18n`, `dev-404-layoutless`,
 * `dev-404-redirect-loader` and `ssr` each boot a real `vite.createServer()`
 * in `beforeAll` and then make their FIRST dev-server request inside the first
 * `it(...)`. That first one is not a page render — it is the whole module
 * graph being transformed on demand (zero's virtual route module, every route
 * file, `@pyreon/{core,router,runtime-server,head,server}` from `src` via the
 * `bun` condition, plus the JSX transform for each). Under the parallel load
 * of `bun run --filter='*' test` (60+ packages) it was measured pushing past
 * vitest's 20s default.
 *
 * It arrives in TWO shapes, and each gets its own labelled wrapper — because
 * the message a stalled spec leaves behind has to name what actually stalled:
 *   - an HTTP request -> `devFetch`     (the dev-SSR / proxy / 404 files)
 *   - a module load   -> `devServerOp`  (`ssr.test.ts`'s `ssrLoadModule`, the
 *                                        operation that actually timed out
 *                                        there — reporting a URL would have
 *                                        been a lie)
 *
 * THE RULE THIS FOLLOWS
 * ---------------------
 * `.claude/rules/testing.md` — "Timeouts: the wall-clock backstop must exceed
 * the composed internal budgets". The failure mode being retired is NOT
 * "slow test"; it is the OPAQUE kill: vitest's wall clock fires first and
 * reports `Test timed out in 20000ms`, which names neither which request
 * stalled nor what it was asking for. Four escalations of `ws-relay.test.ts`
 * were argued from exactly that kind of contentless message.
 *
 * So there are two halves here and both are load-bearing:
 *   1. `devFetch` / `devServerOp` own an INTERNAL deadline and, when it
 *      fires, throw a message naming the label, what was being asked for, the
 *      elapsed ms and (optionally) a state snapshot. That is the artifact a
 *      CI-only failure leaves behind.
 *   2. `DEV_SERVER_TEST_TIMEOUT_MS` is the wall-clock backstop, DERIVED from
 *      the same `FIRST_RENDER_BUDGET_MS` so the two can never drift — the
 *      documented drift trap is "bump the budget, forget to re-derive the
 *      backstop", which left ws-relay's backstop EQUAL to its composed sum
 *      and the opaque-kill hazard live.
 *
 * Deliberately NOT `retry:`. A retry re-pays the first-request cost on an
 * already-contended machine and converts a diagnosable timeout into a flaky
 * green.
 */

/**
 * Ceiling for ONE dev-server request, and the single source of truth this
 * whole module derives from.
 *
 * This bounds the FIRST request specifically, because that is the one that
 * pays for the on-demand transform of the entire module graph; every later
 * request in the same file hits Vite's warm module cache and returns in
 * milliseconds. Sizing the ceiling off the *first* render means the later
 * ones are covered with enormous margin, which is the correct asymmetry.
 *
 * MEASURED, per file, one file at a time, `--reporter=verbose` (2026-09, this
 * worktree, with other work running concurrently on the same machine — i.e.
 * the contended shape, not an idle bench):
 *
 *   file                       first request   every later one
 *   -------------------------  --------------  ---------------
 *   dev-proxy                  4.0s / 13.0s    2-8ms
 *   dev-404-i18n               15.9s           2-5ms
 *   dev-404-layoutless         17.5s           2-120ms
 *   dev-404-ssg                24.8s           2-42ms
 *   ssr (ssrLoadModule)        >20s, KILLED    <5ms
 *   dev-404-redirect-loader    ~14s            ~10ms
 *
 * TWO of those are direct reproductions of the reported failure rather than
 * extrapolations: `dev-404-ssg`'s 24.8s exceeds vitest's 20s default on its
 * own, and `ssr.test.ts`'s `resolves virtual:zero/routes module` was OBSERVED
 * failing with `Test timed out in 20000ms` — in isolation, not merely under
 * parallel load. Both could only ever have been killed opaquely.
 *
 * The three-orders-of-magnitude asymmetry between the first dev-server
 * operation and every later one is the whole justification for sizing the
 * ceiling off the first.
 *
 * 60s local is ~2.4x the worst value observed here; CI gets 120s because that
 * runner is more contended still (60+ packages in parallel) and is where the
 * 20s default was originally outrun. Both are CEILINGS for a contended
 * machine, not expectations — they cost wall-clock only when something is
 * genuinely wedged, and then `devFetch` explains what stalled.
 */
export const FIRST_RENDER_BUDGET_MS = process.env.CI ? 120_000 : 60_000

/**
 * The most dev-server operations any single `it(...)` composes SEQUENTIALLY,
 * across all six files. An "operation" is one HTTP request (`devFetch`) or one
 * module load (`devServerOp`) — both pay the same on-demand transform, so both
 * count.
 *
 * COUNTED, not guessed. Every spec in `dev-proxy` (9), `dev-404-ssg` (8),
 * `dev-404-i18n` (4), `dev-404-layoutless` (3) and `dev-404-redirect-loader`
 * (2) composes exactly ONE. `ssr.test.ts`'s `SSR integration` sets the maximum
 * at TWO, in exactly two specs:
 *
 *   `returns 200 for known routes (not 404)`     GET /about, then GET /
 *   `renders route HTML server-side (not just    GET /,      then GET /users/42
 *    the SPA shell)`
 *
 * so the backstop is sized for those and covers all six files. Kept as an
 * explicit factor rather than folded away: a spec that later composes a THIRD
 * operation is then a one-line change here instead of a silent violation of
 * "the backstop must EXCEED the composed sum".
 *
 * (`serves API routes and returns JSON` also awaits three things, but two are
 * ordinary vitest `await import(...)` module resolution — not dev-server work.
 * One dev-server op, not three.)
 */
export const MAX_SEQUENTIAL_RENDERS = 2

/**
 * Headroom above the composed request budget, for everything a spec does that
 * is not a tracked request: vitest's own per-test bookkeeping, the response
 * body read (`res.text()` / `res.json()`) that happens outside `devFetch`,
 * and — for the hook timeout below — Vite dev-server spin-up and teardown.
 */
export const SETUP_TEARDOWN_HEADROOM_MS = 15_000

/**
 * The vitest wall-clock backstop, applied via
 * `describe(name, { timeout: DEV_SERVER_TEST_TIMEOUT_MS }, ...)`.
 *
 * DERIVED, never guessed, and strictly GREATER than the worst-case composed
 * internal budget (`MAX_SEQUENTIAL_RENDERS * FIRST_RENDER_BUDGET_MS`) by the
 * headroom term — so when a request genuinely stalls, `devFetch`'s descriptive
 * error wins the race against vitest's opaque one. Equal would not do: that is
 * precisely the bug the ws-relay fix found still live.
 *
 * `MAX_SEQUENTIAL_RENDERS` is 2 (set by two `ssr.test.ts` specs), so this is
 * two budgets plus headroom. The multiplication is not decoration — it is what
 * kept the invariant true when the count went from 1 to 2, and what will keep
 * it true at 3.
 */
export const DEV_SERVER_TEST_TIMEOUT_MS =
  MAX_SEQUENTIAL_RENDERS * FIRST_RENDER_BUDGET_MS + SETUP_TEARDOWN_HEADROOM_MS

/**
 * Timeout for the `beforeAll` that boots the dev server.
 *
 * This is a SEPARATE knob because a describe-level `timeout` option does not
 * govern hooks — vitest sizes hooks from `hookTimeout`, and in all six files
 * the `beforeAll` sits at MODULE level (outside the describe), where a
 * describe option cannot reach it at all. The hooks were left where they are
 * and given this explicit derived value instead of being moved inside the
 * describe: moving them would be a larger edit that still depends on
 * hook-vs-test timeout semantics, whereas an explicit argument is unambiguous
 * on any vitest version.
 *
 * Boot is the same ORDER of work as a first render (plugin `config` /
 * `configResolved` / `configureServer`, zero's fs-route scan, the dep-optimizer
 * scan) without the per-module transform, so one budget plus headroom is the
 * honest size — and it tracks `FIRST_RENDER_BUDGET_MS`, which the hard-coded
 * `30_000` it replaces did not.
 */
export const DEV_SERVER_BOOT_TIMEOUT_MS = FIRST_RENDER_BUDGET_MS + SETUP_TEARDOWN_HEADROOM_MS

/** Optional extras for {@link devFetch}. */
export interface DevFetchOptions extends RequestInit {
  /**
   * State snapshot for the failure message. Evaluated ONLY when the request
   * fails — the passing path must not pay for it — and wrapped in try/catch,
   * because a snapshot that throws while building the failure message replaces
   * a diagnosable timeout with an opaque one (the exact regression the
   * descriptive message exists to prevent).
   */
  observe?: () => string
}

const observed = (observe: (() => string) | undefined): string => {
  if (!observe) return ''
  try {
    return ` — observed: ${observe()}`
  } catch (err) {
    return ` — observed: <observe() threw: ${String(err)}>`
  }
}

/**
 * `fetch` against a dev server under test, with its own deadline and a failure
 * message that names WHICH request stalled.
 *
 * The deadline is an `AbortSignal.timeout` rather than a `Promise.race` with a
 * `setTimeout`: there is no timer handle to forget to clear, so the orphaned-
 * timer leak class (`pyreon/promise-race-needs-cleartimeout`, leak class I)
 * is structurally impossible here rather than merely avoided.
 *
 * A caller-supplied `signal` is composed with the deadline via
 * `AbortSignal.any`, so passing one narrows the deadline instead of replacing
 * it.
 *
 * @param url    absolute URL to request
 * @param label  what this request is FOR, in the failure message
 */
export async function devFetch(
  url: string,
  label: string,
  opts: DevFetchOptions = {},
): Promise<Response> {
  const { observe, signal, ...init } = opts
  const deadline = AbortSignal.timeout(FIRST_RENDER_BUDGET_MS)
  const started = performance.now()
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    })
  } catch (err) {
    const elapsed = Math.round(performance.now() - started)
    // `AbortSignal.timeout` aborts with a TimeoutError DOMException; undici
    // surfaces it as the fetch rejection's `cause`.
    const timedOut =
      deadline.aborted ||
      (err instanceof Error &&
        (err.name === 'TimeoutError' || (err.cause as Error | undefined)?.name === 'TimeoutError'))
    const what = timedOut
      ? `timed out after ${FIRST_RENDER_BUDGET_MS}ms`
      : `failed after ${elapsed}ms`
    throw new Error(
      `[Pyreon] dev-server request ${what} — ${label} (${init.method ?? 'GET'} ${url}); ` +
        `elapsed ${elapsed}ms of a ${FIRST_RENDER_BUDGET_MS}ms budget. ` +
        `The FIRST request to a Vite dev server transforms the whole module graph, so ` +
        `it is the one that pays; raise FIRST_RENDER_BUDGET_MS in dev-server-budget.ts ` +
        `(the describe backstop re-derives itself) if this is contention, not a hang.` +
        observed(observe),
      { cause: err },
    )
  }
}

/**
 * A dev-server operation that is NOT an HTTP request — `ssrLoadModule`,
 * `pluginContainer.resolveId` — under the same deadline and with the same
 * shape of failure message.
 *
 * This exists rather than routing such calls through `devFetch` because the
 * message has to name what actually stalled. `ssr.test.ts`'s failing spec is
 * `resolves virtual:zero/routes module`, and the operation that timed out is a
 * MODULE LOAD; reporting a URL for it would be a fabricated detail pointing
 * the next reader at the HTTP path.
 *
 * The deadline here is `Promise.race` + `setTimeout` rather than
 * `AbortSignal.timeout`, because `ssrLoadModule` takes no signal. Two
 * consequences, both deliberate:
 *
 *   - the timer is captured OUTSIDE the promise and cleared in `finally`, so
 *     the success path leaves nothing pending (memory-leak class I, and the
 *     `pyreon/promise-race-needs-cleartimeout` rule);
 *   - losing the race does NOT cancel `run()`. The transform keeps going and
 *     is torn down with the server in `afterAll`. That is the honest trade: we
 *     buy a diagnosable message, not cancellation — and the alternative is
 *     vitest's opaque kill, which cancels nothing either.
 *
 * Both branches of the race SETTLE rather than reject, so neither a losing
 * timer nor a late `run()` rejection can surface as an unhandled rejection
 * after the test has already moved on.
 */
export async function devServerOp<T>(
  label: string,
  run: () => Promise<T>,
  opts: { observe?: () => string } = {},
): Promise<T> {
  const started = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const outcome = await Promise.race([
      run().then(
        (value) => ({ kind: 'ok' as const, value }),
        (error: unknown) => ({ kind: 'err' as const, error }),
      ),
      new Promise<{ kind: 'timeout' }>((settle) => {
        timer = setTimeout(() => settle({ kind: 'timeout' }), FIRST_RENDER_BUDGET_MS)
      }),
    ])
    if (outcome.kind === 'ok') return outcome.value
    const elapsed = Math.round(performance.now() - started)
    const what =
      outcome.kind === 'timeout'
        ? `timed out after ${FIRST_RENDER_BUDGET_MS}ms`
        : `failed after ${elapsed}ms`
    throw new Error(
      `[Pyreon] dev-server operation ${what} — ${label}; ` +
        `elapsed ${elapsed}ms of a ${FIRST_RENDER_BUDGET_MS}ms budget. ` +
        `The FIRST dev-server operation transforms the whole module graph, so ` +
        `it is the one that pays; raise FIRST_RENDER_BUDGET_MS in ` +
        `dev-server-budget.ts (the describe backstop re-derives itself) if this ` +
        `is contention, not a hang.` +
        observed(opts.observe),
      outcome.kind === 'err' ? { cause: outcome.error } : undefined,
    )
  } finally {
    // Success path included — an uncleared timer is leak class I.
    clearTimeout(timer)
  }
}
