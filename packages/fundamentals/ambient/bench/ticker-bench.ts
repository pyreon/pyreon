/**
 * Cost of one ticker tick with 1,000 `useNow` readers: publish a new instant and run every dependent effect.
 *
 * Run: `bun run bench` (from packages/fundamentals/ambient). NODE_ENV=production, no forced GC, never concurrently with
 * another bench, and only under a quiet machine (1-minute load below ~5): the script prints the load and refuses to call
 * the numbers valid above it. Bun / JavaScriptCore.
 */
import { loadavg } from 'node:os'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// `isServer` is decided when @pyreon/reactivity loads: a DOM must exist first, or `useNow` (rightly) starts no ticker.
GlobalRegistrator.register()
const { effect, effectScope } = await import('@pyreon/reactivity')
const { _fireAll, _resetClockState } = await import('../src/clock')
const { setClock, useNow } = await import('../src/index')

const READERS = 1000
const ITERATIONS = 2000
let t = Date.UTC(2026, 10, 18, 12)
let sink = 0

setClock(() => t)
const scope = effectScope()

scope.runInScope(() => {
  for (let i = 0; i < READERS; i++) {
    const n = useNow({ every: 'second' })

    effect(() => {
      sink += n() & 1
    })
  }
})

// Correctness gate: a tick must reach a reader's effect exactly once.
let runs = 0
const probe = effectScope()

probe.runInScope(() => {
  const n = useNow({ every: 'second' })

  effect(() => {
    n()
    runs++
  })
})

const base = runs

t += 1000
_fireAll()
if (runs - base !== 1) throw new Error(`[Pyreon] bench: a tick must run a reader's effect once, ran ${runs - base} times`)

const samples: number[] = []

for (let round = 0; round < 11; round++) {
  const start = performance.now()

  for (let i = 0; i < ITERATIONS; i++) {
    t += 1000
    _fireAll()
  }
  samples.push(((performance.now() - start) * 1e6) / ITERATIONS)
}

samples.sort((a, b) => a - b)
const load = loadavg()[0] ?? 0

console.log(`1,000 useNow readers: one tick runs ${READERS} effects in median ${(samples[5]! / 1000).toFixed(1)} us (${(samples[5]! / READERS).toFixed(0)} ns per reader), range ${(samples[0]! / 1000).toFixed(1)}-${(samples[10]! / 1000).toFixed(1)} us`)
console.log(`load ${load.toFixed(2)} ${load < 5 ? '(valid conditions)' : '(ABOVE the gate of 5: indicative only, do not publish)'} sink=${sink}`)
scope.stop()
probe.stop()
_resetClockState()
