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
 *    stays silent on a MISS before any timing runs — for the 12-binding set AND
 *    the 48-binding set. The 48-binding gate is load-bearing: `dispatch (miss,
 *    48)` is a MISS op, so a library that silently registered 0 of the 48
 *    bindings would post a fast "no match" number with nothing to scan. The gate
 *    fires one HIT per modifier prefix, so all four prefixes must really be bound.
 *  - PER-(OP × IMPL) PROCESS ISOLATION (each cell measured in a fresh `bun`
 *    child, `bun <self> <op> <impl>`). Per-OP isolation is NOT enough: with all
 *    four libraries measured inside one child, the library that runs LAST starts
 *    after ~3 × (warmup + 11 × 20k) iterations of foreign allocation and JIT
 *    tiering, and the loader order here put `pyreon` first and `mousetrap` last.
 *    state-tree-bench.ts documents the same shape inflating a competitor ~10×.
 *  - `BENCH_GATE_ONLY=1` runs the correctness gate and exits 0 without timing —
 *    use it to check the gate on a loaded machine, where timings are worthless.
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

// 48-binding scaling set: the same 12 letters under 4 modifier prefixes. Probes
// how dispatch cost scales with registry size — the linear-scan model pays the
// full 48-entry walk on every miss; key-bucketed dispatch pays one Map lookup.
const MOD_PREFIXES = [
  { str: 'ctrl', ev: { ctrl: true } },
  { str: 'alt', ev: { alt: true } },
  { str: 'ctrl+alt', ev: { ctrl: true, alt: true } },
  { str: 'ctrl+shift', ev: { ctrl: true, shift: true } },
] as const

// One HIT event per modifier prefix (all on the same letter `g`, which is in the
// 12-letter set) — the 48-binding correctness gate fires each of these and
// requires exactly one handler invocation, proving all four prefixes are really
// registered before the MISS-op timing trusts a 48-entry registry.
const MOD48_HIT_EVENTS = MOD_PREFIXES.map((m) =>
  fakeEvent({ key: 'g', code: 'KeyG', keyCode: 71, ...m.ev }),
)

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
  /** Sync: mount 48 bindings (12 letters × 4 modifier sets) for the scaling op. */
  mountDispatch48(): Dispatch
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
    mountDispatch48() {
      _resetHotkeys()
      const hits = { n: 0 }
      const cap = captureKeydown(window, () => {
        for (const m of MOD_PREFIXES)
          for (const L of LETTERS) registerHotkey(`${m.str}+${L}`, () => hits.n++)
      })
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
    mountDispatch48() {
      const hits = { n: 0 }
      const map: Record<string, () => void> = {}
      const TK_MODS: Record<string, string> = {
        ctrl: 'Control',
        alt: 'Alt',
        'ctrl+alt': 'Control+Alt',
        'ctrl+shift': 'Control+Shift',
      }
      for (const m of MOD_PREFIXES)
        for (const L of LETTERS) map[`${TK_MODS[m.str]}+${L}`] = () => hits.n++
      const cap = captureKeydown(window, () => tinykeys(window, map))
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
    mountDispatch48() {
      const hits = { n: 0 }
      const cap = captureKeydown(document, () => {
        for (const m of MOD_PREFIXES)
          for (const L of LETTERS) hotkeys(`${m.str}+${L}`, () => hits.n++)
      })
      return {
        handlers: cap.handlers,
        hits,
        teardown: () => {
          for (const m of MOD_PREFIXES)
            for (const L of LETTERS) hotkeys.unbind(`${m.str}+${L}`)
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
    mountDispatch48() {
      Mousetrap.reset()
      const hits = { n: 0 }
      for (const m of MOD_PREFIXES)
        for (const L of LETTERS) Mousetrap.bind(`${m.str}+${L}`, () => hits.n++)
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
  const d = op === 'dispatch (miss, 48)' ? driver.mountDispatch48() : driver.mountDispatch()
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
  'dispatch (miss, 48)': 'no match with 48 bindings — registry-size scaling',
  'register + teardown': 'mount all 12 shortcuts + unmount (idiomatic per lib)',
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: `bun <file> <op> <impl>` → one cell, one library, one process ─
// Only the requested library is LOADED here, so a cell never measures after
// another library's module evaluation, allocation or JIT tiering.
const childOp = process.argv[2]
const childImpl = process.argv[3] as ImplName | undefined
if (childOp) {
  if (!OPS[childOp]) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !IMPLS.includes(childImpl)) throw new Error(`unknown impl: ${childImpl}`)
  const driver = await LOADERS[childImpl]()
  process.stdout.write(JSON.stringify({ ns: measure(buildOp(childOp, driver)) }))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn one child per op ─────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  for (const name of IMPLS) {
    const driver = await LOADERS[name]()

    // ── 12-binding set (the `dispatch (hit)` / `dispatch (miss)` rows) ───────
    const d = driver.mountDispatch()
    assert(d.handlers.length >= 1, `${name}: no keydown handler captured`)
    const before = d.hits.n
    for (const h of d.handlers) h(HIT_EVENTS[10] as FakeKeyEvent) // Ctrl+k
    assert(d.hits.n === before + 1, `${name}: HIT (Ctrl+k) did not fire exactly once`)
    const before2 = d.hits.n
    for (const h of d.handlers) h(MISS_EVENT)
    assert(d.hits.n === before2, `${name}: MISS (Ctrl+z) fired a handler`)
    d.teardown()

    // ── 48-binding set (the `dispatch (miss, 48)` row) ──────────────────────
    // `dispatch (miss, 48)` measures a MISS, so nothing in the timed loop can
    // detect a library that failed to register some (or all) of the 48
    // bindings — it would simply post a fast "nothing to match" number against
    // rivals that really carry 48 entries. Fire one HIT per modifier prefix so
    // every prefix must genuinely be bound before that row is trusted.
    const d48 = driver.mountDispatch48()
    assert(d48.handlers.length >= 1, `${name}: no keydown handler captured (48)`)
    for (let p = 0; p < MOD_PREFIXES.length; p++) {
      const prefix = MOD_PREFIXES[p]!.str
      const ev = MOD48_HIT_EVENTS[p] as FakeKeyEvent
      const b = d48.hits.n
      for (const h of d48.handlers) h(ev)
      assert(
        d48.hits.n === b + 1,
        `${name}: 48-set HIT (${prefix}+g) fired ${d48.hits.n - b}× — expected exactly 1 (binding missing or double-registered)`,
      )
    }
    const b48miss = d48.hits.n
    for (const h of d48.handlers) h(MISS_EVENT) // ctrl+z — unbound in the 48 set too
    assert(d48.hits.n === b48miss, `${name}: 48-set MISS (Ctrl+z) fired a handler`)
    d48.teardown()
  }
  console.log(
    '✓ correctness gate passed — every library fires on a hit (12-set AND all 4 prefixes of the 48-set), stays silent on a miss\n',
  )
}
if (process.env.BENCH_GATE_ONLY) process.exit(0)

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
function runCell(op: string, impl: ImplName): number {
  const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (proc.exitCode !== 0) {
    process.stderr.write(new TextDecoder().decode(proc.stderr))
    throw new Error(`child failed for cell "${op}" × ${impl}`)
  }
  return (JSON.parse(new TextDecoder().decode(proc.stdout)) as { ns: number }).ns
}

const rows: Row[] = []
for (const op of OP_ORDER) {
  const vals = {} as Record<ImplName, number>
  for (const impl of IMPLS) vals[impl] = runCell(op, impl)
  rows.push({ op, vals, note: OPS[op] as string })
}

console.log(
  `=== @pyreon/hotkeys vs tinykeys / hotkeys-js / mousetrap (${process.platform}/${process.arch}, NODE_ENV=production, per-(op×impl) isolated, median ns/op) ===\n`,
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
  `\n(median 11×20k, each (op × library) in its OWN fresh process — no library measures after another's heap/JIT debt. ns machine-dependent — the RATIO is the portable signal. Pyreon + hotkeys-js do MORE per event — a scope + input-focus filter — than tinykeys/mousetrap's bare match; see header for full fair-framing.)`,
)
if (sink === -1) console.log('') // defeat DCE
