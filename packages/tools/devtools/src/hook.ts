import { serialize } from './serialize'
import type {
  ComponentDetail,
  ComponentRead,
  ConsoleEntry,
  ConsoleLevel,
  HookMessage,
  PanelMessage,
  PyreonDevtools,
  ReactiveFire,
  ReactiveGraph,
  SourceLocation,
  UpdateCause,
} from './types'

// --- Page-world side of the bridge ---
// Runs in the inspected page next to `window.__PYREON_DEVTOOLS__`. It turns
// panel requests into hook calls and sends back PLAIN DATA only: every
// message is structured-cloned on its way to the panel, so the panel can
// never hold a page object. Kept free of `window.postMessage` so tests can
// drive it with a real framework hook and an in-memory transport.

/** How many `[Pyreon]` console lines the page keeps for a panel that opens later. */
export const CONSOLE_CAP = 200
/** Mount ids sent per coalesced batch (they only drive the "just mounted" pulse). */
export const MOUNTED_IDS_CAP = 200
const COALESCE_MS = 100
const EVAL_RESULT_MAX = 2000

export interface HookOptions {
  emit(msg: HookMessage): void
  /** `location.host` of the page. */
  host: string
  /** The console whose `warn`/`error` are captured once a panel subscribes. */
  console?: Pick<Console, 'warn' | 'error'>
  /** Event target for uncaught `error` / `unhandledrejection` events. */
  errorTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

export interface Hook {
  handle(msg: PanelMessage): void
  dispose(): void
}

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.name}: ${a.message}`
  try {
    return JSON.stringify(a) ?? String(a)
  } catch {
    return String(a)
  }
}

function now(): number {
  return performance.now()
}

/** `http://localhost:5173/src/Composer.tsx?t=1` → `Composer.tsx`. */
export function fileBase(file: string): string {
  const clean = file.replace(/[?#].*$/, '')
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}

function compactLoc<T extends { loc?: SourceLocation }>(x: T): T {
  return x.loc ? { ...x, loc: { ...x.loc, file: fileBase(x.loc.file) } } : x
}

/**
 * The graph as sent to the panel: source files reduced to their base name
 * (all the panel shows). Dev-server URLs are long, and on a page with
 * 10,000 signals they were most of every snapshot's bytes.
 */
export function compactGraph(graph: ReactiveGraph): ReactiveGraph {
  return { nodes: graph.nodes.map(compactLoc), edges: graph.edges }
}

function compactCause(cause: UpdateCause | null): UpdateCause | null {
  return cause ? { ...cause, target: compactLoc(cause.target), chain: cause.chain.map(compactLoc) } : null
}

export function createHook(devtools: PyreonDevtools, opts: HookOptions): Hook {
  const { emit } = opts

  // ── Component mount/unmount coalescing ──────────────────────────────
  // Both arrays are emptied on every flush, so they hold at most one
  // ~100 ms window of ids (mounted additionally capped).
  let mounted: string[] = []
  let mountedTotal = 0
  let unmounted: string[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    flushTimer = null
    const msg: HookMessage = { type: 'components-changed', mounted, mountedTotal, unmounted }
    mounted = []
    mountedTotal = 0
    unmounted = []
    emit(msg)
  }
  const schedule = (): void => {
    if (flushTimer === null) flushTimer = setTimeout(flush, COALESCE_MS)
  }
  const offMount = devtools.onComponentMount((entry) => {
    mountedTotal++
    if (mounted.length < MOUNTED_IDS_CAP) mounted.push(entry.id)
    schedule()
  })
  const offUnmount = devtools.onComponentUnmount((id) => {
    unmounted.push(id)
    schedule()
  })

  // ── Console capture (installed only once a panel subscribes) ────────
  // Ring buffer of strings, FIFO-evicted at CONSOLE_CAP. `dispose()`
  // restores the original console methods and removes the listeners.
  // New lines are coalesced like mounts, so a warning logged in a loop
  // costs one message per ~100 ms; the pending batch is capped too.
  let consoleRing: ConsoleEntry[] = []
  let consolePending: ConsoleEntry[] = []
  let consoleSeq = 0
  let consoleTimer: ReturnType<typeof setTimeout> | null = null
  let restoreConsole: (() => void) | null = null
  const flushConsole = (): void => {
    consoleTimer = null
    const entries = consolePending
    consolePending = []
    emit({ type: 'console-entries', entries, reset: false })
  }
  const record = (level: ConsoleLevel, text: string): void => {
    if (!text.includes('[Pyreon]')) return
    const entry: ConsoleEntry = { seq: ++consoleSeq, time: Date.now(), level, text }
    consoleRing.push(entry)
    if (consoleRing.length > CONSOLE_CAP) consoleRing.splice(0, consoleRing.length - CONSOLE_CAP)
    consolePending.push(entry)
    if (consolePending.length > CONSOLE_CAP) consolePending.splice(0, consolePending.length - CONSOLE_CAP)
    if (consoleTimer === null) consoleTimer = setTimeout(flushConsole, COALESCE_MS)
  }
  const installConsole = (): void => {
    if (restoreConsole) return
    const target = opts.console
    const errTarget = opts.errorTarget
    const origWarn = target?.warn
    const origError = target?.error
    if (target && origWarn && origError) {
      target.warn = (...args: unknown[]) => {
        origWarn.apply(target, args)
        record('warn', args.map(stringifyArg).join(' '))
      }
      target.error = (...args: unknown[]) => {
        origError.apply(target, args)
        record('error', args.map(stringifyArg).join(' '))
      }
    }
    const onError = (e: Event): void => {
      const err = (e as ErrorEvent).error ?? (e as ErrorEvent).message
      record('error', stringifyArg(err))
    }
    const onRejection = (e: Event): void => {
      record('error', stringifyArg((e as PromiseRejectionEvent).reason))
    }
    errTarget?.addEventListener('error', onError)
    errTarget?.addEventListener('unhandledrejection', onRejection)
    restoreConsole = () => {
      if (target && origWarn && origError) {
        target.warn = origWarn
        target.error = origError
      }
      errTarget?.removeEventListener('error', onError)
      errTarget?.removeEventListener('unhandledrejection', onRejection)
    }
  }

  // ── Component inspector ──────────────────────────────────────────────
  const inspect = (id: string): ComponentDetail | null => {
    const entry = devtools.getAllComponents().find((e) => e.id === id)
    if (!entry) return null
    const el = entry.el
    const reactive = devtools.reactive
    const detail: ComponentDetail = {
      id,
      hasElement: el !== null,
      reads: [],
      cause: null,
      now: now(),
    }
    if (!el || !reactive?.nodesForElement) return detail
    const bound = reactive.nodesForElement(el)
    if (bound.length === 0) return detail
    const graph = reactive.getGraph()
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    let latest: ComponentRead | null = null
    for (const b of bound) {
      const n = byId.get(b.id)
      const read: ComponentRead = {
        id: b.id,
        name: b.name,
        kind: b.kind,
        value: n?.value ?? '',
        fires: n?.fires ?? 0,
        lastFire: n?.lastFire ?? null,
        ...(n?.loc ? { loc: { ...n.loc, file: fileBase(n.loc.file) } } : {}),
      }
      detail.reads.push(read)
      if (read.lastFire !== null && (latest === null || read.lastFire > (latest.lastFire ?? 0))) {
        latest = read
      }
    }
    // The most recent read to fire. `lastFire` alone ties whenever two
    // fires land in the same clock tick (100 µs without cross-origin
    // isolation), which is every synchronous cascade; the fire buffer is
    // in true order, so the newest buffered fire of a read decides.
    const readIds = new Set(detail.reads.map((r) => r.id))
    const fires = reactive.getFires()
    for (let i = fires.length - 1; i >= 0; i--) {
      const fid = (fires[i] as ReactiveFire).id
      if (readIds.has(fid)) {
        latest = detail.reads.find((r) => r.id === fid) ?? latest
        break
      }
    }
    if (latest) detail.cause = compactCause(reactive.getUpdateCause(latest.id))
    return detail
  }

  const handle = (msg: PanelMessage): void => {
    switch (msg.type) {
      case 'hello': {
        emit({
          type: 'pyreon-detected',
          version: devtools.version,
          host: opts.host,
          reactive: !!devtools.reactive,
        })
        break
      }
      case 'get-all': {
        emit({ type: 'all-result', entries: devtools.getAllComponents().map(serialize) })
        break
      }
      case 'highlight': {
        if (msg.id) devtools.highlight(msg.id)
        break
      }
      case 'toggle-overlay': {
        if (msg.enabled) devtools.enableOverlay()
        else devtools.disableOverlay()
        break
      }
      case 'reactive-activate': {
        devtools.reactive?.activate()
        break
      }
      case 'reactive-deactivate': {
        devtools.reactive?.deactivate()
        break
      }
      case 'reactive-poll': {
        const reactive = devtools.reactive
        if (!reactive) break
        emit({
          type: 'reactive-snapshot',
          graph: msg.graph === false ? null : compactGraph(reactive.getGraph()),
          fires: reactive.getFires(),
          now: now(),
        })
        break
      }
      case 'inspect': {
        const detail = inspect(msg.id)
        if (detail) emit({ type: 'component-detail', detail })
        break
      }
      case 'console-subscribe': {
        installConsole()
        emit({ type: 'console-entries', entries: consoleRing.slice(), reset: true })
        break
      }
      case 'console-clear': {
        consoleRing = []
        consolePending = []
        emit({ type: 'console-entries', entries: [], reset: true })
        break
      }
      case 'reactive-eval': {
        // The devtools console is an eval surface by definition; this runs in
        // the inspected page's own world (same trust boundary as the browser
        // console the user already has). Bounded, never throws out.
        let ok = true
        let result: string
        try {
          // indirect eval → runs in global (page) scope
          // oxlint-disable-next-line no-eval -- the console tab evaluates what the developer typed, in their own page
          const r = (0, eval)(msg.expr) as unknown
          result = stringifyArg(r)
        } catch (err) {
          ok = false
          result = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        }
        if (result.length > EVAL_RESULT_MAX) result = `${result.slice(0, EVAL_RESULT_MAX)}…`
        emit({ type: 'reactive-eval-result', ok, result })
        break
      }
    }
  }

  return {
    handle,
    dispose() {
      offMount()
      offUnmount()
      if (flushTimer !== null) clearTimeout(flushTimer)
      if (consoleTimer !== null) clearTimeout(consoleTimer)
      flushTimer = null
      consoleTimer = null
      consolePending = []
      restoreConsole?.()
      restoreConsole = null
      consoleRing = []
    },
  }
}
