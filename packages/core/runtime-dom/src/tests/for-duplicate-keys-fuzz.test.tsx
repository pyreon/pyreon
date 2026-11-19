/**
 * Seeded property test for `<For>` under DUPLICATE keys — the twin of
 * `keyed-array-reorder-fuzz.test.tsx`, which drives the same reconciler
 * (`mountFor`) through a keyed `.map()` accessor.
 *
 * Duplicate keys are invalid input (dev warns), but production promised
 * first-wins: the DOM holds each key once, at its FIRST position. Only the
 * fresh render kept that promise. An update with a repeated key ran the
 * index-addressed passes (LIS, small-k placement) over the raw key list, so a
 * duplicated row was moved twice and landed at its LAST position; replace-all
 * mounted a duplicate twice, overwriting the first row's entry and stranding
 * its DOM; and a contiguous insert stored the repeated key as the current
 * order, which corrupted the next update.
 *
 * After every random update (permute / swap / insert / remove / duplicate /
 * reverse / replace) the DOM must equal the deduped first-wins key sequence,
 * and every key that survived must keep its DOM node.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  const op = Math.floor(r() * 7)
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
    // Insert a run of new keys, sometimes carrying a repeat of one of them or
    // of a survivor — the contiguous-insertion fast path.
    const k = 1 + Math.floor(r() * 4)
    const at = Math.floor(r() * (out.length + 1))
    const run = Array.from({ length: k }, fresh)
    if (r() < 0.5) run.push(r() < 0.5 && out.length > 0 ? (out[Math.floor(r() * out.length)] as number) : (run[0] as number))
    out.splice(at, 0, ...run)
  } else if (op === 3 && out.length > 0) {
    out.splice(Math.floor(r() * out.length), 1 + Math.floor(r() * 3))
  } else if (op === 4 && out.length > 0) {
    out.splice(Math.floor(r() * (out.length + 1)), 0, out[Math.floor(r() * out.length)] as number)
  } else if (op === 5) {
    // Replace every key (the replace-all path), with a repeat among the new ones.
    const k = 1 + Math.floor(r() * 8)
    const next = Array.from({ length: k }, fresh)
    next.splice(Math.floor(r() * (k + 1)), 0, next[Math.floor(r() * k)] as number)

    return next
  } else {
    out.reverse()
  }

  return out
}

describe('<For> — duplicate keys keep the first-wins order on every update path', () => {
  beforeEach(() => {
    // The duplicate-key warning is expected for these inputs.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('DOM order equals the deduped key sequence and surviving keys keep their node (300 seeds × 25 steps)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      let nextId = 0
      const fresh = () => nextId++
      let keys = Array.from({ length: 1 + Math.floor(r() * 12) }, fresh)
      // Some seeds start with a duplicate, so the fresh render's skip is covered.
      if (seed % 3 === 0) keys.splice(Math.floor(r() * keys.length), 0, keys[0] as number)
      const list = signal(keys)
      const host = document.createElement('div')
      const dispose = mount(
        h(
          'ul',
          null,
          h(For, { each: list, by: (k: number) => k, children: (k: number) => h('li', null, String(k)) }),
        ),
        host,
      )
      expect([...host.querySelectorAll('li')].map((li) => li.textContent), `seed ${seed} initial`).toEqual(
        [...new Set(keys)].map(String),
      )
      for (let step = 0; step < 25; step++) {
        const before = new Map<string, Element>()
        for (const li of host.querySelectorAll('li')) before.set(li.textContent as string, li)
        keys = nextList(r, keys, fresh)
        list.set(keys)
        const expected = [...new Set(keys)].map(String)
        const lis = [...host.querySelectorAll('li')]
        expect(
          lis.map((li) => li.textContent),
          `seed ${seed} step ${step}`,
        ).toEqual(expected)
        for (const li of lis) {
          const prev = before.get(li.textContent as string)
          if (prev) expect(li, `seed ${seed} step ${step} key ${li.textContent} reused`).toBe(prev)
        }
      }
      dispose()
      expect(host.querySelectorAll('li').length, `seed ${seed} disposed`).toBe(0)
    }
  })
})
