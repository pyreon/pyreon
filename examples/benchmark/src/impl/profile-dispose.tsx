/**
 * Subscription-teardown profiling target — the instrument for the `dispose 500
 * rows` loss measured in the effect-heavy-list scenario (Pyreon 172µs vs Solid
 * 40µs).
 *
 * It mounts an ABLATION LADDER: seven arms that each strictly remove one layer
 * from the benched shape, so the differences between adjacent arms decompose
 * the total into named costs. A CPU profile alone gives function self-time,
 * which attributes but does not ADD UP; the ladder is what makes the model
 * falsifiable — if the components do not sum to the measured total, the model
 * is wrong and the cost is somewhere nobody has looked.
 *
 * Arms (all 500 rows, all disposed by the same `mount()` teardown the bench
 * calls):
 *
 *   A_full     component + effect() + reactive text bind   ← the benched shape
 *   B_noEffect component +            reactive text bind
 *   C_noBind   component + effect() + STATIC text
 *   D_bare     component +            STATIC text
 *   E_noComp   NO components — 500 plain <span> vnodes via mount()
 *   F_scope    NO DOM — 500 bare effect()s in one EffectScope, scope.stop()
 *   G_solid    SolidJS's equivalent, for the mechanism comparison
 *
 * Differences:
 *   A − B  = the per-row `effect()` (create + dispose)
 *   A − C  = the per-row reactive text bind
 *   D − E  = the component wrapper (scope alloc + unmount closure + hooks)
 *   E      = Pyreon's DOM mount/cleanup floor
 *   F      = pure reactivity teardown, DOM excluded
 *
 * NOT part of the timed fair bench — measurement scaffolding only, loaded
 * exclusively behind `?profileDispose=1`.
 */
import { For as _For, h as ph, type VNodeChild } from '@pyreon/core'
import { effect, effectScope, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { createComponent, createEffect, createSignal } from 'solid-js'
import { insert, render as solidRender, template } from 'solid-js/web'

const ROWS = 500

interface Sink {
  values: number[]
  runs: number
}
const makeSink = (): Sink => ({ values: new Array<number>(ROWS).fill(-1), runs: 0 })

// ─── Pyreon row components — one per ablation arm ────────────────────────────
// Each is its OWN component function so the compiler lowers each shape
// independently and no arm pays for a branch another arm needs.

function RowFull(props: { value: () => number; index: number; sink: Sink }): VNodeChild {
  effect(() => {
    const v = props.value()
    props.sink.values[props.index] = v
    props.sink.runs++
  })
  return <span class="fx-row">{() => props.value()}</span>
}

function RowNoEffect(props: { value: () => number }): VNodeChild {
  return <span class="fx-row">{() => props.value()}</span>
}

function RowNoBind(props: { value: () => number; index: number; sink: Sink }): VNodeChild {
  effect(() => {
    const v = props.value()
    props.sink.values[props.index] = v
    props.sink.runs++
  })
  return <span class="fx-row">x</span>
}

function RowBare(): VNodeChild {
  return <span class="fx-row">x</span>
}

// Arms H and I deliberately REUSE `RowNoEffect` and `RowFull` above — the same
// component, the same `value` prop name, the same `{() => props.value()}` bind.
// The ONLY difference is what gets passed: arms B/A pass `() => s()`, a plain
// wrapper; arms H/I pass the signal `s` itself.
//
// That isolation is the whole point. `_bindText` routes through the O(1) `_d1`
// direct-updater tier when its source exposes `.direct` — i.e. when it IS a
// signal or computed — and falls back to a fully-tracked `renderEffect` (whose
// teardown is a hashed `Set.delete`) when handed an opaque callable. A Pyreon
// signal already satisfies the `() => number` contract the shared row shape
// asks for, so the wrapper is not required by the contract; it only strips the
// capability. If the census flips 500 -> 0 with the component held constant,
// the cost is a fast-path MISS, not an architectural floor.

// ─── Arm builders ────────────────────────────────────────────────────────────

type Arm = { mount: () => () => void; name: string }

export function setupDisposeProfile(hosts: Record<string, HTMLElement>): void {
  const sink = makeSink()
  const sigs = Array.from({ length: ROWS }, () => signal(-1))
  const rows = sigs.map((s) => ({ value: () => s() }))

  const solidSigs = Array.from({ length: ROWS }, () => createSignal(-1))
  const solidTmpl = template('<span class="fx-row"></span>')

  const arms: Record<string, Arm> = {
    A_full: {
      name: 'A_full',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) {
          children.push(
            ph(RowFull as never, { value: (rows[i] as { value: () => number }).value, index: i, sink }),
          )
        }
        return mount(ph('div', { class: 'fx-list' }, children), hosts.A as HTMLElement)
      },
    },
    B_noEffect: {
      name: 'B_noEffect',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) {
          children.push(ph(RowNoEffect as never, { value: (rows[i] as { value: () => number }).value }))
        }
        return mount(ph('div', { class: 'fx-list' }, children), hosts.B as HTMLElement)
      },
    },
    C_noBind: {
      name: 'C_noBind',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) {
          children.push(
            ph(RowNoBind as never, { value: (rows[i] as { value: () => number }).value, index: i, sink }),
          )
        }
        return mount(ph('div', { class: 'fx-list' }, children), hosts.C as HTMLElement)
      },
    },
    D_bare: {
      name: 'D_bare',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) children.push(ph(RowBare as never, {}))
        return mount(ph('div', { class: 'fx-list' }, children), hosts.D as HTMLElement)
      },
    },
    E_noComp: {
      name: 'E_noComp',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) children.push(ph('span', { class: 'fx-row' }, 'x'))
        return mount(ph('div', { class: 'fx-list' }, children), hosts.E as HTMLElement)
      },
    },
    F_scope: {
      name: 'F_scope',
      mount: () => {
        // Pure reactivity: 500 effects in ONE scope, no components, no DOM.
        const scope = effectScope()
        scope.runInScope(() => {
          for (let i = 0; i < ROWS; i++) {
            const get = (rows[i] as { value: () => number }).value
            effect(() => {
              const v = get()
              sink.values[i] = v
              sink.runs++
            })
          }
        })
        return () => scope.stop()
      },
    },
    // Same component as arm B; the prop is the SIGNAL, not a wrapper.
    H_directBind: {
      name: 'H_directBind',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) {
          children.push(ph(RowNoEffect as never, { value: sigs[i] }))
        }
        return mount(ph('div', { class: 'fx-list' }, children), hosts.H as HTMLElement)
      },
    },
    // Same component as arm A; the prop is the SIGNAL, not a wrapper.
    I_directFull: {
      name: 'I_directFull',
      mount: () => {
        const children: VNodeChild[] = []
        for (let i = 0; i < ROWS; i++) {
          children.push(ph(RowFull as never, { value: sigs[i], index: i, sink }))
        }
        return mount(ph('div', { class: 'fx-list' }, children), hosts.I as HTMLElement)
      },
    },
    G_solid: {
      name: 'G_solid',
      mount: () => {
        function SolidRow(props: { index: number }): HTMLElement {
          const [get] = solidSigs[props.index] as [() => number, (v: number) => void]
          const span = solidTmpl() as HTMLElement
          insert(span, get)
          createEffect(() => {
            const v = get()
            sink.values[props.index] = v
            sink.runs++
          })
          return span
        }
        return solidRender(() => {
          const list = document.createElement('div')
          list.className = 'fx-list'
          for (let i = 0; i < ROWS; i++) {
            list.appendChild(createComponent(SolidRow, { index: i }) as HTMLElement)
          }
          return list
        }, hosts.G as HTMLElement)
      },
    },
  }

  // NAMED function statements per arm so the CPU profile carries stable
  // functionNames the driver keys subtree attribution on. A shared generic
  // `dispose(arm)` would put every arm under ONE frame and make the
  // attribution useless — the whole point is per-arm subtrees.
  let liveA: (() => void) | null = null
  let liveB: (() => void) | null = null
  let liveC: (() => void) | null = null
  let liveD: (() => void) | null = null
  let liveE: (() => void) | null = null
  let liveF: (() => void) | null = null
  let liveG: (() => void) | null = null
  let liveH: (() => void) | null = null
  let liveI: (() => void) | null = null

  function __mountA(): void { liveA = (arms.A_full as Arm).mount() }
  function __disposeA(): void { (liveA as () => void)(); liveA = null }
  function __mountB(): void { liveB = (arms.B_noEffect as Arm).mount() }
  function __disposeB(): void { (liveB as () => void)(); liveB = null }
  function __mountC(): void { liveC = (arms.C_noBind as Arm).mount() }
  function __disposeC(): void { (liveC as () => void)(); liveC = null }
  function __mountD(): void { liveD = (arms.D_bare as Arm).mount() }
  function __disposeD(): void { (liveD as () => void)(); liveD = null }
  function __mountE(): void { liveE = (arms.E_noComp as Arm).mount() }
  function __disposeE(): void { (liveE as () => void)(); liveE = null }
  function __mountF(): void { liveF = (arms.F_scope as Arm).mount() }
  function __disposeF(): void { (liveF as () => void)(); liveF = null }
  function __mountG(): void { liveG = (arms.G_solid as Arm).mount() }
  function __disposeG(): void { (liveG as () => void)(); liveG = null }
  function __mountH(): void { liveH = (arms.H_directBind as Arm).mount() }
  function __disposeH(): void { (liveH as () => void)(); liveH = null }
  function __mountI(): void { liveI = (arms.I_directFull as Arm).mount() }
  function __disposeI(): void { (liveI as () => void)(); liveI = null }

  const mounters: Record<string, () => void> = {
    A: __mountA, B: __mountB, C: __mountC, D: __mountD, E: __mountE, F: __mountF, G: __mountG,
    H: __mountH, I: __mountI,
  }
  const disposers: Record<string, () => void> = {
    A: __disposeA, B: __disposeB, C: __disposeC, D: __disposeD, E: __disposeE, F: __disposeF, G: __disposeG,
    H: __disposeH, I: __disposeI,
  }

  ;(globalThis as Record<string, unknown>).__disposeBench = {
    mount: (arm: string) => (mounters[arm] as () => void)(),
    dispose: (arm: string) => (disposers[arm] as () => void)(),
    /** Rows currently in an arm's host — the correctness gate for mount/dispose. */
    rowCount: (arm: string) =>
      arm === 'F' ? sink.runs : (hosts[arm] as HTMLElement).querySelectorAll('span.fx-row').length,
    /**
     * REACTIVITY gate — load-bearing, not decoration.
     *
     * The census reads arm H as performing ZERO hashed deletes, and the
     * conclusion drawn from that (the text bind reached the O(1) `_d1` direct
     * tier) is indistinguishable from the failure mode where the bind never
     * subscribed at all. A binding that is simply DEAD also deletes nothing.
     * So every arm that claims a reactive text bind must prove it renders the
     * CURRENT value after a tick; an arm with static text reports null and is
     * exempt by construction.
     */
    boundText: (arm: string) => {
      const el = (hosts[arm] as HTMLElement).querySelector('span.fx-row')
      return el ? el.textContent : null
    },
    /** Drive every arm's subscriptions so a teardown has real state to tear down. */
    tick: (v: number) => {
      for (let i = 0; i < ROWS; i++) {
        ;(sigs[i] as ReturnType<typeof signal<number>>).set(v + i)
        ;(solidSigs[i] as [() => number, (n: number) => void])[1](v + i)
      }
    },
    arms: Object.keys(mounters),
  }
}
