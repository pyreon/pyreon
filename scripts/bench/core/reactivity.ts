/**
 * Reactivity benchmark — Pyreon vs the signal libraries people actually pick:
 * Preact Signals, Solid 1 and Solid 2, alien-signals, Vue, MobX, S.js,
 * Angular, the TC39 Signals polyfill and Svelte 5 runes.
 *
 * Usage:
 *   bun scripts/bench/core/reactivity.ts              # 3 rounds, bun (JavaScriptCore)
 *   bun scripts/bench/core/reactivity.ts --runtime node   # children run under node (V8)
 *   bun scripts/bench/core/reactivity.ts --quick      # 1 round, fewer windows (run-all)
 *   bun scripts/bench/core/reactivity.ts --json out.json
 *
 * OBJECTIVITY CONTRACT
 *
 * 1. PROCESS ISOLATION. Every (section × library) cell runs in its OWN child
 *    process. The previous harness ran all three libraries through one shared
 *    `bench(fn)` loop in one process with Pyreon always first — the call site
 *    went polymorphic after the first arm and drift landed on the later arms.
 *    Cell order is reshuffled (seeded) every round.
 *
 * 2. EQUAL WORK. Every arm does the same logical operation. The previous Solid
 *    create+read+write arm wrapped each iteration in `createRoot` + `dispose()`
 *    — an owner scope the other two never paid. `createSignal` needs no owner
 *    (only computations do), so the Solid arm is now a bare signal too.
 *
 * 3. NO DEAD CODE. Every case returns a number that is folded into a sink the
 *    child prints, so no engine can drop an inlinable read.
 *
 * 4. CORRECTNESS GATE. Before timing, each case runs once and its result is
 *    checked against an independently computed expected value. A library that
 *    silently no-ops (e.g. Solid's inert SSR build, see 6) fails the run.
 *
 * 5. STATISTICS. Median ns/op over pooled windows, seeded bootstrap CI95,
 *    and a tie marker (🤝) when a CI overlaps the fastest cell's CI.
 *
 * 6. BUILDS. NODE_ENV=production is set in the environment before any library
 *    loads (children are spawned with it; libraries are imported dynamically).
 *    Pyreon is loaded from its BUILT `lib/` — the artifact users install.
 *    Solid is loaded from its BROWSER build (`solid-js/dist/solid.js`): the
 *    bare specifier resolves to `dist/server.js` under the node condition,
 *    where signals/memos/effects are inert stubs.
 *
 *    Svelte runes are compiled from rune source by the public `svelte/compiler`
 *    `compileModule` (client output) and loaded with the browser build of
 *    `svelte`, for the same reason. Angular runs after `enableProdMode()`,
 *    which is what an Angular production build does.
 *
 * 7a. IDIOMATIC ARMS, SAME OBSERVABLE WORK. Each rival arm uses its library's
 *    documented public API the way its own docs write it. Libraries whose
 *    effects are SCHEDULED (Solid 2, Svelte, Angular, the TC39 polyfill) call
 *    their documented synchronous flush inside the timed run wherever a
 *    synchronous library would have propagated: after every write in the
 *    per-write sections, once after the writes in `batch`. The work the gate
 *    observes (effect runs, values read) is identical across arms.
 *
 * 7. RUNTIME IS REPORTED. Bun is JavaScriptCore; browsers and Node are V8 /
 *    SpiderMonkey. Ratios measured under one engine are not guaranteed to hold
 *    under another, so the banner names the engine and `--runtime node` runs the
 *    same cells under V8.
 */

import { spawnSync } from 'node:child_process'
import { cpus, loadavg, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')

type Lib =
  | 'pyreon'
  | 'pyreonFolded'
  | 'preact'
  | 'solid'
  | 'solid2'
  | 'alien'
  | 'vue'
  | 'mobx'
  | 'sjs'
  | 'angular'
  | 'tc39'
  | 'svelte'
const LIBS: Lib[] = [
  'pyreon',
  'pyreonFolded',
  'preact',
  'solid',
  'solid2',
  'alien',
  'vue',
  'mobx',
  'sjs',
  'angular',
  'tc39',
  'svelte',
]
const LIB_LABEL: Record<Lib, string> = {
  pyreon: 'Pyreon',
  pyreonFolded: 'Pyreon-bundled',
  preact: 'Preact',
  solid: 'Solid',
  solid2: 'Solid 2',
  alien: 'alien-signals',
  vue: 'Vue',
  mobx: 'MobX',
  sjs: 'S.js',
  angular: 'Angular',
  tc39: 'TC39 polyfill',
  svelte: 'Svelte',
}
/**
 * `pyreon` loads the built `lib/` exactly as an UNBUNDLED consumer does, so
 * its `process.env.NODE_ENV` dev gates are live reads — ~1ns under bun, ~145ns
 * under Node, where `process.env` is a native interceptor. `pyreonFolded` is
 * the same `lib/` with every `process.env.NODE_ENV` replaced by
 * `"production"`, which is what every bundler (Vite/Rolldown/esbuild/webpack)
 * does for a browser app. Report both: they answer different questions.
 */
/** The orchestrator creates a private temp dir (mkdtemp) and hands it to children. */
const FOLDED_ENV = 'PYREON_BENCH_FOLDED_DIR'

interface Section {
  id: string
  title: string
  /** Label suffix; the row label is `${LIB_LABEL} ${label}` (run-all parses Pyreon rows). */
  label: string
  libs: Lib[]
}

const DEPTH = 50
const WIDTH = 100
/** Depth of the computed chain behind the equality-cutoff gate in `cutoff`. */
const CUTOFF_DEPTH = 10

const SECTIONS: Section[] = [
  {
    id: 'crw',
    title: 'Signal Create + Read + Write',
    label: 'signal create+read+write',
    libs: LIBS,
  },
  {
    id: 'diamond',
    title: 'Computed Diamond (a→b,c→d, 100 updates)',
    label: 'computed diamond',
    libs: LIBS,
  },
  {
    id: 'effect',
    title: 'Effect Propagation (100 updates)',
    label: 'effect propagation',
    libs: LIBS,
  },
  { id: 'batch', title: 'Batch 50 Signals (1 effect)', label: 'batch 50 signals', libs: LIBS },
  {
    id: 'chain',
    title: `Deep Dependency Chain (depth ${DEPTH}, 100 updates)`,
    label: `chain depth ${DEPTH}`,
    libs: LIBS,
  },
  {
    // The real-app shape of `chain`: something observes the tail.
    id: 'chainObserved',
    title: `Deep Dependency Chain, observed (depth ${DEPTH}, effect at tail, 100 updates)`,
    label: `chain depth ${DEPTH} (observed)`,
    libs: LIBS,
  },
  {
    // signal → gate computed whose VALUE never changes → 10-deep chain → effect.
    // A library with an equality cutoff stops at the gate on every write.
    id: 'cutoff',
    title: `Equality Cutoff (gate → ${CUTOFF_DEPTH}-deep chain → effect, 100 updates)`,
    label: `equality cutoff (${CUTOFF_DEPTH}-deep)`,
    // S.js sits out: its computations have no equality cutoff, so the tail
    // effect re-runs on every write and the case's gate cannot hold.
    libs: LIBS.filter((l) => l !== 'sjs'),
  },
  {
    id: 'wide',
    title: `Wide Fan-Out (1 signal → ${WIDTH} effects)`,
    label: `1→${WIDTH} effects`,
    libs: LIBS,
  },
  {
    id: 'store',
    title: 'Store Read + Write (Pyreon only)',
    label: 'store read+write',
    libs: ['pyreon', 'pyreonFolded'],
  },
]

// ─── Child: build ONE case, gate it, time it ─────────────────────────────────

interface Case {
  run: () => number
  /** Throws when a single run does not produce the independently expected value. */
  check: (first: number) => void
}

function expectEq(what: string, got: number, want: number): void {
  if (got !== want)
    throw new Error(`[reactivity] correctness gate: ${what} returned ${got}, expected ${want}`)
}

async function buildCase(section: string, lib: Lib): Promise<Case> {
  if (lib === 'pyreon' || lib === 'pyreonFolded') {
    const base = lib === 'pyreon' ? resolve(ROOT, 'packages/core/reactivity/lib') : process.env[FOLDED_ENV]!
    const R = await import(pathToFileURL(resolve(base, 'index.js')).href)
    return pyreonCase(section, R)
  }
  switch (lib) {
    case 'preact':
      return preactCase(section, await import('@preact/signals-core'))
    case 'solid':
      // @ts-expect-error — deliberate deep import of Solid's BROWSER build (no types at this path).
      return solidCase(section, await import('solid-js/dist/solid.js'))
    case 'solid2':
      return solid2Case(section, await import('@solidjs/signals'))
    case 'alien':
      return alienCase(section, await import('alien-signals'))
    case 'vue':
      return vueCase(section, await import('@vue/reactivity'))
    case 'mobx': {
      const M = await import('mobx')
      // Documented: lets the plain `box.set(v)` writes below run outside an action.
      M.configure({ enforceActions: 'never' })
      return mobxCase(section, M)
    }
    case 'sjs':
      return sjsCase(section, (await import('s-js')).default)
    case 'angular': {
      const A = await import('@angular/core')
      A.enableProdMode()
      return angularCase(section, A, await import('@angular/core/primitives/signals'))
    }
    case 'tc39':
      return tc39Case(section, (await import('signal-polyfill')).Signal)
    case 'svelte':
      return svelteCase(section, await loadSvelteRunes())
  }
  throw new Error(`unknown lib ${lib}`)
}

/**
 * Compile rune source with the public `svelte/compiler` `compileModule` — what
 * Svelte's own tooling does to a `.svelte.js` file — and load the client
 * output. The compiled module imports `svelte/internal/client` (compiler
 * output, not hand-written) and `svelte`, whose bare specifier resolves to the
 * inert SERVER build under the node condition; both are rewritten to absolute
 * URLs of the client build, as a browser bundler would resolve them.
 */
async function loadSvelteRunes(): Promise<SvelteRunes> {
  const { compileModule } = await import('svelte/compiler')
  const source = `
import { flushSync, untrack } from 'svelte'
export { flushSync, untrack }
export function box(v) {
  let x = $state(v)
  return { get value() { return x }, set value(n) { x = n } }
}
export function derive(fn) {
  const d = $derived.by(fn)
  return { get value() { return d } }
}
export function root(fn) { return $effect.root(fn) }
export function watch(fn) { $effect(fn) }
`
  const { js } = compileModule(source, { generate: 'client', filename: 'bench.svelte.js' })
  const svelteDir = dirname(fileURLToPath(import.meta.resolve('svelte/package.json')))
  const url = (rel: string): string => pathToFileURL(join(svelteDir, rel)).href
  const code = js.code
    .replace(/from ['"]svelte\/internal\/client['"]/g, `from '${url('src/internal/client/index.js')}'`)
    .replace(/from ['"]svelte['"]/g, `from '${url('src/index-client.js')}'`)
  if (/from ['"]svelte/.test(code)) throw new Error('[reactivity] unexpected svelte import in compiled runes')
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-bench-svelte-'))
  try {
    const file = join(dir, 'bench.svelte.js')
    writeFileSync(file, code)
    return (await import(pathToFileURL(file).href)) as SvelteRunes
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

interface SvelteBox {
  value: number
}
interface SvelteRunes {
  flushSync: () => void
  untrack: <T>(fn: () => T) => T
  box: (v: number) => SvelteBox
  derive: (fn: () => number) => { readonly value: number }
  root: (fn: () => void) => () => void
  watch: (fn: () => void) => void
}

const SUM_0_99 = 4950
/**
 * `chainObserved` writes base+1 … base+100 (base = writes so far) and returns
 * the sum the tail effect saw minus 100·base: Σ(j + DEPTH) for j = 1…100.
 */
const CHAIN_OBSERVED_SUM = 5050 + 100 * DEPTH

// biome-ignore lint: dynamic module shape
function pyreonCase(section: string, R: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = R.signal(0)
          const a = s()
          s.set(1)
          return a + s()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = R.signal(0)
      const b = R.computed(() => a() * 2)
      const c = R.computed(() => a() * 3)
      const d = R.computed(() => b() + c())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.set(i)
            acc += d()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = R.signal(-1)
      let runs = 0
      R.effect(() => {
        s()
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.set(s.peek() + 1)
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => R.signal(i))
      let sum = 0
      let runs = 0
      R.effect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i]()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          R.batch(() => {
            for (let i = 0; i < 50; i++) signals[i].set(i + k)
          })
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = R.signal(0)
      let current = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = R.computed(() => prev() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.set(i)
            acc += tail()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = R.signal(0)
      let current = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = R.computed(() => prev() + 1)
      }
      const tail = current
      let seen = 0
      R.effect(() => {
        seen += tail()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) source.set(++k)
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = R.signal(0)
      let current = R.computed(() => (s() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = R.computed(() => prev() + 1)
      }
      const tail = current
      let runs = 0
      R.effect(() => {
        tail()
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.set(++k)
          return runs - before + R.untrack(tail)
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = R.signal(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        R.effect(() => {
          s()
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.set(s.peek() + 1)
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
    case 'store': {
      const store = R.createStore({ count: 0, items: [1, 2, 3], nested: { x: 0, y: 0 } })
      return {
        run: () => {
          store.count = store.count + 1
          store.nested.x = store.count
          store.items[0] = store.count
          return store.items[0] - store.nested.x + 1
        },
        check: (v) => expectEq('store', v, 1),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

// biome-ignore lint: dynamic module shape
function preactCase(section: string, P: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = P.signal(0)
          const a = s.value
          s.value = 1
          return a + s.value
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = P.signal(0)
      const b = P.computed(() => a.value * 2)
      const c = P.computed(() => a.value * 3)
      const d = P.computed(() => b.value + c.value)
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.value = i
            acc += d.value
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = P.signal(-1)
      let runs = 0
      P.effect(() => {
        s.value
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.value = s.peek() + 1
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => P.signal(i))
      let sum = 0
      let runs = 0
      P.effect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i].value
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          P.batch(() => {
            for (let i = 0; i < 50; i++) signals[i].value = i + k
          })
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = P.signal(0)
      let current: { readonly value: number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = P.computed(() => prev.value + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.value = i
            acc += tail.value
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = P.signal(0)
      let current: { readonly value: number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = P.computed(() => prev.value + 1)
      }
      const tail = current
      let seen = 0
      P.effect(() => {
        seen += tail.value
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) source.value = ++k
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = P.signal(0)
      let current: { readonly value: number; peek(): number } = P.computed(() => (s.value >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = P.computed(() => prev.value + 1)
      }
      const tail = current
      let runs = 0
      P.effect(() => {
        tail.value
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.value = ++k
          return runs - before + tail.peek()
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = P.signal(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        P.effect(() => {
          s.value
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.value = s.peek() + 1
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

// biome-ignore lint: dynamic module shape
function solidCase(section: string, S: any): Case {
  // Computations are created inside a root that is never disposed (the child
  // exits after measuring). Solid DEFERS a createEffect's first run until the
  // root body returns, so the case closures are returned OUT of the root and
  // timed after it — timing inside the root would notify unsubscribed effects.
  let out!: Case
  S.createRoot(() => {
    out = solidCaseInRoot(section, S)
  })
  return out
}

// biome-ignore lint: dynamic module shape
function solidCaseInRoot(section: string, S: any): Case {
  switch (section) {
    case 'crw':
      // No createRoot per iteration: createSignal needs no owner.
      return {
        run: () => {
          const [get, set] = S.createSignal(0)
          const a = get()
          set(1)
          return a + get()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const [a, setA] = S.createSignal(0)
      const b = S.createMemo(() => a() * 2)
      const c = S.createMemo(() => a() * 3)
      const d = S.createMemo(() => b() + c())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            setA(i)
            acc += d()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const [s, set] = S.createSignal(-1)
      let runs = 0
      S.createEffect(() => {
        s()
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) set(S.untrack(s) + 1)
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => S.createSignal(i))
      let sum = 0
      let runs = 0
      S.createEffect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i][0]()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          S.batch(() => {
            for (let i = 0; i < 50; i++) signals[i][1](i + k)
          })
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const [source, setSource] = S.createSignal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = S.createMemo(() => prev() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            setSource(i)
            acc += tail()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const [source, setSource] = S.createSignal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = S.createMemo(() => prev() + 1)
      }
      const tail = current
      let seen = 0
      S.createEffect(() => {
        seen += tail()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) setSource(++k)
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const [s, set] = S.createSignal(0)
      let current: () => number = S.createMemo(() => (s() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = S.createMemo(() => prev() + 1)
      }
      const tail = current
      let runs = 0
      S.createEffect(() => {
        tail()
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) set(++k)
          return runs - before + S.untrack(tail)
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const [s, set] = S.createSignal(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        S.createEffect(() => {
          s()
          runs++
        })
      return {
        run: () => {
          const before = runs
          set(S.untrack(s) + 1)
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * Solid 2 (`@solidjs/signals`). Writes are batched until `flush()`: a read
 * right after a write returns the previous value, and effects run on flush.
 * `flush()` is therefore called wherever the arm needs the new value
 * synchronously. `createEffect(compute, effect)` is Solid 2's split effect.
 */
// biome-ignore lint: dynamic module shape
function solid2Case(section: string, S: any): Case {
  let out!: Case
  S.createRoot(() => {
    out = solid2CaseInRoot(section, S)
  })
  S.flush() // run the effects created above once, as a mount would
  return out
}

// biome-ignore lint: dynamic module shape
function solid2CaseInRoot(section: string, S: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const [get, set] = S.createSignal(0)
          const a = get()
          set(1)
          S.flush()
          return a + get()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const [a, setA] = S.createSignal(0)
      const b = S.createMemo(() => a() * 2)
      const c = S.createMemo(() => a() * 3)
      const d = S.createMemo(() => b() + c())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            setA(i)
            S.flush()
            acc += d()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const [s, set] = S.createSignal(-1)
      let runs = 0
      S.createEffect(() => s(), () => {
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            set(S.untrack(s) + 1)
            S.flush()
          }
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      // Writes are batched by default; one flush settles them.
      const signals = Array.from({ length: 50 }, (_, i) => S.createSignal(i))
      let sum = 0
      let runs = 0
      S.createEffect(
        () => {
          let t = 0
          for (let i = 0; i < 50; i++) t += signals[i][0]()
          return t
        },
        (t: number) => {
          sum = t
          runs++
        },
      )
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          for (let i = 0; i < 50; i++) signals[i][1](i + k)
          S.flush()
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const [source, setSource] = S.createSignal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = S.createMemo(() => prev() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            setSource(i)
            S.flush()
            acc += tail()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const [source, setSource] = S.createSignal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = S.createMemo(() => prev() + 1)
      }
      const tail = current
      let seen = 0
      S.createEffect(() => tail(), (v: number) => {
        seen += v
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) {
            setSource(++k)
            S.flush()
          }
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const [s, set] = S.createSignal(0)
      let current: () => number = S.createMemo(() => (s() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = S.createMemo(() => prev() + 1)
      }
      const tail = current
      let runs = 0
      S.createEffect(() => tail(), () => {
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            set(++k)
            S.flush()
          }
          return runs - before + S.untrack(tail)
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const [s, set] = S.createSignal(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        S.createEffect(() => s(), () => {
          runs++
        })
      return {
        run: () => {
          const before = runs
          set(S.untrack(s) + 1)
          S.flush()
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/** alien-signals 3: `s()` reads, `s(v)` writes, effects are synchronous. */
// biome-ignore lint: dynamic module shape
function alienCase(section: string, A: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = A.signal(0)
          const a = s()
          s(1)
          return a + s()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = A.signal(0)
      const b = A.computed(() => a() * 2)
      const c = A.computed(() => a() * 3)
      const d = A.computed(() => b() + c())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a(i)
            acc += d()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = A.signal(-1)
      let runs = 0
      A.effect(() => {
        s()
        runs++
      })
      return {
        run: () => {
          const before = runs
          // Outside an effect a read does not track: no peek needed.
          for (let i = 0; i < 100; i++) s(s() + 1)
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => A.signal(i))
      let sum = 0
      let runs = 0
      A.effect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i]()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          A.startBatch()
          for (let i = 0; i < 50; i++) signals[i](i + k)
          A.endBatch()
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = A.signal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = A.computed(() => prev() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source(i)
            acc += tail()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = A.signal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = A.computed(() => prev() + 1)
      }
      const tail = current
      let seen = 0
      A.effect(() => {
        seen += tail()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) source(++k)
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = A.signal(0)
      let current: () => number = A.computed(() => (s() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = A.computed(() => prev() + 1)
      }
      const tail = current
      let runs = 0
      A.effect(() => {
        tail()
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s(++k)
          return runs - before + tail()
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = A.signal(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        A.effect(() => {
          s()
          runs++
        })
      return {
        run: () => {
          const before = runs
          s(s() + 1)
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * `@vue/reactivity`: `ref` (what Vue's docs recommend for a primitive),
 * `computed`, and `effect`, which runs synchronously. Vue has NO public batch
 * API (`startBatch`/`endBatch` are internal and absent from its typings), so
 * the `batch` arm writes unbatched and its effect runs once per write.
 */
// biome-ignore lint: dynamic module shape
function vueCase(section: string, V: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = V.ref(0)
          const a = s.value
          s.value = 1
          return a + s.value
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = V.ref(0)
      const b = V.computed(() => a.value * 2)
      const c = V.computed(() => a.value * 3)
      const d = V.computed(() => b.value + c.value)
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.value = i
            acc += d.value
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = V.ref(-1)
      let runs = 0
      V.effect(() => {
        s.value
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.value = s.value + 1
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => V.ref(i))
      let sum = 0
      let runs = 0
      V.effect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i].value
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          for (let i = 0; i < 50; i++) signals[i].value = i + k
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        // No public batch: one effect run per write (see the doc comment).
        check: (v) => expectEq('batch (unbatched: 50 effect runs, sum correct)', v, 50),
      }
    }
    case 'chain': {
      const source = V.ref(0)
      let current: { readonly value: number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = V.computed(() => prev.value + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.value = i
            acc += tail.value
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = V.ref(0)
      let current: { readonly value: number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = V.computed(() => prev.value + 1)
      }
      const tail = current
      let seen = 0
      V.effect(() => {
        seen += tail.value
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) source.value = ++k
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = V.ref(0)
      let current: { readonly value: number } = V.computed(() => (s.value >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = V.computed(() => prev.value + 1)
      }
      const tail = current
      let runs = 0
      V.effect(() => {
        tail.value
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.value = ++k
          return runs - before + tail.value
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = V.ref(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        V.effect(() => {
          s.value
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.value = s.value + 1
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * MobX: `observable.box`, `computed`, `autorun` (synchronous), `runInAction`
 * for the batch. A computed read outside any reaction is not cached by MobX
 * (it recomputes per read) — that is MobX's documented behaviour, kept as is.
 */
// biome-ignore lint: dynamic module shape
function mobxCase(section: string, M: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = M.observable.box(0)
          const a = s.get()
          s.set(1)
          return a + s.get()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = M.observable.box(0)
      const b = M.computed(() => a.get() * 2)
      const c = M.computed(() => a.get() * 3)
      const d = M.computed(() => b.get() + c.get())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.set(i)
            acc += d.get()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = M.observable.box(-1)
      let runs = 0
      M.autorun(() => {
        s.get()
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.set(s.get() + 1)
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => M.observable.box(i))
      let sum = 0
      let runs = 0
      M.autorun(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i].get()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          M.runInAction(() => {
            for (let i = 0; i < 50; i++) signals[i].set(i + k)
          })
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = M.observable.box(0)
      let current: { get(): number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = M.computed(() => prev.get() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.set(i)
            acc += tail.get()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = M.observable.box(0)
      let current: { get(): number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = M.computed(() => prev.get() + 1)
      }
      const tail = current
      let seen = 0
      M.autorun(() => {
        seen += tail.get()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) source.set(++k)
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = M.observable.box(0)
      let current: { get(): number } = M.computed(() => (s.get() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = M.computed(() => prev.get() + 1)
      }
      const tail = current
      let runs = 0
      M.autorun(() => {
        tail.get()
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s.set(++k)
          return runs - before + tail.get()
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = M.observable.box(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        M.autorun(() => {
          s.get()
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.set(s.get() + 1)
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * S.js: `S.data` (read `s()`, write `s(v)`), `S(fn)` for every computation —
 * S computations are eager, so a "computed" and an "effect" are the same
 * primitive — owned by an `S.root`, and `S.freeze` for the batch. S.js sits
 * out `cutoff`: its computations have no equality cutoff.
 */
// biome-ignore lint: dynamic module shape
function sjsCase(section: string, S: any): Case {
  return S.root(() => sjsCaseInRoot(section, S))
}

// biome-ignore lint: dynamic module shape
function sjsCaseInRoot(section: string, S: any): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = S.data(0)
          const a = s()
          s(1)
          return a + s()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = S.data(0)
      const b = S(() => a() * 2)
      const c = S(() => a() * 3)
      const d = S(() => b() + c())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a(i)
            acc += d()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = S.data(-1)
      let runs = 0
      S(() => {
        s()
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) s(s() + 1)
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => S.data(i))
      let sum = 0
      let runs = 0
      S(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i]()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          S.freeze(() => {
            for (let i = 0; i < 50; i++) signals[i](i + k)
          })
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = S.data(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = S(() => prev() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source(i)
            acc += tail()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = S.data(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = S(() => prev() + 1)
      }
      const tail = current
      let seen = 0
      S(() => {
        seen += tail()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) source(++k)
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'wide': {
      const s = S.data(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        S(() => {
          s()
          runs++
        })
      return {
        run: () => {
          const before = runs
          s(s() + 1)
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * Angular signals: `signal`/`computed`/`untracked` from `@angular/core` are
 * standalone. Angular's `effect()` needs an injector and is scheduled through
 * change detection, so effects use `createWatch` from the public
 * `@angular/core/primitives/signals` entry — the primitive `effect()` is built
 * on — with a scheduler that queues the watch and a synchronous `flush()`.
 * Angular has no batch API; writes before a flush coalesce into one run.
 */
// biome-ignore lint: dynamic module shape
function angularCase(section: string, A: any, P: any): Case {
  // biome-ignore lint: dynamic module shape
  const queue: any[] = []
  const flush = (): void => {
    for (let i = 0; i < queue.length; i++) queue[i].run()
    queue.length = 0
  }
  const effect = (fn: () => void): void => {
    // biome-ignore lint: dynamic module shape
    P.createWatch(fn, (w: any) => queue.push(w), false).notify()
  }
  const out = angularCaseWith(section, A, effect, flush)
  flush() // first run of the effects created above, as a mount would
  return out
}

function angularCaseWith(
  section: string,
  // biome-ignore lint: dynamic module shape
  A: any,
  effect: (fn: () => void) => void,
  flush: () => void,
): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = A.signal(0)
          const a = s()
          s.set(1)
          return a + s()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = A.signal(0)
      const b = A.computed(() => a() * 2)
      const c = A.computed(() => a() * 3)
      const d = A.computed(() => b() + c())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.set(i)
            acc += d()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = A.signal(-1)
      let runs = 0
      effect(() => {
        s()
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            s.set(A.untracked(s) + 1)
            flush()
          }
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => A.signal(i))
      let sum = 0
      let runs = 0
      effect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i]()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          for (let i = 0; i < 50; i++) signals[i].set(i + k)
          flush()
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = A.signal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = A.computed(() => prev() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.set(i)
            acc += tail()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = A.signal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = A.computed(() => prev() + 1)
      }
      const tail = current
      let seen = 0
      effect(() => {
        seen += tail()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) {
            source.set(++k)
            flush()
          }
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = A.signal(0)
      let current: () => number = A.computed(() => (s() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = A.computed(() => prev() + 1)
      }
      const tail = current
      let runs = 0
      effect(() => {
        tail()
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            s.set(++k)
            flush()
          }
          return runs - before + A.untracked(tail)
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = A.signal(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        effect(() => {
          s()
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.set(A.untracked(s) + 1)
          flush()
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * TC39 Signals polyfill: `Signal.State` / `Signal.Computed`, and the effect
 * from the polyfill README — a `Computed` watched by one shared
 * `Signal.subtle.Watcher` — with the README's `queueMicrotask` replaced by a
 * flag and a synchronous `flush()` that re-reads the pending effects.
 */
// biome-ignore lint: dynamic module shape
function tc39Case(section: string, Signal: any): Case {
  let needsFlush = false
  const watcher = new Signal.subtle.Watcher(() => {
    needsFlush = true
  })
  const flush = (): void => {
    if (!needsFlush) return
    needsFlush = false
    for (const s of watcher.getPending()) s.get()
    watcher.watch()
  }
  const effect = (fn: () => void): void => {
    const c = new Signal.Computed(fn)
    watcher.watch(c)
    c.get()
  }
  return tc39CaseWith(section, Signal, effect, flush)
}

function tc39CaseWith(
  section: string,
  // biome-ignore lint: dynamic module shape
  Signal: any,
  effect: (fn: () => void) => void,
  flush: () => void,
): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = new Signal.State(0)
          const a = s.get()
          s.set(1)
          return a + s.get()
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = new Signal.State(0)
      const b = new Signal.Computed(() => a.get() * 2)
      const c = new Signal.Computed(() => a.get() * 3)
      const d = new Signal.Computed(() => b.get() + c.get())
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.set(i)
            acc += d.get()
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = new Signal.State(-1)
      let runs = 0
      effect(() => {
        s.get()
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            s.set(s.get() + 1)
            flush()
          }
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => new Signal.State(i))
      let sum = 0
      let runs = 0
      effect(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i].get()
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          for (let i = 0; i < 50; i++) signals[i].set(i + k)
          flush()
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = new Signal.State(0)
      let current: { get(): number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = new Signal.Computed(() => prev.get() + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.set(i)
            acc += tail.get()
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = new Signal.State(0)
      let current: { get(): number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = new Signal.Computed(() => prev.get() + 1)
      }
      const tail = current
      let seen = 0
      effect(() => {
        seen += tail.get()
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) {
            source.set(++k)
            flush()
          }
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = new Signal.State(0)
      let current: { get(): number } = new Signal.Computed(() => (s.get() >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = new Signal.Computed(() => prev.get() + 1)
      }
      const tail = current
      let runs = 0
      effect(() => {
        tail.get()
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            s.set(++k)
            flush()
          }
          return runs - before + tail.get()
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = new Signal.State(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        effect(() => {
          s.get()
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.set(s.get() + 1)
          flush()
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

/**
 * Svelte 5 runes (compiled by `loadSvelteRunes`): `$state` boxes, `$derived.by`,
 * `$effect` under `$effect.root`, and `flushSync()` — Svelte's documented
 * synchronous flush — since `$effect` is scheduled. A `$derived` read is
 * pull-based and needs no flush. Svelte has no batch API; writes before a
 * flush coalesce into one effect run.
 */
function svelteCase(section: string, R: SvelteRunes): Case {
  let out!: Case
  R.root(() => {
    out = svelteCaseInRoot(section, R)
  })
  R.flushSync() // first run of the effects created above, as a mount would
  return out
}

function svelteCaseInRoot(section: string, R: SvelteRunes): Case {
  switch (section) {
    case 'crw':
      return {
        run: () => {
          const s = R.box(0)
          const a = s.value
          s.value = 1
          return a + s.value
        },
        check: (v) => expectEq('crw', v, 1),
      }
    case 'diamond': {
      const a = R.box(0)
      const b = R.derive(() => a.value * 2)
      const c = R.derive(() => a.value * 3)
      const d = R.derive(() => b.value + c.value)
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            a.value = i
            acc += d.value
          }
          return acc
        },
        check: (v) => expectEq('diamond', v, 5 * SUM_0_99),
      }
    }
    case 'effect': {
      const s = R.box(-1)
      let runs = 0
      R.watch(() => {
        s.value
        runs++
      })
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            s.value = s.value + 1
            R.flushSync()
          }
          return runs - before
        },
        check: (v) => expectEq('effect runs', v, 100),
      }
    }
    case 'batch': {
      const signals = Array.from({ length: 50 }, (_, i) => R.box(i))
      let sum = 0
      let runs = 0
      R.watch(() => {
        let t = 0
        for (let i = 0; i < 50; i++) t += signals[i]!.value
        sum = t
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          k++
          for (let i = 0; i < 50; i++) signals[i]!.value = i + k
          R.flushSync()
          return runs - before + (sum === 1225 + 50 * k ? 0 : 1000)
        },
        check: (v) => expectEq('batch (effect runs once, sum correct)', v, 1),
      }
    }
    case 'chain': {
      const source = R.box(0)
      let current: { readonly value: number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = R.derive(() => prev.value + 1)
      }
      const tail = current
      return {
        run: () => {
          let acc = 0
          for (let i = 0; i < 100; i++) {
            source.value = i
            acc += tail.value
          }
          return acc
        },
        check: (v) => expectEq('chain', v, SUM_0_99 + 100 * DEPTH),
      }
    }
    case 'chainObserved': {
      const source = R.box(0)
      let current: { readonly value: number } = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = R.derive(() => prev.value + 1)
      }
      const tail = current
      let seen = 0
      R.watch(() => {
        seen += tail.value
      })
      let k = 0
      return {
        run: () => {
          const base = k
          const before = seen
          for (let i = 0; i < 100; i++) {
            source.value = ++k
            R.flushSync()
          }
          return seen - before - 100 * base
        },
        check: (v) => expectEq('chainObserved (sum seen by the tail effect)', v, CHAIN_OBSERVED_SUM),
      }
    }
    case 'cutoff': {
      const s = R.box(0)
      let current: { readonly value: number } = R.derive(() => (s.value >= 0 ? 0 : 1))
      for (let i = 0; i < CUTOFF_DEPTH; i++) {
        const prev = current
        current = R.derive(() => prev.value + 1)
      }
      const tail = current
      let runs = 0
      R.watch(() => {
        tail.value
        runs++
      })
      let k = 0
      return {
        run: () => {
          const before = runs
          for (let i = 0; i < 100; i++) {
            s.value = ++k
            R.flushSync()
          }
          return runs - before + R.untrack(() => tail.value)
        },
        check: (v) => expectEq('cutoff (0 effect runs + tail value)', v, CUTOFF_DEPTH),
      }
    }
    case 'wide': {
      const s = R.box(0)
      let runs = 0
      for (let i = 0; i < WIDTH; i++)
        R.watch(() => {
          s.value
          runs++
        })
      return {
        run: () => {
          const before = runs
          s.value = s.value + 1
          R.flushSync()
          return runs - before
        },
        check: (v) => expectEq('wide effect runs', v, WIDTH),
      }
    }
  }
  throw new Error(`unknown section ${section}`)
}

async function childMain(cell: string, windows: number): Promise<void> {
  const [section, lib] = cell.split('|') as [string, Lib]
  const c = await buildCase(section, lib)
  c.check(c.run())
  // Calibrate: how many calls fill ~50ms?
  let iters = 1
  for (;;) {
    const t0 = performance.now()
    for (let i = 0; i < iters; i++) c.run()
    if (performance.now() - t0 >= 50) break
    iters *= 2
  }
  // Warmup ~400ms so every tier has compiled before the first window.
  const warmEnd = performance.now() + 400
  while (performance.now() < warmEnd) for (let i = 0; i < iters; i++) c.run()
  let sink = 0
  const samples: number[] = []
  for (let w = 0; w < windows; w++) {
    const t0 = performance.now()
    for (let i = 0; i < iters; i++) sink += c.run()
    samples.push(((performance.now() - t0) * 1e6) / iters)
  }
  process.stdout.write(`${JSON.stringify({ samples, sink })}\n`)
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function median(xs: number[]): number {
  const c = [...xs].sort((x, y) => x - y)
  const m = c.length >> 1
  return c.length % 2 ? c[m]! : (c[m - 1]! + c[m]!) / 2
}
function bootstrapCI95(xs: number[], resamples = 2000): [number, number] {
  const rnd = mulberry32(0x5eed)
  const meds: number[] = []
  for (let r = 0; r < resamples; r++) {
    const pick: number[] = []
    for (let i = 0; i < xs.length; i++) pick.push(xs[Math.floor(rnd() * xs.length)]!)
    meds.push(median(pick))
  }
  meds.sort((x, y) => x - y)
  return [meds[Math.floor(resamples * 0.025)]!, meds[Math.floor(resamples * 0.975)]!]
}
function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function engineOf(runtime: string): string {
  const v = spawnSync(runtime, ['--version'], { encoding: 'utf-8' }).stdout.trim()
  return runtime === 'bun' ? `bun ${v} (JavaScriptCore)` : `node ${v} (V8)`
}

/**
 * Copy `lib/` into a fresh private temp dir (mkdtemp — unpredictable name,
 * owner-only), folding `process.env.NODE_ENV` the way a bundler's define does.
 * Reads always come from the ORIGINAL lib/ and writes go to new paths, so no
 * file is checked and then re-opened.
 */
function buildFoldedLib(): string {
  const out = mkdtempSync(join(tmpdir(), 'pyreon-bench-reactivity-'))
  const copy = (from: string, to: string): void => {
    for (const e of readdirSync(from, { withFileTypes: true })) {
      const src = join(from, e.name)
      const dst = join(to, e.name)
      if (e.isDirectory()) {
        mkdirSync(dst)
        copy(src, dst)
      } else if (e.isFile()) {
        const text = readFileSync(src, 'utf-8')
        writeFileSync(dst, e.name.endsWith('.js') ? text.replaceAll('process.env.NODE_ENV', '"production"') : text)
      }
    }
  }
  copy(resolve(ROOT, 'packages/core/reactivity/lib'), out)
  return out
}

async function orchestrate(): Promise<void> {
  const foldedDir = buildFoldedLib()
  try {
    await measureAll(foldedDir)
  } finally {
    rmSync(foldedDir, { recursive: true, force: true })
  }
}

async function measureAll(foldedDir: string): Promise<void> {
  const argv = process.argv.slice(2)
  const quick = argv.includes('--quick')
  const rtIdx = argv.indexOf('--runtime')
  const runtime =
    rtIdx !== -1
      ? argv[rtIdx + 1]!
      : typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
        ? 'bun'
        : 'node'
  const jsonIdx = argv.indexOf('--json')
  const rounds = quick ? 1 : 3
  const windows = quick ? 5 : 10

  const cells: string[] = []
  for (const s of SECTIONS) for (const l of s.libs) cells.push(`${s.id}|${l}`)

  const load0 = loadavg()
  console.log(`Reactivity Benchmark — ${engineOf(runtime)}`)
  console.log(`Pyreon vs ${LIBS.filter((l) => !l.startsWith('pyreon')).map((l) => LIB_LABEL[l]).join(' · ')}`)
  console.log(
    `${cpus()[0]?.model ?? 'cpu?'} ×${cpus().length} · load ${load0.map((x) => x.toFixed(2)).join(' ')} · ` +
      `${rounds} round(s) × ${windows} windows per cell, one process per cell, order reshuffled per round`,
  )
  console.log('='.repeat(70))

  const pooled = new Map<string, number[]>(cells.map((c) => [c, []]))
  const rnd = mulberry32(0xbe1c4)
  const self = fileURLToPath(import.meta.url)
  for (let r = 0; r < rounds; r++) {
    for (const cell of shuffle(cells, rnd)) {
      const args =
        runtime === 'node'
          ? ['--no-warnings', self, '--cell', cell, String(windows)]
          : [self, '--cell', cell, String(windows)]
      const p = spawnSync(runtime, args, {
        cwd: ROOT,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production', [FOLDED_ENV]: foldedDir },
        maxBuffer: 16 * 1024 * 1024,
      })
      if (p.status !== 0) {
        console.error(p.stdout, p.stderr)
        throw new Error(`[reactivity] cell ${cell} failed (exit ${p.status})`)
      }
      const line = p.stdout.trim().split('\n').pop()!
      pooled.get(cell)!.push(...(JSON.parse(line) as { samples: number[] }).samples)
    }
  }

  const json: Record<string, unknown> = {}
  // Widest row label + 2, so run-all's `label  ops  ns` parser always sees a 2-space gap.
  const LABEL_W = Math.max(36, ...SECTIONS.flatMap((s) => s.libs.map((l) => `${LIB_LABEL[l]} ${s.label}`.length + 2)))
  for (const s of SECTIONS) {
    const stats = s.libs.map((l) => {
      const xs = pooled.get(`${s.id}|${l}`)!
      const [lo, hi] = bootstrapCI95(xs)
      return { lib: l, label: `${LIB_LABEL[l]} ${s.label}`, med: median(xs), lo, hi, n: xs.length }
    })
    const best = stats.reduce((a, b) => (b.med < a.med ? b : a))
    const pyreon = stats.find((x) => x.lib === 'pyreon')!
    console.log(`\n── ${s.title} ${'─'.repeat(Math.max(0, 64 - s.title.length - 4))}`)
    // Legacy 3-column rows (run-all.ts parses these): label · ops/sec · median ns/op
    console.log(`${'test'.padEnd(LABEL_W)}${'ops/sec'.padStart(14)}${'avg ns/op'.padStart(14)}`)
    console.log('-'.repeat(LABEL_W + 28))
    for (const x of stats)
      console.log(
        `${x.label.padEnd(LABEL_W)}${Math.round(1e9 / x.med)
          .toLocaleString('en-US')
          .padStart(14)}${Math.round(x.med).toLocaleString('en-US').padStart(14)}`,
      )
    if (stats.length > 1) {
      for (const x of stats) {
        const tie = x !== best && x.lo <= best.hi && best.lo <= x.hi
        const mark = x === best ? '🥇' : tie ? '🤝' : '  '
        console.log(
          `  ${mark} ${LIB_LABEL[x.lib].padEnd(14)} CI95 [${x.lo.toFixed(1)} – ${x.hi.toFixed(1)}] ns  n=${x.n}  ${(x.med / pyreon.med).toFixed(2)}× Pyreon`,
        )
      }
    }
    json[s.id] = stats
  }
  const load1 = loadavg()
  console.log(
    `\nload after: ${load1.map((x) => x.toFixed(2)).join(' ')}  (🥇 fastest median · 🤝 CI95 overlaps fastest)\n`,
  )
  if (jsonIdx !== -1)
    writeFileSync(
      argv[jsonIdx + 1]!,
      JSON.stringify(
        {
          engine: engineOf(runtime),
          cpu: cpus()[0]?.model,
          loadBefore: load0,
          loadAfter: load1,
          rounds,
          windows,
          sections: json,
        },
        null,
        2,
      ),
    )
}

const cellIdx = process.argv.indexOf('--cell')
if (cellIdx !== -1)
  await childMain(process.argv[cellIdx + 1]!, Number(process.argv[cellIdx + 2] ?? 10))
else await orchestrate()
