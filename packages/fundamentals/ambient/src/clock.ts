/**
 * The shared clock: `now()`, the pin (`setClock`), the request-scoped start instant (`provideClock`), the server-to-client
 * hand-over, and `useNow`, a reactive reading of the clock that updates on a shared, aligned, refcounted ticker.
 *
 * Ticker rules (each one has a test):
 * - one ticker per granularity (and per zone for `hour` and `day`, per interval for a number), created on its first reader,
 *   never at import and never on a server;
 * - each tick is scheduled from the clock, to the next wall-clock boundary, not by accumulating a fixed interval, so a late
 *   timer does not drift the next one;
 * - a ticker with no readers stops its timer and is dropped; while the document is hidden no timer runs, and on becoming
 *   visible every ticker is recomputed once (no missed tick is replayed);
 * - distinct custom intervals and zones are bounded: past the cap a reader gets a private ticker that is stopped with it;
 * - a one-shot (`{ at }`, returned by a function-valued `every`) is kept in a sorted list served by ONE timer, so any number
 *   of readers that each want their own boundary (a relative label that must flip exactly when its target turns a minute old)
 *   cost one timer, and a reader is dropped from the list when it fires or goes away.
 */
import { createReactiveContext, provide, useContext } from '@pyreon/core'
import { effect, getCurrentScope, isServer, onScopeDispose, signal, isClient } from '@pyreon/reactivity'
import { timeZone } from './locale'
import { programmerError, quote, warnOnce } from './warn'
import { nextLocalBoundary } from './zone-math'

/** How often `useNow` updates: a named granularity or a number of milliseconds. */
export type Every = 'second' | 'minute' | 'hour' | 'day' | number

/**
 * What a function-valued `every` may return: a granularity, or `{ at }`, one update at that instant (epoch ms), after which the
 * function is read again for the next one. `{ at: Infinity }` never updates. An instant already past is clamped to the next
 * millisecond.
 */
export type EveryOrAt = Every | { at: number }

export interface NowOptions {
  /**
   * Default `'minute'`. `'hour'` and `'day'` align to the local hour and midnight of the zone. A function is read reactively:
   * the reader moves to the ticker the new value names (this is how a relative-time label slows down as it ages). It is also read
   * again after every update of the ticker the reader holds, so it can use the plain `now()` and need not track the tick. It may return
   * `{ at }` to be updated at one exact instant (see {@link EveryOrAt}): readers that each ask for their own instant share one timer.
   */
  every?: Every | (() => EveryOrAt)
  /** The zone `'hour'` and `'day'` align to. Default: the active time zone, tracked. */
  zone?: string | (() => string)
}

const ClockContext = createReactiveContext<number | undefined>(undefined)

/** The pinned clock, or `null` for the system clock. One reference, never a collection. */
let source: (() => number) | null = null
let clockProvided = false

// ─── server to client hand-over ─────────────────────────────────────────────────────────────────────────────────────────
// The instant the server rendered at, found once on the client. Until it is released, `now()` returns it, so the first client
// render reads exactly what the server printed; releasing it lets real time take over with one update.
let handover: number | undefined
let handoverRead = false
let handoverReleased = false

const HANDOVER_GLOBAL = '__PYREON_CLOCK__'
const HANDOVER_ATTRIBUTE = 'data-pyreon-clock'

function readHandover(): number | undefined {
  if (isServer) return undefined
  if (handoverRead) return handover
  handoverRead = true
  const fromGlobal = (globalThis as unknown as Record<string, unknown>)[HANDOVER_GLOBAL]
  const text = typeof fromGlobal === 'number' ? String(fromGlobal) : document.querySelector(`[${HANDOVER_ATTRIBUTE}]`)?.getAttribute(HANDOVER_ATTRIBUTE)
  const n = text == null ? Number.NaN : Number(text)

  if (Number.isFinite(n)) {
    handover = n
    // Hydration is synchronous in the task that starts it, so the first macrotask after the first read is after it.
    setTimeout(releaseClock, 0)
  }

  return handover
}

/**
 * Hand real time back to the page after hydration: `now()` stops returning the server's instant and every ticker is updated
 * once. It runs by itself one macrotask after the first read of a hand-over; call it earlier (or later, by calling
 * `clockScript` with `release: false` and releasing yourself) if your hydration is not synchronous.
 *
 * @example releaseClock() // after a custom async hydration step has finished
 */
export function releaseClock(): void {
  if (handover === undefined || handoverReleased) return
  handoverReleased = true
  handover = undefined
  for (const t of active) t.value.set(now())
}

/**
 * The current instant in epoch milliseconds, a plain read (not reactive, starts no timer). Resolution order: the nearest
 * `provideClock`, then the pin from `setClock`, then the server's instant on a page that received one (until it is released),
 * then `Date.now()`.
 *
 * @example typeof now() // => 'number'
 */
export function now(): number {
  if (clockProvided) {
    const provided = useContext(ClockContext)()

    if (provided !== undefined) return provided
  }
  if (source !== null) return source()
  if (!isServer) {
    const h = readHandover()

    if (h !== undefined && !handoverReleased) return h
  }

  return Date.now()
}

/**
 * Pin the clock `now()` and every ticker read, for tests; `null` restores `Date.now()`. It is process-wide state, so on a
 * server it would pin the clock for every request: there, use `provideClock` per request (this warns once in development).
 *
 * @example setClock(() => 1_000_000); now() // => 1000000
 */
export function setClock(clock: (() => number) | null): void {
  if (clock !== null && typeof clock !== 'function') {
    throw programmerError('setClock', `expected a function returning epoch milliseconds, or null to use the system clock, got ${quote(clock)}.`)
  }
  if (isServer && clock !== null && process.env.NODE_ENV !== 'production') {
    warnOnce('setClock:server', '[Pyreon] setClock() pins the clock for every request in this process. On a server use provideClock() per request; keep setClock for tests.')
  }
  source = clock
}

/**
 * Scope a subtree (and, on a server, one request) to a start instant: a number, or an accessor that is tracked. On a server
 * this is the instant the page was rendered at; emit it with `clockScript()` or `clockAttributes()` so the client's first
 * render reads the same instant. Call it in a component's setup.
 *
 * @example provideClock(Date.UTC(2026, 10, 18, 12)) // in a root component
 */
export function provideClock(instant: number | (() => number)): void {
  if (typeof instant !== 'function' && !Number.isFinite(instant)) {
    throw programmerError('provideClock', `expected an instant in epoch milliseconds, or a function returning one, got ${quote(instant)}.`)
  }
  const value = typeof instant === 'function' ? instant : (): number => instant

  clockProvided = true
  provide(ClockContext, value)
}

/** Options of `clockScript`. */
export interface ClockScriptOptions {
  /** The instant to emit. Default: `now()`, which on a server is the `provideClock` instant. */
  instant?: number
  /** A CSP nonce for the inline script. */
  nonce?: string
}

/**
 * The inline script that hands the server's instant to the client: `window.__PYREON_CLOCK__ = <epoch ms>`. Put it in the
 * page head or before the app script. The client reads it on its first `now()` or `useNow()`, before hydration, and releases
 * it one macrotask later so real time takes over with a single update.
 *
 * @example clockScript({ instant: 1000 }) // => '<script>window.__PYREON_CLOCK__=1000</script>'
 */
export function clockScript(options?: ClockScriptOptions): string {
  const n = options?.instant ?? now()

  if (!Number.isFinite(n)) throw programmerError('clockScript', `expected a finite instant, got ${quote(n)}.`)
  const nonce = options?.nonce === undefined ? '' : ` nonce="${options.nonce.replace(/[^A-Za-z0-9+/=_-]/g, '')}"`

  return `<script${nonce}>window.${HANDOVER_GLOBAL}=${Math.trunc(n)}</script>`
}

/**
 * The same hand-over as an attribute, for a page that cannot emit a script (strict CSP): spread it on the root element,
 * `{ 'data-pyreon-clock': '1795008605000' }`.
 *
 * @example clockAttributes(1000) // => { 'data-pyreon-clock': '1000' }
 */
export function clockAttributes(instant?: number): Record<'data-pyreon-clock', string> {
  const n = instant ?? now()

  if (!Number.isFinite(n)) throw programmerError('clockAttributes', `expected a finite instant, got ${quote(n)}.`)

  return { 'data-pyreon-clock': String(Math.trunc(n)) }
}

// ─── tickers ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000
const DAY = 86_400_000
/** Distinct custom intervals and per-zone tickers kept shared; a reader beyond this gets a private ticker. */
export const MAX_SHARED_TICKERS = 16

interface Ticker {
  key: string
  /** Milliseconds between ticks for a fixed interval; for `hour` and `day` the unit of the local boundary. */
  every: number
  /** `''` for a UTC-aligned interval, else the zone whose local hour or midnight is the boundary. */
  zone: string
  value: ReturnType<typeof signal<number>>
  refs: number
  timer: ReturnType<typeof setTimeout> | null
  /** The instant this tick is aimed at. */
  target: number
  shared: boolean
  /** A one-shot kept in `waiting` (no timer of its own). */
  once: boolean
  /** A one-shot that has fired: its reader must take a new one even when it asks for the same instant. */
  spent: boolean
}

const tickers = new Map<string, Ticker>()
/** Every ticker with at least one reader, shared or private. */
const active = new Set<Ticker>()
let visibilityListening = false

function isHidden(): boolean {
  return isClient && document.hidden === true
}

function nextTarget(t: Ticker): number {
  const n = now()

  if (t.zone !== '') return nextLocalBoundary(t.zone, n, t.every)

  return Math.floor(n / t.every) * t.every + t.every
}

function schedule(t: Ticker): void {
  if (t.once || t.timer !== null || t.refs === 0 || isHidden()) return
  const n = now()

  if (t.target <= n) t.target = nextTarget(t)
  t.timer = setTimeout(() => fire(t), Math.max(1, t.target - n))
}

function fire(t: Ticker): void {
  t.timer = null
  const n = now()

  // A timer may wake a few milliseconds early: wait the remainder instead of publishing a moment before the boundary.
  if (n < t.target && n >= t.target - 50) {
    t.timer = setTimeout(() => fire(t), t.target - n)

    return
  }
  t.value.set(n)
  t.target = nextTarget(t)
  schedule(t)
}

function onVisibility(): void {
  for (const t of active) {
    if (isHidden()) {
      if (t.timer !== null) clearTimeout(t.timer)
      t.timer = null
    } else {
      // A tick may have been missed while hidden: recompute once and aim at the next boundary, do not replay.
      t.value.set(now())
      if (!t.once) t.target = 0
      schedule(t)
    }
  }
  arm()
}

// ─── one-shots: one timer for every reader that wants its own instant ───────────────────────────────────────────────────

/** One-shot readers ordered by the instant they want to be updated at. */
const waiting: Ticker[] = []
let beat: ReturnType<typeof setTimeout> | null = null

function arm(): void {
  if (beat !== null) clearTimeout(beat)
  beat = null
  const first = waiting[0]

  if (first !== undefined && !isHidden()) beat = setTimeout(wake, Math.min(2 ** 31 - 1, Math.max(1, first.target - now())))
}

function wake(): void {
  const n = now()

  beat = null
  while (waiting.length > 0 && (waiting[0] as Ticker).target <= n) {
    const t = waiting.shift() as Ticker

    t.spent = true
    t.value.set(n)
  }
  arm()
}

function acquireAt(at: number): Ticker {
  const target = Math.max(at, now() + 1)
  const t: Ticker = { key: `at:${at}`, every: 0, zone: '', value: signal(now()), refs: 1, timer: null, target, shared: false, once: true, spent: false }
  let lo = 0
  let hi = waiting.length

  active.add(t)
  listenVisibility(true)
  if (Number.isFinite(at)) {
    while (lo < hi) {
      const mid = (lo + hi) >> 1

      if ((waiting[mid] as Ticker).target <= target) lo = mid + 1
      else hi = mid
    }
    waiting.splice(lo, 0, t)
    if (lo === 0 || beat === null) arm()
  }

  return t
}

function listenVisibility(on: boolean): void {
  if (isServer || visibilityListening === on) return
  visibilityListening = on
  if (on) document.addEventListener('visibilitychange', onVisibility)
  else document.removeEventListener('visibilitychange', onVisibility)
}

function keyOf(every: EveryOrAt, zone: string): string {
  if (typeof every === 'object') return `at:${every.at}`
  if (every === 'second' || every === 'minute') return every
  if (every === 'hour' || every === 'day') return `${every}:${zone}`

  return `ms:${every}`
}

function everyMs(every: Every): number {
  if (every === 'second') return 1000
  if (every === 'minute') return 60_000
  if (every === 'hour') return HOUR
  if (every === 'day') return DAY

  return every
}

function acquire(every: Every, zone: string): Ticker {
  const key = keyOf(every, zone)
  let t = tickers.get(key)

  if (t === undefined) {
    const named = every === 'second' || every === 'minute'
    const shared = named || tickers.size < MAX_SHARED_TICKERS
    const aligned = every === 'hour' || every === 'day' ? zone : ''

    t = { key, every: everyMs(every), zone: aligned, value: signal(now()), refs: 0, timer: null, target: 0, shared, once: false, spent: false }
    if (shared) tickers.set(key, t)
  }
  if (t.refs === 0) {
    t.value.set(now())
    active.add(t)
    listenVisibility(true)
  }
  t.refs++
  schedule(t)

  return t
}

function release(t: Ticker): void {
  if (--t.refs > 0) return
  if (t.once) {
    const i = waiting.indexOf(t)

    if (i >= 0) waiting.splice(i, 1)
    arm()
  }
  if (t.timer !== null) clearTimeout(t.timer)
  t.timer = null
  t.target = 0
  active.delete(t)
  if (t.shared) tickers.delete(t.key)
  if (active.size === 0) listenVisibility(false)
}

function checkEvery(every: unknown, fromFunction = false): EveryOrAt {
  if (every === undefined) return 'minute'
  if (fromFunction && typeof every === 'object' && every !== null && typeof (every as { at?: unknown }).at === 'number' && !Number.isNaN((every as { at: number }).at)) return every as { at: number }
  if (every === 'second' || every === 'minute' || every === 'hour' || every === 'day') return every
  if (typeof every === 'number' && Number.isFinite(every) && every >= 1) return every

  throw programmerError('useNow', `every must be 'second', 'minute', 'hour', 'day', a number of milliseconds of at least 1${fromFunction ? ' or { at: instant }' : ''}, got ${quote(every)}.`)
}

/**
 * A reactive reading of the clock: an accessor that updates on a shared ticker, so one timer serves every reader of the same
 * granularity. Call it in a component's setup (or any reactive scope): the ticker is released when that scope is disposed.
 * Outside a scope, and on a server, it returns the plain `now` read: the current instant, no subscription and no timer. On a
 * server that instant is the `provideClock` one, so the HTML matches what the client hydrates.
 *
 * @example typeof useNow({ every: 'second' })() // => 'number'
 */
export function useNow(options?: NowOptions): () => number {
  const everyOption = options?.every
  const zoneOption = options?.zone

  if (typeof everyOption !== 'function') checkEvery(everyOption)
  if (isServer || getCurrentScope() === null) return now
  const needsZone = (e: EveryOrAt): boolean => e === 'hour' || e === 'day'
  const everyNow = (): EveryOrAt => checkEvery(typeof everyOption === 'function' ? everyOption() : everyOption, typeof everyOption === 'function')
  const take = (e: EveryOrAt, zone: string): Ticker => (typeof e === 'object' ? acquireAt(e.at) : acquire(e, zone))
  const zoneNow = (): string => (zoneOption === undefined ? timeZone() : typeof zoneOption === 'function' ? zoneOption() : zoneOption)
  const first = everyNow()

  if (typeof everyOption !== 'function' && !needsZone(first)) {
    const t = take(first, '')

    onScopeDispose(() => release(t))

    return () => t.value()
  }
  let held = take(first, needsZone(first) ? zoneNow() : '')
  const current = signal<Ticker>(held)

  // Reactive reader: the granularity and the zone are tracked, and a change moves the reader to the matching ticker.
  const stop = effect(() => {
    const every = everyNow()
    const zone = needsZone(every) ? zoneNow() : ''
    if (held.spent || held.key !== keyOf(every, zone)) {
      const next = take(every, zone)

      release(held)
      held = next
      current.set(next)
    }
    // The function is read again after every update of the ticker the reader now holds: it sees the new instant and may move on.
    held.value()
  })

  onScopeDispose(() => {
    stop.dispose()
    release(held)
  })

  return () => current().value()
}

/** Test hook: the number of tickers with a reader, and of those with a pending timer. */
export function _tickerStats(): { active: number; timers: number; shared: number } {
  let timers = 0

  for (const t of active) if (t.timer !== null) timers++
  if (beat !== null) timers++

  return { active: active.size, timers, shared: tickers.size }
}

/** Test and bench hook: publish the current instant to every ticker with a reader, as a tick would. */
export function _fireAll(): void {
  const n = now()

  for (const t of active) t.value.set(n)
}

/** Test hook: drop every ticker, the pin, the provide flag and the hand-over. */
export function resetClockState(): void {
  for (const t of active) if (t.timer !== null) clearTimeout(t.timer)
  if (beat !== null) clearTimeout(beat)
  beat = null
  waiting.length = 0
  active.clear()
  tickers.clear()
  listenVisibility(false)
  source = null
  clockProvided = false
  handover = undefined
  handoverRead = false
  handoverReleased = false
}
