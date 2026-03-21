/**
 * Reactivity benchmark — measures ops/sec for signal, computed, effect,
 * batch, store, and dependency graph propagation.
 *
 * Compares:
 *   - @pyreon/reactivity  — Pyreon's signal system
 *   - @preact/signals-core — Preact Signals (widely used baseline)
 *   - solid-js             — Solid's fine-grained reactivity
 *
 * Usage: bun scripts/bench-reactivity.ts
 */

import {
  batch as pyreonBatch,
  computed as pyreonComputed,
  effect as pyreonEffect,
  signal as pyreonSignal,
  createStore as pyreonStore,
} from "../packages/reactivity/src/index"

import {
  batch as preactBatch,
  computed as preactComputed,
  effect as preactEffect,
  signal as preactSignal,
} from "@preact/signals-core"

import {
  batch as solidBatch,
  createEffect as solidEffect,
  createMemo as solidMemo,
  createRoot as solidRoot,
  createSignal as solidSignal,
} from "solid-js"

// ─── Benchmark harness ───────────────────────────────────────────────────────

interface BenchResult {
  label: string
  opsPerSec: number
  avgNs: number
}

function bench(label: string, fn: () => void, durationMs = 2000): BenchResult {
  // Warmup
  for (let i = 0; i < 1000; i++) fn()
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    fn()
    ops++
  }
  const elapsed = performance.now() - start
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1_000_000),
  }
}

function printSection(title: string, results: BenchResult[]) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 64 - title.length - 4))}`)
  console.log(`${"test".padEnd(36)}${"ops/sec".padStart(14)}${"avg ns/op".padStart(14)}`)
  console.log("-".repeat(64))
  for (const r of results) {
    console.log(
      `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
    )
  }
}

// ─── Signal create + read + write ────────────────────────────────────────────

function benchSignalCRW() {
  const results: BenchResult[] = []

  results.push(
    bench("Pyreon signal create+read+write", () => {
      const s = pyreonSignal(0)
      s()
      s.set(1)
      s()
    }),
  )

  results.push(
    bench("Preact signal create+read+write", () => {
      const s = preactSignal(0)
      s.value
      s.value = 1
      s.value
    }),
  )

  results.push(
    bench("Solid signal create+read+write", () => {
      solidRoot((dispose) => {
        const [get, set] = solidSignal(0)
        get()
        set(1)
        get()
        dispose()
      })
    }),
  )

  return results
}

// ─── Computed (diamond dependency) ────────────────────────────────────────────

function benchComputed() {
  const results: BenchResult[] = []

  // Pyreon
  {
    const a = pyreonSignal(0)
    const b = pyreonComputed(() => a() * 2)
    const c = pyreonComputed(() => a() * 3)
    const d = pyreonComputed(() => b() + c())
    results.push(
      bench("Pyreon computed diamond", () => {
        for (let i = 0; i < 100; i++) {
          a.set(i)
          d()
        }
      }),
    )
  }

  // Preact
  {
    const a = preactSignal(0)
    const b = preactComputed(() => a.value * 2)
    const c = preactComputed(() => a.value * 3)
    const d = preactComputed(() => b.value + c.value)
    results.push(
      bench("Preact computed diamond", () => {
        for (let i = 0; i < 100; i++) {
          a.value = i
          d.value
        }
      }),
    )
  }

  // Solid
  {
    solidRoot((dispose) => {
      const [a, setA] = solidSignal(0)
      const b = solidMemo(() => a() * 2)
      const c = solidMemo(() => a() * 3)
      const d = solidMemo(() => b() + c())
      results.push(
        bench("Solid computed diamond", () => {
          for (let i = 0; i < 100; i++) {
            setA(i)
            d()
          }
        }),
      )
      dispose()
    })
  }

  return results
}

// ─── Effect propagation ──────────────────────────────────────────────────────

function benchEffect() {
  const results: BenchResult[] = []

  // Pyreon
  {
    const s = pyreonSignal(0)
    let sink = 0
    const fx = pyreonEffect(() => {
      sink = s()
    })
    results.push(
      bench("Pyreon effect propagation", () => {
        for (let i = 0; i < 100; i++) s.set(i)
      }),
    )
    fx.dispose()
    void sink
  }

  // Preact
  {
    const s = preactSignal(0)
    let sink = 0
    const dispose = preactEffect(() => {
      sink = s.value
    })
    results.push(
      bench("Preact effect propagation", () => {
        for (let i = 0; i < 100; i++) (s.value = i)
      }),
    )
    dispose()
    void sink
  }

  // Solid
  {
    solidRoot((dispose) => {
      const [s, setS] = solidSignal(0)
      let sink = 0
      solidEffect(() => {
        sink = s()
      })
      results.push(
        bench("Solid effect propagation", () => {
          for (let i = 0; i < 100; i++) setS(i)
        }),
      )
      dispose()
      void sink
    })
  }

  return results
}

// ─── Batch updates ───────────────────────────────────────────────────────────

function benchBatch() {
  const results: BenchResult[] = []

  // Pyreon
  {
    const signals = Array.from({ length: 50 }, (_, i) => pyreonSignal(i))
    let sink = 0
    const fx = pyreonEffect(() => {
      sink = signals.reduce((sum, s) => sum + s(), 0)
    })
    results.push(
      bench("Pyreon batch 50 signals", () => {
        pyreonBatch(() => {
          for (let i = 0; i < 50; i++) signals[i]!.set(i + Math.random())
        })
      }),
    )
    fx.dispose()
    void sink
  }

  // Preact
  {
    const signals = Array.from({ length: 50 }, (_, i) => preactSignal(i))
    let sink = 0
    const dispose = preactEffect(() => {
      sink = signals.reduce((sum, s) => sum + s.value, 0)
    })
    results.push(
      bench("Preact batch 50 signals", () => {
        preactBatch(() => {
          for (let i = 0; i < 50; i++) (signals[i]!.value = i + Math.random())
        })
      }),
    )
    dispose()
    void sink
  }

  // Solid
  {
    solidRoot((dispose) => {
      const signals = Array.from({ length: 50 }, (_, i) => solidSignal(i))
      let sink = 0
      solidEffect(() => {
        sink = signals.reduce((sum, [get]) => sum + get(), 0)
      })
      results.push(
        bench("Solid batch 50 signals", () => {
          solidBatch(() => {
            for (let i = 0; i < 50; i++) signals[i]![1](i + Math.random())
          })
        }),
      )
      dispose()
      void sink
    })
  }

  return results
}

// ─── Deep dependency chain ───────────────────────────────────────────────────

function benchDeepChain() {
  const results: BenchResult[] = []
  const DEPTH = 50

  // Pyreon
  {
    const source = pyreonSignal(0)
    let current: () => number = source
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = pyreonComputed(() => prev() + 1)
    }
    const tail = current
    results.push(
      bench(`Pyreon chain depth ${DEPTH}`, () => {
        for (let i = 0; i < 100; i++) {
          source.set(i)
          tail()
        }
      }),
    )
  }

  // Preact
  {
    const source = preactSignal(0)
    let current: { readonly value: number } = source
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = preactComputed(() => prev.value + 1)
    }
    const tail = current
    results.push(
      bench(`Preact chain depth ${DEPTH}`, () => {
        for (let i = 0; i < 100; i++) {
          source.value = i
          tail.value
        }
      }),
    )
  }

  // Solid
  {
    solidRoot((dispose) => {
      const [source, setSource] = solidSignal(0)
      let current: () => number = source
      for (let i = 0; i < DEPTH; i++) {
        const prev = current
        current = solidMemo(() => prev() + 1)
      }
      const tail = current
      results.push(
        bench(`Solid chain depth ${DEPTH}`, () => {
          for (let i = 0; i < 100; i++) {
            setSource(i)
            tail()
          }
        }),
      )
      dispose()
    })
  }

  return results
}

// ─── Store (Pyreon only) ─────────────────────────────────────────────────────

function benchStore() {
  const results: BenchResult[] = []

  const store = pyreonStore({ count: 0, items: [1, 2, 3], nested: { x: 0, y: 0 } })
  results.push(
    bench("Pyreon store read+write", () => {
      store.count = store.count + 1
      store.nested.x = store.count
      store.items[0] = store.count
    }),
  )

  return results
}

// ─── Wide fan-out (1 signal → N effects) ──────────────────────────────────────

function benchWide() {
  const results: BenchResult[] = []
  const WIDTH = 100

  // Pyreon
  {
    const s = pyreonSignal(0)
    let sink = 0
    const effects: { dispose(): void }[] = []
    for (let i = 0; i < WIDTH; i++) {
      effects.push(pyreonEffect(() => { sink += s() }))
    }
    results.push(
      bench(`Pyreon 1→${WIDTH} effects`, () => {
        s.set(s() + 1)
      }),
    )
    for (const fx of effects) fx.dispose()
    void sink
  }

  // Preact
  {
    const s = preactSignal(0)
    let sink = 0
    const disposers: (() => void)[] = []
    for (let i = 0; i < WIDTH; i++) {
      disposers.push(preactEffect(() => { sink += s.value }))
    }
    results.push(
      bench(`Preact 1→${WIDTH} effects`, () => {
        s.value = s.value + 1
      }),
    )
    for (const d of disposers) d()
    void sink
  }

  // Solid
  {
    solidRoot((dispose) => {
      const [s, setS] = solidSignal(0)
      let sink = 0
      for (let i = 0; i < WIDTH; i++) {
        solidEffect(() => { sink += s() })
      }
      results.push(
        bench(`Solid 1→${WIDTH} effects`, () => {
          setS((v) => v + 1)
        }),
      )
      dispose()
      void sink
    })
  }

  return results
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log("Reactivity Benchmark (Bun)")
console.log("Pyreon vs Preact Signals vs Solid")
console.log(`${"=".repeat(70)}\n`)

printSection("Signal Create + Read + Write", benchSignalCRW())
printSection("Computed Diamond (a→b,c→d, 100 updates)", benchComputed())
printSection("Effect Propagation (100 updates)", benchEffect())
printSection("Batch 50 Signals (1 effect)", benchBatch())
printSection(`Deep Dependency Chain (depth 50, 100 updates)`, benchDeepChain())
printSection("Wide Fan-Out (1 signal → 100 effects)", benchWide())
printSection("Store Read + Write (Pyreon only)", benchStore())

console.log()
