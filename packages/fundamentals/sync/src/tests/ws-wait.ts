// Shared timing helpers for the real-`ws` relay integration suites
// (`ws-relay.test.ts`, `server-hardening.test.ts`). Extracted verbatim from
// `ws-relay.test.ts` so every relay suite uses ONE budget + ONE backstop
// derivation — the recurring flake history of this package was a per-file budget
// drifting away from its backstop, and a second copy would reintroduce that.
import { WebSocket as WsClient } from 'ws'

// `ws`'s client implements the browser WebSocket interface; cast to the DOM ctor
// type for the transport's `WebSocketImpl` option and for the raw garbage senders.
export const WSImpl = WsClient as unknown as new (url: string) => WebSocket

// NOTE (#2380): `two clients converge over the relay` was escalated FOUR times
// (8→15→20→30s) as a CI-load timeout flake. It was never slowness — it was a real
// LOST UPDATE. `syncedSignal`'s create-if-missing seed used to write `initial`
// into the CRDT BEFORE the transport synced; two fresh peers both seeded, and a
// seed still causally concurrent with a peer's real `.set()` clobbered it on a
// RANDOM-clientId `Y.Map` tie-break (~coin-flip; worse under contention, where the
// concurrent window is wider). No budget can wait out a value that already
// converged to the wrong one. The fix DEFERS the seed until first sync, so a fresh
// peer's default never races a real value — see `seed-deferral.test.ts` for the
// deterministic CRDT-level proof. The specs below now gate the real write on the
// transport's new `synced` barrier (not just `connected`), the correct point at
// which app-level writes are safe.
//
// The budget is a localhost-round-trip ceiling (no lost-update to wait out —
// #2385 deferred the create-if-missing seed and killed that root cause). It
// feeds BOTH the `waitFor` default AND the derived wall-clock backstop from ONE
// constant, and the tick-counted deadline below is KEPT (independent rationale:
// it self-extends under event-loop starvation from `Coverage (Full)` v8
// instrumentation).
//
// Why 30s on CI and not 10s. #2385 lowered this to 10s as a consequence of
// fixing the lost update, but the pre-existing 30s figure was sized for a
// DIFFERENT failure mode that the seed fix does not address: FRAME ARRIVAL. The
// tick counter only self-extends when the event loop is STARVED; in the
// dominant CI shape — "frames late, timers on time" — ticks run on schedule and
// the budget degrades to a straight wall-clock ceiling on how long a loopback
// WS frame may take to arrive under parallel-load contention (this file runs
// alongside 60+ packages). At 10s that ceiling was outrun again: `ALLOWS an
// authorized connection and syncs` failed 3/3 CI attempts with the DESCRIPTIVE
// `waitFor: timed out` — i.e. the backstop worked and the internal budget was
// simply too tight — while the suite passes locally 157/157.
//
// This is NOT another incremental bump of the kind this file has seen before
// (8 → 15 → 20): those raised a number without a model of what was being
// waited on, and each was outrun in turn. Restoring 30s puts back a ceiling
// with a stated rationale that survived the root-cause fix, and the derived
// backstop below scales with it automatically, so the two can no longer drift.
export const WAIT_BUDGET_MS = process.env.CI ? 30_000 : 5000

// TICK-COUNTED deadline, deliberately NOT wall-clock. CI runs this file under
// parallel-load contention (+ v8 instrumentation in `Coverage (Full)`), and the
// observed flake shape was a ~30s event-loop starvation window: the loopback
// round-trip completes fine, but a `Date.now()`-based deadline burns its budget
// while the loop gets no CPU — the first spec failed 3/3 retries inside one
// window while its sibling's retry passed in 243ms right after (runs
// 27292708996 / 27272xxx on PRs #1498/#1505/#1509). Counting SCHEDULED ticks
// (each ≈10ms of timer time) makes the deadline self-extend under starvation —
// ticks don't run when the loop is starved — while behaving identically to the
// old wall-clock deadline on a healthy machine. `TEST_TIMEOUT_MS` below is the
// hard wall-clock backstop, derived to always exceed the composed budget.
//
// Every call site names WHAT it is waiting for, and the timeout message repeats
// that name plus a snapshot of the observed state. Four escalations of this
// file's budget (8 → 15 → 20 → 30s) were argued from the bare string
// `waitFor: timed out`, which is emitted by twenty call sites and says nothing
// about which barrier stalled or what the transports actually looked like when
// it did. A CI-only, load-dependent failure that reproduces in 1.85s locally
// gives you exactly one artifact — the failure message — so that message has to
// carry the evidence, or the next occurrence is another round of guessing.
export const waitFor = (
  what: string,
  cond: () => boolean,
  opts: { timeoutMs?: number; describe?: () => string } = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const maxTicks = Math.ceil((opts.timeoutMs ?? WAIT_BUDGET_MS) / 10)
    let ticks = 0
    const tick = () => {
      if (cond()) resolve()
      else if (++ticks > maxTicks) {
        // `describe` is evaluated ONLY on failure — a state snapshot must never
        // cost anything on the passing path, which runs this tick every 10ms.
        let observed = ''
        try {
          observed = opts.describe ? ` — observed: ${opts.describe()}` : ''
        } catch (err) {
          observed = ` — observed: <describe() threw: ${String(err)}>`
        }
        reject(new Error(`waitFor: timed out waiting for ${what}${observed}`))
      } else setTimeout(tick, 10)
    }
    tick()
  })

// The vitest wall-clock backstop must EXCEED a test's worst-case COMPOSED
// `waitFor` budget, or vitest kills the test at the boundary — you get an opaque
// "test timed out" instead of the descriptive `waitFor: timed out`, and a healthy
// relay looks broken. DERIVED (never guessed) from the single-source
// `WAIT_BUDGET_MS` × the most sequential waits any spec composes, plus headroom
// for relay spin-up/down and the fixed inter-wait sleeps.
//
// `RECONNECTS with backoff` is the worst case: three sequential waits
// (connect → drop → recover) with a relay teardown + fresh listen between them.
// Every other spec composes ≤2 waits, so this ONE describe-level backstop covers
// the whole file — no per-test override needed. Deriving the backstop from the
// single-source `WAIT_BUDGET_MS` retires the per-test magic numbers that were
// themselves a drift source.
const MAX_SEQUENTIAL_WAITS = 3
const SETUP_TEARDOWN_HEADROOM_MS = 15_000
export const TEST_TIMEOUT_MS = MAX_SEQUENTIAL_WAITS * WAIT_BUDGET_MS + SETUP_TEARDOWN_HEADROOM_MS
