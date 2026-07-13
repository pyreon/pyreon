/**
 * @pyreon/hotkeys vs tinykeys / hotkeys-js / mousetrap — objective head-to-head.
 *
 * Run: `bun run bench:keys` (sets NODE_ENV=production).
 *
 * WHAT IT MEASURES — and, honestly, what it DOESN'T:
 *  - `dispatch (hit)` — given 12 registered `Ctrl+<letter>` shortcuts, how long
 *    the library's own keydown handler takes to find + fire the matching one.
 *  - `dispatch (miss)` — same set, a keystroke that matches NOTHING (the common
 *    case: every non-shortcut keypress pays the full scan).
 *  - `register + teardown` — mount all 12 shortcuts and tear them down again
 *    (realistic app mount/unmount cost), idiomatic per library.
 *
 * The dispatch ops call each library's INSTALLED keydown handler DIRECTLY with a
 * synthetic event — bypassing happy-dom's `dispatchEvent` machinery, whose
 * constant overhead would otherwise be added equally to every library and
 * compress the ratios. This isolates the library's match cost, the portable
 * signal. Module loading is done once, OUTSIDE the timed loop; the measured work
 * is synchronous.
 *
 * OBJECTIVITY CONTRACT (mirrors permissions-bench.ts / store-bench.ts):
 *  - NODE_ENV=production forced below AND by the npm script's shell (imports
 *    hoist, so the shell env is the load-bearing part) — Pyreon's dev-mode
 *    reactive-devtools registry otherwise dominates.
 *  - Competitors resolve to their real published builds (tinykeys / hotkeys-js /
 *    mousetrap), loaded under happy-dom for `window` / `document` / KeyboardEvent.
 *  - CORRECTNESS GATE asserts every library's captured handler fires on a HIT and
 *    stays silent on a MISS before any timing runs.
 *  - PER-OP PROCESS ISOLATION (each op measured in a fresh `bun` child).
 *  - VARIED INPUTS — dispatch rotates through 12 distinct events — to defeat JSC
 *    loop-invariant hoisting on constant inputs.
 *  - A `sink` defeats dead-code elimination.
 *
 * FAIR-FRAMING (author-judge disclosed): the libraries do DIFFERENT amounts of
 * work per event. Pyreon and hotkeys-js check a scope + input-focus filter on
 * every entry (context-aware shortcuts); tinykeys and mousetrap do a bare combo
 * match with no scope model. So tinykeys/mousetrap doing LESS is expected — the
 * headline is that Pyreon's scope-aware dispatch stays competitive with the bare
 * matchers, not that it "beats" a library that omits the feature. tinykeys also
 * has NO incremental bind/unbind (you re-init the whole map), so its register
 * number reflects a one-shot handler build + one window listener attach/detach.
 *
 * HARNESS RUNG (disclosed): in-process duration-loop with a big warmup + median
 * over repeated windows + per-op process isolation (permissions-bench style) —
 * NOT the bootstrap-CI95 rig. Good enough for relative order of magnitude; treat
 * sub-2x gaps as ties. ns is machine-dependent — the RATIO is portable.
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

// ─── synthetic events ────────────────────────────────────────────────────────
interface FakeKeyEvent {
  type: string
  key: string
  code: string
  keyCode: number
  which: number
  charCode: number
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  target: unknown
  getModifierState(m: string): boolean
  preventDefault(): void
  stopPropagation(): void
  stopImmediatePropagation(): void
  composedPath(): unknown[]
}

function fakeEvent(o: {
  key: string
  code: string
  keyCode: number
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}): FakeKeyEvent {
  const ctrl = !!o.ctrl
  const shift = !!o.shift
  const alt = !!o.alt
  const meta = !!o.meta
  return {
    type: 'keydown',
    key: o.key,
    code: o.code,
    keyCode: o.keyCode,
    which: o.keyCode,
    charCode: 0,
    ctrlKey: ctrl,
    shiftKey: shift,
    altKey: alt,
    metaKey: meta,
    target: document.body,
    getModifierState(m) {
      return m === 'Control'
        ? ctrl
        : m === 'Shift'
          ? shift
          : m === 'Alt'
            ? alt
            : m === 'Meta'
              ? meta
              : false
    },
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
    composedPath() {
      return [document.body]
    },
  }
}

// 12 shortcuts: Ctrl+a … Ctrl+l. HIT events rotate over all 12; MISS is Ctrl+z
// (never bound). Uppercase letter char codes (65…76) are the legacy keyCodes.
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
const HIT_EVENTS = LETTERS.map((L) =>
  fakeEvent({
    key: L,
    code: `Key${L.toUpperCase()}`,
    keyCode: L.toUpperCase().charCodeAt(0),
    ctrl: true,
  }),
)
const MISS_EVENT = fakeEvent({ key: 'z', code: 'KeyZ', keyCode: 90, ctrl: true })

// ─── per-library driver (modules loaded ONCE, ops are sync) ──────────────────
type Handler = (e: FakeKeyEvent) => void
interface Dispatch {
  handlers: Handler[]
  hits: { n: number }
  teardown: () => void
}
interface LibDriver {
  /** Sync: mount 12 bindings, return the installed keydown handler(s) + hit counter. */
  mountDispatch(): Dispatch
  /** Sync: mount all 12 + tear them all down (one full app-mount cycle). */
  cycle(): void
}

function captureKeydown<T>(target: EventTarget, setup: () => T): { handlers: Handler[]; value: T } {
  const handlers: Handler[] = []
  const orig = target.addEventListener.bind(target)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(target as any).addEventListener = (t: string, fn: Handler, o: unknown) => {
    if (t === 'keydown') handlers.push(fn)
    return orig(t, fn as never, o as never)
  }
  const value = setup()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(target as any).addEventListener = orig
  return { handlers, value }
}

async function loadPyreon(): Promise<LibDriver> {
  const { registerHotkey, _resetHotkeys } = await import('../src/registry')
  return {
    mountDispatch() {
      _resetHotkeys()
      const hits = { n: 0 }
      const cap = captureKeydown(window, () =>
        LETTERS.map((L) => registerHotkey(`ctrl+${L}`, () => hits.n++)),
      )
      return { handlers: cap.handlers, hits, teardown: () => _resetHotkeys() }
    },
    cycle() {
      const uns = LETTERS.map((L) => registerHotkey(`ctrl+${L}`, () => {}))
      for (const u of uns) u()
    },
  }
}

async function loadTinykeys(): Promise<LibDriver> {
  const { tinykeys } = await import('tinykeys')
  const build = (fn: () => void) => {
    const map: Record<string, () => void> = {}
    for (const L of LETTERS) map[`Control+${L}`] = fn
    return map
  }
  return {
    mountDispatch() {
      const hits = { n: 0 }
      const cap = captureKeydown(window, () => tinykeys(window, build(() => hits.n++)))
      return { handlers: cap.handlers, hits, teardown: () => cap.value() }
    },
    cycle() {
      const unsub = tinykeys(window, build(() => {}))
      unsub()
    },
  }
}

async function loadHotkeysJs(): Promise<LibDriver> {
  const hotkeys = (await import('hotkeys-js')).default
  return {
    mountDispatch() {
      const hits = { n: 0 }
      const cap = captureKeydown(document, () => {
        for (const L of LETTERS) hotkeys(`ctrl+${L}`, () => hits.n++)
      })
      return {
        handlers: cap.handlers,
        hits,
        teardown: () => {
          for (const L of LETTERS) hotkeys.unbind(`ctrl+${L}`)
        },
      }
    },
    cycle() {
      for (const L of LETTERS) hotkeys(`ctrl+${L}`, () => {})
      for (const L of LETTERS) hotkeys.unbind(`ctrl+${L}`)
    },
  }
}

async function loadMousetrap(): Promise<LibDriver> {
  // Mousetrap attaches its document keydown listener at construction (module
  // load). The attach happens during async module evaluation, so we must keep
  // addEventListener wrapped ACROSS the await, not just around the sync call.
  const handlers: Handler[] = []
  const orig = document.addEventListener.bind(document)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(document as any).addEventListener = (t: string, fn: Handler, o: unknown) => {
    if (t === 'keydown') handlers.push(fn)
    return orig(t, fn as never, o as never)
  }
  const Mousetrap = (await import('mousetrap')).default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(document as any).addEventListener = orig
  return {
    mountDispatch() {
      Mousetrap.reset()
      const hits = { n: 0 }
      for (const L of LETTERS) Mousetrap.bind(`ctrl+${L}`, () => hits.n++)
      return { handlers, hits, teardown: () => Mousetrap.reset() }
    },
    cycle() {
      for (const L of LETTERS) Mousetrap.bind(`ctrl+${L}`, () => {})
      for (const L of LETTERS) Mousetrap.unbind(`ctrl+${L}`)
    },
  }
}

const LOADERS = {
  pyreon: loadPyreon,
  tinykeys: loadTinykeys,
  'hotkeys-js': loadHotkeysJs,
  mousetrap: loadMousetrap,
} as const
type ImplName = keyof typeof LOADERS
const IMPLS = Object.keys(LOADERS) as ImplName[]

// ─── measurement ─────────────────────────────────────────────────────────────
const now = () => Number(process.hrtime.bigint())
function measure(
  fn: (i: number) => void,
  { warmup = 3_000, iters = 20_000, runs = 11 } = {},
): number {
  for (let i = 0; i < warmup; i++) fn(i)
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn(i)
    samples.push((now() - t0) / iters)
  }
  samples.sort((a, b) => a - b)
  return samples[samples.length >> 1] as number
}

let sink = 0

function buildOp(op: string, driver: LibDriver): (i: number) => void {
  if (op === 'register + teardown') {
    return () => driver.cycle()
  }
  const d = driver.mountDispatch()
  const evs = op === 'dispatch (hit)' ? HIT_EVENTS : [MISS_EVENT]
  const n = evs.length
  return (i) => {
    const ev = evs[i % n] as FakeKeyEvent
    for (const h of d.handlers) h(ev)
    sink += d.hits.n & 1
  }
}

const OPS: Record<string, string> = {
  'dispatch (hit)': 'find + fire the matching handler among 12 bindings',
  'dispatch (miss)': 'no match — every non-shortcut keypress pays this',
  'register + teardown': 'mount all 12 shortcuts + unmount (idiomatic per lib)',
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode ──────────────────────────────────────────────────────────────
const childOp = process.argv[2]
if (childOp) {
  const out: Record<string, number> = {}
  for (const name of IMPLS) {
    const driver = await LOADERS[name]()
    out[name] = measure(buildOp(childOp, driver))
  }
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn one child per op ─────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  for (const name of IMPLS) {
    const driver = await LOADERS[name]()
    const d = driver.mountDispatch()
    assert(d.handlers.length >= 1, `${name}: no keydown handler captured`)
    const before = d.hits.n
    for (const h of d.handlers) h(HIT_EVENTS[10] as FakeKeyEvent) // Ctrl+k
    assert(d.hits.n === before + 1, `${name}: HIT (Ctrl+k) did not fire exactly once`)
    const before2 = d.hits.n
    for (const h of d.handlers) h(MISS_EVENT)
    assert(d.hits.n === before2, `${name}: MISS (Ctrl+z) fired a handler`)
    d.teardown()
  }
  console.log('✓ correctness gate passed — every library fires on a hit, stays silent on a miss\n')
}

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}
interface Row {
  op: string
  vals: Record<ImplName, number>
  note: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (proc.exitCode !== 0) {
    process.stderr.write(new TextDecoder().decode(proc.stderr))
    throw new Error(`child failed for op "${op}"`)
  }
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<ImplName, number>
  rows.push({ op, vals: r, note: OPS[op] as string })
}

console.log(
  `=== @pyreon/hotkeys vs tinykeys / hotkeys-js / mousetrap (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(
  `${pad('op', 22)} ${padL('pyreon', 9)} ${padL('tinykeys', 9)} ${padL('hotkeys-js', 11)} ${padL('mousetrap', 10)}   note`,
)
console.log('─'.repeat(122))
for (const r of rows) {
  console.log(
    `${pad(r.op, 22)} ${padL(r.vals.pyreon.toFixed(0), 9)} ${padL(r.vals.tinykeys.toFixed(0), 9)} ${padL(r.vals['hotkeys-js'].toFixed(0), 11)} ${padL(r.vals.mousetrap.toFixed(0), 10)}   ${r.note}`,
  )
}
console.log(
  `\n(median 11×20k, each op in a fresh process. ns machine-dependent — the RATIO is the portable signal. Pyreon + hotkeys-js do MORE per event — a scope + input-focus filter — than tinykeys/mousetrap's bare match; see header for full fair-framing.)`,
)
if (sink === -1) console.log('') // defeat DCE
