/**
 * Cost of one ticker tick with 1,000 `useRelative` readers (each recomputes its calendar-true distance) on one shared ticker.
 * Run: `bun run bench:clocks`. Same rules as the ambient ticker bench: NODE_ENV=production, no forced GC, never concurrent,
 * quiet machine only; it prints the load and says when the numbers are not valid.
 */
import { loadavg } from 'node:os'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// `isServer` is decided when @pyreon/reactivity loads: a DOM must exist first, or the hooks (rightly) start no ticker.
GlobalRegistrator.register()
const { _fireAll, _resetClockState } = await import('@pyreon/ambient/testing')
const { effect, effectScope } = await import('@pyreon/reactivity')
const { setClock, useRelative } = await import('../src/index')

const READERS = 1000
const ITERATIONS = 1000
let t = Date.UTC(2026, 10, 18, 12)
let sink = 0

setClock(() => t)
const scope = effectScope()

scope.runInScope(() => {
  for (let i = 0; i < READERS; i++) {
    const r = useRelative(t - 20_000 - i * 10, { zone: 'UTC' })

    effect(() => {
      sink += r().value
    })
  }
})

const first = sink

t += 1000
_fireAll()
if (sink === first) throw new Error('[Pyreon] bench: a tick must change the readers\' distance')

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

console.log(`1,000 useRelative readers: one tick takes median ${(samples[5]! / 1000).toFixed(1)} us (${(samples[5]! / READERS).toFixed(0)} ns per reader)`)
console.log(`load ${load.toFixed(2)} ${load < 5 ? '(valid conditions)' : '(ABOVE the gate of 5: indicative only, do not publish)'} sink=${sink}`)
scope.stop()
_resetClockState()
