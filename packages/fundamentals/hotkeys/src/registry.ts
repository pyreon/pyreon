import type { Signal } from '@pyreon/reactivity'
import { isServer, signal } from '@pyreon/reactivity'
import { isMac, matchesComboWithKey, normalizeEventKey, parseShortcut, splitShortcutList } from './parse'
import type { HotkeyEntry, HotkeyOptions, InputKind, KeyCombo } from './types'

// ─── Per-target registry state ──────────────────────────────────────────────
//
// Hotkeys default to `window`, but an entry may bind to any EventTarget
// (`options.target`) — element-scoped shortcuts that fire only while focus is
// inside that element. Each target owns ONE shared listener per event type
// plus its own dispatch state; the listener detaches when the target's last
// entry unregisters.
//
// DISPATCH IS KEY-BUCKETED: entries are indexed by their first combo's `key`
// (`Map<eventKey, HotkeyEntry[]>`), so a keystroke touches only the entries
// bound to that exact key. The common case — a keypress that matches NOTHING —
// is a single Map miss instead of a linear scan, and dispatch cost is
// O(bucket) not O(total registered). Registration order is preserved WITHIN a
// bucket, which is the only place it's observable (two hotkeys on different
// first keys can never contend for the same keystroke). Bench-proven: see
// bench/hotkeys-bench.ts (`dispatch (miss)` + the 48-binding scaling op).

interface PendingSequence {
  /** The entry whose remaining keys we're tracking. */
  entry: RegEntry
  /** Index of the NEXT combo we expect to match in `entry.sequence`. */
  next: number
}

interface TargetState {
  target: EventTarget
  /** First-combo key → entries, per event type. */
  buckets: { keydown: Map<string, RegEntry[]>; keyup: Map<string, RegEntry[]> }
  entryCount: number
  listeners: { keydown: ((e: Event) => void) | null; keyup: ((e: Event) => void) | null }
  /** Sequence tracking (keydown-only). */
  pending: PendingSequence[]
  pendingTimer: ReturnType<typeof setTimeout> | null
}

const targetStates = new Map<EventTarget, TargetState>()
/**
 * A registered entry plus its links in the global registration-order list.
 * The links are internal: `HotkeyEntry` is the public shape and entries are
 * never handed to user code (`getRegisteredHotkeys` maps them).
 */
interface RegEntry extends HotkeyEntry {
  prev: RegEntry | null
  next: RegEntry | null
}

/**
 * Insertion-ordered list of ALL entries — drives help panels + conflict scan.
 * An intrusive doubly-linked list rather than a Set: register and unregister
 * are field writes instead of a hashed add + delete, which profiled as ~30% of
 * a mount/unmount cycle. Iteration keeps registration order.
 */
let headEntry: RegEntry | null = null
let tailEntry: RegEntry | null = null

function linkEntry(entry: RegEntry): void {
  entry.prev = tailEntry
  if (tailEntry) tailEntry.next = entry
  else headEntry = entry
  tailEntry = entry
}

function unlinkEntry(entry: RegEntry): void {
  const { prev, next } = entry
  if (prev) prev.next = next
  else if (headEntry === entry) headEntry = next
  else return // not linked (already removed)
  if (next) next.prev = prev
  else tailEntry = prev
  entry.prev = null
  entry.next = null
}

function forEachEntry(fn: (entry: RegEntry) => void): void {
  for (let e = headEntry; e !== null; e = e.next) fn(e)
}

const activeScopes = signal<Set<string>>(new Set(['global']))

// Scope activation is REFERENCE-COUNTED. `enableScope`/`disableScope` (and the
// `useHotkeyScope` hook that calls them) are acquire/release: a scope becomes
// active on the 0→1 transition and deactivates on the 1→0 transition. This is
// what makes STACKED components correct — two panels that both activate
// `'editor'` keep it active until BOTH release it, instead of the first
// unmount disabling it for the survivor (the classic leak-class-D shape).
// `'global'` is always active and never counted.
const scopeRefcounts = new Map<string, number>()

const SEQUENCE_TIMEOUT_MS = 1000

function clearPending(state: TargetState): void {
  state.pending = []
  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer)
    state.pendingTimer = null
  }
}

function armSequenceTimeout(state: TargetState): void {
  if (state.pendingTimer) clearTimeout(state.pendingTimer)
  state.pendingTimer = setTimeout(() => clearPending(state), SEQUENCE_TIMEOUT_MS)
}

// ─── Input detection ─────────────────────────────────────────────────────────

/**
 * The focused editable kind for this event, or null when the target isn't an
 * editable element. Computed ONCE per dispatch (identical for every entry).
 */
function focusedInputKind(event: KeyboardEvent): InputKind | null {
  // composedPath()[0], not `target`: a shadow root RETARGETS `target` to its
  // host, so an <input> inside a web component read as a plain element and
  // every single-key shortcut fired while the user typed into it.
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  const target = (path[0] ?? event.target) as HTMLElement | null
  if (!target) return null
  const tag = target.tagName
  if (tag === 'INPUT') return 'input'
  if (tag === 'TEXTAREA') return 'textarea'
  if (tag === 'SELECT') return 'select'
  if (target.isContentEditable) return 'contenteditable'
  return null
}

/** Does this entry fire given the focused editable kind (null = not editable)? */
function allowedInInput(
  opt: boolean | ReadonlyArray<InputKind>,
  kind: InputKind | null,
): boolean {
  if (kind === null) return true
  if (opt === true) return true
  if (opt === false) return false
  return opt.includes(kind)
}

// ─── Dispatch ────────────────────────────────────────────────────────────────


function isEnabled(entry: HotkeyEntry): boolean {
  const e = entry.options.enabled
  return typeof e === 'function' ? e() : e
}

/** Fire an entry's handler (with its preventDefault/stopPropagation policy). */
function fire(entry: HotkeyEntry, event: KeyboardEvent, unregisterOnce: () => void): void {
  if (entry.options.preventDefault) event.preventDefault()
  if (entry.options.stopPropagation) event.stopPropagation()
  entry.handler(event)
  if (entry.options.once) unregisterOnce()
}

function makeDispatch(state: TargetState, eventType: 'keydown' | 'keyup') {
  return (raw: Event): void => {
    const event = raw as KeyboardEvent
    const eventKey = normalizeEventKey(event)
    if (eventKey === null) return
    const scopes = activeScopes.peek()
    // Per-dispatch constants hoisted out of all entry loops: the lower-cased
    // key and the focused-editable kind are identical for every entry.
    const inputKind = focusedInputKind(event)

    // ─── Stage 1 (keydown only): advance pending sequences ────────────────
    // If we're mid-sequence, this keystroke must match the NEXT combo of at
    // least one pending entry. Non-matches drop that pending entry; a full
    // match fires and clears all pending state. If anything advanced, return
    // early so single-key shortcuts don't ALSO fire — sequence ownership of
    // the keystroke beats fresh matches.
    if (eventType === 'keydown' && state.pending.length > 0) {
      const surviving: PendingSequence[] = []
      let fired = false
      for (const p of state.pending) {
        const expected = p.entry.sequence[p.next]
        // Defensive — unreachable. A PendingSequence is only created with a
        // `next` that points at a valid index (survivors use `next + 1`
        // strictly below `sequence.length`; fresh entries use 0 only when
        // the sequence is non-empty).
        /* v8 ignore next */
        if (!expected) continue
        if (!matchesComboWithKey(event, expected, eventKey)) continue
        if (p.next + 1 === p.entry.sequence.length) {
          fire(p.entry, event, () => unregisterEntry(p.entry, state))
          fired = true
        } else {
          surviving.push({ entry: p.entry, next: p.next + 1 })
        }
      }
      if (fired || surviving.length > 0) {
        state.pending = surviving
        if (surviving.length > 0) armSequenceTimeout(state)
        else clearPending(state)
        return
      }
      // No pending sequence matched — clear stale state, fall through.
      clearPending(state)
    }

    // ─── Stage 2: bucketed fresh dispatch ─────────────────────────────────
    // O(1) reject for the dominant case: a keystroke whose key has no
    // registered entries never touches an entry at all.
    const bucket = state.buckets[eventType].get(eventKey)
    if (!bucket || bucket.length === 0) return

    let newPending: PendingSequence[] | null = null
    // Iterate over a snapshot only when a `once` entry could splice the
    // bucket mid-loop; the common path iterates the live array.
    for (let i = 0; i < bucket.length; i++) {
      const entry = bucket[i]!
      if (!matchesComboWithKey(event, entry.combo, eventKey)) continue
      if (!scopes.has(entry.options.scope)) continue
      if (!allowedInInput(entry.options.enableOnInputs, inputKind)) continue
      if (entry.options.ignoreRepeat && event.repeat) continue
      if (!isEnabled(entry)) continue

      if (entry.sequence.length === 0) {
        const before = bucket.length
        fire(entry, event, () => unregisterEntry(entry, state))
        // A `once` unregister spliced the current index out — re-visit it.
        if (bucket.length < before) i--
      } else {
        // Sequential hotkey — record as pending; consume the keystroke
        // (preventDefault so 'g' doesn't trigger a browser shortcut) but
        // DON'T fire the handler yet.
        if (entry.options.preventDefault) event.preventDefault()
        ;(newPending ??= []).push({ entry, next: 0 })
      }
    }

    if (newPending) {
      state.pending = newPending
      armSequenceTimeout(state)
    }
  }
}

// ─── Target-state lifecycle ─────────────────────────────────────────────────

function getTargetState(target: EventTarget): TargetState {
  let state = targetStates.get(target)
  if (!state) {
    state = {
      target,
      buckets: { keydown: new Map(), keyup: new Map() },
      entryCount: 0,
      listeners: { keydown: null, keyup: null },
      pending: [],
      pendingTimer: null,
    }
    targetStates.set(target, state)
  }
  return state
}

function ensureListener(state: TargetState, eventType: 'keydown' | 'keyup'): void {
  if (state.listeners[eventType]) return
  const handler = makeDispatch(state, eventType)
  state.listeners[eventType] = handler
  state.target.addEventListener(eventType, handler)
}

function teardownTargetIfEmpty(state: TargetState): void {
  if (state.entryCount > 0) return
  for (const type of ['keydown', 'keyup'] as const) {
    const l = state.listeners[type]
    if (l) state.target.removeEventListener(type, l)
    state.listeners[type] = null
  }
  clearPending(state)
  // Keep the WINDOW state object cached (buckets are already empty) — window
  // is the singleton default target, and mount/unmount cycles would otherwise
  // re-allocate the state + its two bucket Maps every cycle. Element targets
  // are fully released (holding them would pin removed DOM — leak class C/H).
  if (!isServer && state.target === window) return
  targetStates.delete(state.target)
}

function unregisterEntry(entry: RegEntry, state: TargetState): void {
  // Always present: a bucket is never removed from its state once created (an
  // emptied one stays for the next mount — a remount registers the same keys
  // again, so keeping the array spares a Map delete + set + allocation per
  // shortcut per cycle; bounded by the keys this target has ever bound, and
  // released with the whole state when an element target empties, see
  // teardownTargetIfEmpty). The entry captured its state at registration.
  const bucket = state.buckets[entry.options.event].get(entry.combo.key)!
  const idx = bucket.indexOf(entry)
  if (idx !== -1) {
    // The usual removal is the bucket's last (often only) entry: pop it
    // rather than splice, which allocates the array of removed items.
    if (idx === bucket.length - 1) bucket.pop()
    else bucket.splice(idx, 1)
    state.entryCount--
  }
  unlinkEntry(entry)
  teardownTargetIfEmpty(state)
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Parsed shortcuts, keyed by the exact string passed to `registerOne`.
 * Registration is repeated with the same strings (every remount of a component
 * that binds shortcuts), and parsing lower-cases, trims and splits each time.
 * Results are FROZEN and only ever read — entries share them. `mod` resolves
 * per platform, so those keys carry the platform; everything else is
 * platform-independent. Bounded: an app that builds shortcut strings
 * dynamically clears the cache instead of growing it.
 */
interface ParsedShortcut {
  first: KeyCombo
  rest: KeyCombo[]
  /** Platform a `mod` shortcut was resolved for; null when it has no `mod`. */
  mac: boolean | null
}
const _parsed = new Map<string, ParsedShortcut>()
const PARSE_CACHE_MAX = 256

/**
 * The cached parse for this exact string, or undefined. Keyed on the raw
 * string so a hit costs one lookup — the platform is checked only for the
 * `mod` shortcuts that depend on it.
 *
 * Only strings that `registerOne` received are ever cached, and every one of
 * them splits to itself (`splitShortcutList(k)` is `[k]`), so `registerHotkey`
 * may take a hit without checking for a comma list first.
 */
function cachedParse(shortcut: string): ParsedShortcut | undefined {
  const hit = _parsed.get(shortcut)
  if (hit === undefined || (hit.mac !== null && hit.mac !== isMac())) return undefined
  return hit
}

function parseForRegister(shortcut: string): ParsedShortcut {
  const hit = cachedParse(shortcut)
  if (hit !== undefined) return hit
  // Sequential combo support: space-separated combos like `'g t'` are ordered
  // sequences — press `g`, then `t` within `SEQUENCE_TIMEOUT_MS`. Each
  // sub-combo goes through `parseShortcut` (so `'ctrl+k p'` works).
  // Fast path: no space → single combo (the overwhelmingly common case) —
  // skip the regex split + map + filter entirely. The empty string has no
  // space, so it must be rejected here to keep the length-0 throw below.
  const subShortcuts = shortcut === '' ? [] : shortcut.includes(' ')
    ? shortcut
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [shortcut]
  if (subShortcuts.length === 0) {
    throw new Error(`[@pyreon/hotkeys] empty shortcut: ${JSON.stringify(shortcut)}`)
  }
  const combos = subShortcuts.map((s) => Object.freeze(parseShortcut(s)))
  const first = combos[0]
  /* v8 ignore start */
  if (!first) {
    throw new Error(`[@pyreon/hotkeys] invalid shortcut: ${JSON.stringify(shortcut)}`)
  }
  /* v8 ignore stop */
  const parsed: ParsedShortcut = Object.freeze({
    first,
    rest: Object.freeze(combos.slice(1)) as KeyCombo[],
    mac: shortcut.includes('mod') ? isMac() : null,
  })
  if (_parsed.size >= PARSE_CACHE_MAX) _parsed.clear()
  _parsed.set(shortcut, parsed)
  return parsed
}

const DEFAULT_OPTIONS: HotkeyEntry['options'] = Object.freeze({
  scope: 'global',
  preventDefault: true,
  stopPropagation: false,
  enableOnInputs: false,
  enabled: true,
  event: 'keydown',
  ignoreRepeat: false,
  once: false,
})

function resolveOptions(
  options: HotkeyOptions,
  eventType: 'keydown' | 'keyup',
): HotkeyEntry['options'] {
  const resolved: HotkeyEntry['options'] = {
    scope: options.scope ?? 'global',
    preventDefault: options.preventDefault !== false,
    stopPropagation: options.stopPropagation === true,
    enableOnInputs: options.enableOnInputs ?? false,
    enabled: options.enabled ?? true,
    event: eventType,
    ignoreRepeat: options.ignoreRepeat === true,
    once: options.once === true,
  }
  // Assigned, not spread: a conditional object spread copies through a
  // temporary object on every registration.
  if (options.description != null) resolved.description = options.description
  return resolved
}

function registerOne(
  shortcut: string,
  parsed: ParsedShortcut,
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions | undefined,
): () => void {
  // Defensive SSR guard — registerHotkey's own isServer bail precedes every
  // call, but the guard here makes the `window` default below provably
  // SSR-safe at its use site (and keeps the no-window-in-ssr rule honest).
  /* v8 ignore next */
  if (isServer) return () => {}
  const firstCombo = parsed.first
  const rest = parsed.rest
  const eventType = options?.event ?? 'keydown'
  if (eventType === 'keyup' && rest.length > 0) {
    throw new Error(
      `[@pyreon/hotkeys] sequential shortcut ${JSON.stringify(shortcut)} cannot use event: 'keyup' — sequences are keydown-only`,
    )
  }

  const entry: RegEntry = {
    shortcut,
    combo: firstCombo,
    sequence: rest,
    handler,
    // Entries never mutate their options, so a registration that passes none
    // shares one frozen default instead of allocating eight fields.
    options: options === undefined ? DEFAULT_OPTIONS : resolveOptions(options, eventType),
    prev: null,
    next: null,
  }

  const state = getTargetState(options?.target ?? window)
  ensureListener(state, eventType)
  const buckets = state.buckets[eventType]
  const bucket = buckets.get(firstCombo.key)
  if (bucket) bucket.push(entry)
  else buckets.set(firstCombo.key, [entry])
  state.entryCount++
  linkEntry(entry)

  let unregistered = false
  return () => {
    if (unregistered) return
    unregistered = true
    unregisterEntry(entry, state)
  }
}

/**
 * Register a keyboard shortcut. Returns an unregister function.
 *
 * Accepts a COMMA-SEPARATED list to bind several shortcuts to one handler
 * (`'ctrl+s, mod+p'`); the returned function unregisters all of them. A
 * literal comma key is `'comma'` (or the raw `','` — see
 * {@link splitShortcutList}).
 *
 * @example
 * ```ts
 * const unregister = registerHotkey('ctrl+s', (e) => save(), { description: 'Save' })
 * registerHotkey('g d, g h', goHome)                 // two sequences, one handler
 * registerHotkey('escape', close, { event: 'keyup' }) // fire on release
 * // later: unregister()
 * ```
 */
export function registerHotkey(
  shortcut: string,
  handler: (event: KeyboardEvent) => void,
  options?: HotkeyOptions,
): () => void {
  // SSR no-op. The registry drives DOM listeners that only exist in a
  // browser, so registering on the server does nothing useful — but the
  // module is shared across every request, so pushing entries would (a) leak
  // unboundedly (no unmount fires during `renderToString`) and (b) BLEED one
  // request's hotkeys into the next. Return an inert unregister and touch no
  // shared state. `getRegisteredHotkeys()` is therefore client-runtime state;
  // build SSR help panels from a static config, not the live registry.
  if (isServer) return () => {}

  // A string registered before (every remount) is one cache lookup — no scan
  // for a comma list. See cachedParse for why a hit is never a list.
  const hit = cachedParse(shortcut)
  if (hit !== undefined) return registerOne(shortcut, hit, handler, options)
  // No comma (the common case): skip building a one-element list.
  if (!shortcut.includes(',')) {
    return registerOne(shortcut, parseForRegister(shortcut), handler, options)
  }
  const shortcuts = splitShortcutList(shortcut)
  const uns = shortcuts.map((s) => registerOne(s, parseForRegister(s), handler, options))
  if (uns.length === 1) return uns[0]!
  return () => {
    for (const u of uns) u()
  }
}

// ─── Programmatic trigger ────────────────────────────────────────────────────

/**
 * Programmatically fire the handlers registered for `shortcut` (against the
 * default `window` target), as if the user pressed it. Respects scope +
 * `enabled` gates; skips the input-focus gate (there is no real focused
 * element). Useful for command palettes ("run the bound action") and tests.
 * Returns the number of handlers fired.
 */
export function trigger(shortcut: string, options?: { scope?: string }): number {
  if (isServer) return 0
  const combos = shortcut
    .split(/\s+/)
    .filter(Boolean)
    .map(parseShortcut)
  const seqTail = combos.slice(1)
  const first = combos[0]
  if (!first) return 0
  const state = targetStates.get(window)
  if (!state) return 0
  const scopes = activeScopes.peek()
  let fired = 0
  // Match against BOTH event-type buckets — a trigger means "run the bound
  // action", regardless of which physical event it listens to.
  for (const type of ['keydown', 'keyup'] as const) {
    const bucket = state.buckets[type].get(first.key)
    if (!bucket) continue
    // Snapshot: a `once` entry unregisters mid-loop.
    for (const entry of [...bucket]) {
      if (!sameCombo(entry.combo, first)) continue
      if (!sameSequence(entry.sequence, seqTail)) continue
      if (options?.scope !== undefined) {
        if (entry.options.scope !== options.scope) continue
      } else if (!scopes.has(entry.options.scope)) continue
      if (!isEnabled(entry)) continue
      const event = new KeyboardEvent(type, {
        key: entry.sequence.length > 0 ? lastCombo(entry).key : first.key,
        ctrlKey: first.ctrl,
        shiftKey: first.shift,
        altKey: first.alt,
        metaKey: first.meta,
      })
      entry.handler(event)
      if (entry.options.once) unregisterEntry(entry, state)
      fired++
    }
  }
  return fired
}

function sameCombo(a: KeyCombo, b: KeyCombo): boolean {
  return (
    a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta
  )
}

function sameSequence(a: KeyCombo[], b: KeyCombo[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!sameCombo(a[i]!, b[i]!)) return false
  return true
}

/** The final combo of a SEQUENTIAL entry (only called when it has a sequence). */
function lastCombo(entry: HotkeyEntry): KeyCombo {
  return entry.sequence[entry.sequence.length - 1]!
}

// ─── Pressed-key introspection ──────────────────────────────────────────────

const pressedKeys = signal<Set<string>>(new Set())
let pressedTrackingAttached = false
let pressedHandlers: {
  down: (e: KeyboardEvent) => void
  up: (e: KeyboardEvent) => void
  blur: () => void
} | null = null

/**
 * Attach the (lazy, shared) pressed-key tracker: keydown adds, keyup removes,
 * window blur clears (keys released outside the page never send keyup).
 */
function ensurePressedTracking(): void {
  if (pressedTrackingAttached || isServer) return
  pressedTrackingAttached = true
  pressedHandlers = {
    down: (e: KeyboardEvent) => {
      // Guarded like dispatch: a key-less synthetic keydown must not throw.
      if (typeof e.key !== 'string') return
      const k = e.key.toLowerCase()
      const cur = pressedKeys.peek()
      if (cur.has(k)) return
      const next = new Set(cur)
      next.add(k)
      pressedKeys.set(next)
    },
    up: (e: KeyboardEvent) => {
      if (typeof e.key !== 'string') return
      const k = e.key.toLowerCase()
      const cur = pressedKeys.peek()
      if (!cur.has(k)) return
      const next = new Set(cur)
      next.delete(k)
      pressedKeys.set(next)
    },
    blur: () => {
      if (pressedKeys.peek().size === 0) return
      pressedKeys.set(new Set())
    },
  }
  window.addEventListener('keydown', pressedHandlers.down as EventListener)
  window.addEventListener('keyup', pressedHandlers.up as EventListener)
  window.addEventListener('blur', pressedHandlers.blur)
}

/**
 * Reactive signal of the currently-held keys (lower-cased `event.key`
 * values). Tracking listeners attach lazily on FIRST call — until then the
 * package adds zero pressed-key overhead. Cleared on window blur (a key
 * released outside the page never delivers its keyup). SSR-safe: always the
 * empty set on the server.
 *
 * @example
 * ```ts
 * const pressed = getPressedKeys()
 * effect(() => console.log([...pressed()])) // e.g. ['control', 's']
 * ```
 */
export function getPressedKeys(): Signal<Set<string>> {
  ensurePressedTracking()
  return pressedKeys
}

/**
 * Is `key` (an `event.key` value or alias — `'ctrl'`, `'space'`, `'a'`)
 * currently held? Non-reactive read; for reactive use read
 * {@link getPressedKeys} inside a tracking scope. Lazily attaches the shared
 * tracker on first call.
 */
export function isKeyPressed(key: string): boolean {
  ensurePressedTracking()
  const combo = parseShortcut(key)
  // A bare modifier name parses into the modifier flag with an empty key.
  const k =
    combo.key !== ''
      ? combo.key
      : combo.ctrl
        ? 'control'
        : combo.shift
          ? 'shift'
          : combo.alt
            ? 'alt'
            : combo.meta
              ? 'meta'
              : ''
  return pressedKeys.peek().has(k)
}

// ─── Scope management ────────────────────────────────────────────────────────

/**
 * Activate a hotkey scope (acquire). Reference-counted — the scope becomes
 * active on the first acquire and stays active until every acquire is matched
 * by a {@link disableScope} release. `'global'` is always active. No-op on the
 * server (scope state is client-runtime and must not bleed across requests).
 */
export function enableScope(scope: string): void {
  if (isServer) return
  if (scope === 'global') return
  const count = scopeRefcounts.get(scope) ?? 0
  scopeRefcounts.set(scope, count + 1)
  if (count > 0) return // already active — just bumped the refcount
  const next = new Set(activeScopes.peek())
  next.add(scope)
  activeScopes.set(next)
}

/**
 * Deactivate a hotkey scope (release). Reference-counted — the scope only
 * deactivates once every {@link enableScope} acquire has been released. Cannot
 * deactivate `'global'`. Releasing an inactive scope is a no-op (the count
 * clamps at zero). No-op on the server.
 */
export function disableScope(scope: string): void {
  if (isServer) return
  if (scope === 'global') return
  const count = scopeRefcounts.get(scope) ?? 0
  if (count === 0) return // not active — nothing to release
  if (count > 1) {
    scopeRefcounts.set(scope, count - 1)
    return // still held by another acquirer
  }
  scopeRefcounts.delete(scope)
  const next = new Set(activeScopes.peek())
  next.delete(scope)
  activeScopes.set(next)
}

/**
 * Get the currently active scopes as a reactive signal.
 */
export function getActiveScopes(): Signal<Set<string>> {
  return activeScopes
}

/**
 * Get all registered hotkeys (for building help dialogs). Insertion-ordered.
 */
export function getRegisteredHotkeys(): ReadonlyArray<{
  shortcut: string
  scope: string
  description?: string
}> {
  const out: Array<{ shortcut: string; scope: string; description?: string }> = []
  forEachEntry((e) => {
    out.push({
      shortcut: e.shortcut,
      scope: e.options.scope,
      ...(e.options.description != null ? { description: e.options.description } : {}),
    })
  })
  return out
}

// ─── Conflict detection ──────────────────────────────────────────────────────

/** Deterministic signature for one parsed combo (modifiers + key). */
function comboSignature(c: KeyCombo): string {
  return `${c.ctrl ? 'c' : ''}${c.alt ? 'a' : ''}${c.shift ? 's' : ''}${c.meta ? 'm' : ''}:${c.key}`
}

/**
 * Full-sequence signature for an entry. Two entries with the SAME signature
 * resolve to the same keystroke(s) — so `'ctrl+s'` and `'control+s'`, or (on a
 * non-Mac) `'mod+s'` and `'ctrl+s'`, share a signature and are flagged as
 * conflicting despite different source strings.
 */
function entrySignature(e: HotkeyEntry): string {
  return [e.combo, ...e.sequence].map(comboSignature).join(' ')
}

// NUL separator so a scope/event name can never collide with a composed group
// key. Built via fromCharCode — a literal escape in source trips the repo's
// source-hygiene gate (no raw control bytes in tracked files).
const CONFLICT_SEP = String.fromCharCode(0)

/**
 * Detect hotkeys that would fire on the SAME keystroke within the SAME scope —
 * i.e. registered shortcuts whose parsed combo sequence is identical. Because
 * matching happens on the parsed combo (not the source string), aliased
 * duplicates (`'ctrl+s'` vs `'control+s'`, `'mod+s'` vs `'ctrl+s'` off Mac)
 * are caught too.
 *
 * Cross-scope overlaps are NOT reported — a `'mod+s'` in `'global'` and one in
 * `'editor'` is intentional scope LAYERING, not a conflict. Same for
 * different-EVENT bindings (keydown vs keyup on the same combo) and
 * different-target bindings. Use this for a "keyboard shortcut audit" panel,
 * a dev-time assertion, or a settings UI that warns on duplicate bindings.
 *
 * @example
 * ```ts
 * registerHotkey('ctrl+s', saveA)
 * registerHotkey('control+s', saveB) // same combo, same (global) scope
 * getHotkeyConflicts()
 * // → [{ scope: 'global', shortcuts: ['ctrl+s', 'control+s'], descriptions: [undefined, undefined] }]
 * ```
 */
export function getHotkeyConflicts(): ReadonlyArray<{
  /** The scope in which the colliding hotkeys are registered. */
  scope: string
  /** The source shortcut strings that resolve to the same key sequence. */
  shortcuts: string[]
  /** Descriptions parallel to `shortcuts` (`undefined` where none was set). */
  descriptions: Array<string | undefined>
}> {
  const groups = new Map<string, HotkeyEntry[]>()
  forEachEntry((e) => {
    const key = e.options.scope + CONFLICT_SEP + e.options.event + CONFLICT_SEP + entrySignature(e)
    const g = groups.get(key)
    if (g) g.push(e)
    else groups.set(key, [e])
  })
  const conflicts: {
    scope: string
    shortcuts: string[]
    descriptions: Array<string | undefined>
  }[] = []
  for (const g of groups.values()) {
    if (g.length < 2) continue
    conflicts.push({
      scope: g[0]!.options.scope,
      shortcuts: g.map((e) => e.shortcut),
      descriptions: g.map((e) => e.options.description),
    })
  }
  return conflicts
}

// ─── Reset (for testing) ────────────────────────────────────────────────

export function _resetHotkeys(): void {
  for (const state of targetStates.values()) {
    state.entryCount = 0
    teardownTargetIfEmpty(state)
  }
  targetStates.clear()
  // Unlink every entry so a stale unregister closure held across a reset
  // cannot splice the fresh list.
  for (let e = headEntry; e !== null; ) {
    const next = e.next
    e.prev = null
    e.next = null
    e = next
  }
  headEntry = null
  tailEntry = null
  activeScopes.set(new Set(['global']))
  scopeRefcounts.clear()
  if (pressedHandlers && !isServer) {
    window.removeEventListener('keydown', pressedHandlers.down as EventListener)
    window.removeEventListener('keyup', pressedHandlers.up as EventListener)
    window.removeEventListener('blur', pressedHandlers.blur)
  }
  pressedHandlers = null
  pressedTrackingAttached = false
  pressedKeys.set(new Set())
}
