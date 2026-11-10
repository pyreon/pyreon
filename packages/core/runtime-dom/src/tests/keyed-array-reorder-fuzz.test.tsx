/**
 * Seeded property test for a keyed VNode-array accessor (`{() => list().map(…)}`
 * with keys → `mountKeyedList`), whose reorders run through `<For>`'s LIS
 * (`forLisReorder`). After every random update (permute / insert / remove /
 * duplicate keys) the DOM must equal the deduped first-wins key sequence, and
 * every key that survived must keep its DOM node.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function nextList(r: () => number, prev: number[], fresh: () => number): number[] {
  const out = [...prev]
  const op = Math.floor(r() * 6)
  if (op === 0) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[out[i], out[j]] = [out[j] as number, out[i] as number]
    }
  } else if (op === 1 && out.length > 1) {
    const i = Math.floor(r() * out.length)
    const j = Math.floor(r() * out.length)
    ;[out[i], out[j]] = [out[j] as number, out[i] as number]
  } else if (op === 2) {
    const k = 1 + Math.floor(r() * 4)
    const at = Math.floor(r() * (out.length + 1))
    out.splice(at, 0, ...Array.from({ length: k }, fresh))
  } else if (op === 3 && out.length > 0) {
    out.splice(Math.floor(r() * out.length), 1 + Math.floor(r() * 3))
  } else if (op === 4 && out.length > 0) {
    out.splice(Math.floor(r() * (out.length + 1)), 0, out[Math.floor(r() * out.length)] as number)
  } else {
    out.reverse()
  }
  return out
}

describe('keyed array accessor — random updates', () => {
  it('DOM order equals the deduped key sequence and surviving keys keep their node (300 seeds × 25 steps)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      let nextId = 0
      const fresh = () => nextId++
      let keys = Array.from({ length: 1 + Math.floor(r() * 12) }, fresh)
      const list = signal(keys)
      const host = document.createElement('div')
      const dispose = mount(h('ul', null, () => list().map((k) => h('li', { key: k }, String(k)))), host)
      for (let step = 0; step < 25; step++) {
        const before = new Map<string, Element>()
        for (const li of host.querySelectorAll('li')) before.set(li.textContent as string, li)
        keys = nextList(r, keys, fresh)
        list.set(keys)
        const expected = [...new Set(keys)].map(String)
        const lis = [...host.querySelectorAll('li')]
        expect(lis.map((li) => li.textContent), `seed ${seed} step ${step}`).toEqual(expected)
        for (const li of lis) {
          const prev = before.get(li.textContent as string)
          if (prev) expect(li, `seed ${seed} step ${step} key ${li.textContent} reused`).toBe(prev)
        }
      }
      dispose()
    }
  })
})
