#!/usr/bin/env bun
/**
 * Pure-V8 probe: how much does a read through an N-deep getter CHAIN cost when
 * the accessors were installed by `Object.defineProperty` on a `{}` (what
 * `makeReactiveProps` builds) versus written as literal getters (what Solid's
 * compiler emits)? Runs in real Chromium via Playwright — no bundle, no
 * framework — because the deep-tree ladder attributes ~2× per-read cost to
 * Pyreon's chain over Solid's and this is the only variable left between them.
 *
 *   bun probe-getter-chain.ts
 */
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  const out = await page.evaluate(() => {
    const DEPTH = 11
    const N = 200_000
    const SYM = Symbol('rp')

    // Shape P: parent -> child via `_rp` thunk converted to a defineProperty accessor.
    function chainDefine(depth: number): { depth: number } {
      let props: Record<string, unknown> = { depth }
      for (let d = 0; d < depth - 1; d++) {
        const parent = props
        const thunk = () => (parent.depth as number) - 1
        ;(thunk as any)[SYM] = true
        const result: Record<string, unknown> = {}
        Object.defineProperty(result, 'depth', { get: thunk, enumerable: true, configurable: true })
        props = result
      }
      return props as { depth: number }
    }
    // Shape S: literal getters (Solid's emit).
    function chainLiteral(depth: number): { depth: number } {
      let props: { depth: number } = { depth }
      for (let d = 0; d < depth - 1; d++) {
        const parent = props
        props = {
          get depth() {
            return parent.depth - 1
          },
        }
      }
      return props
    }
    // Shape L: literal getters on a prototype-branded object (the `_gp` emit).
    const GP = Object.freeze(Object.create(null))
    function chainBranded(depth: number): { depth: number } {
      let props: { depth: number } = { depth }
      for (let d = 0; d < depth - 1; d++) {
        const parent = props
        props = {
          __proto__: GP,
          get depth() {
            return parent.depth - 1
          },
        } as { depth: number }
      }
      return props
    }

    const arms: Record<string, () => { depth: number }> = {
      define: () => chainDefine(DEPTH),
      literal: () => chainLiteral(DEPTH),
      branded: () => chainBranded(DEPTH),
    }
    const res: Record<string, { readNs: number; buildNs: number }> = {}
    // Interleaved: build 200 chains per arm, read each 100 times.
    const chains: Record<string, { depth: number }[]> = {}
    for (let round = 0; round < 3; round++) {
      for (const [name, mk] of Object.entries(arms)) {
        const t0 = performance.now()
        const arr: { depth: number }[] = []
        for (let i = 0; i < 2000; i++) arr.push(mk())
        const t1 = performance.now()
        chains[name] = arr
        let sink = 0
        const reads = N
        const t2 = performance.now()
        for (let i = 0; i < reads; i++) sink += (arr[i % arr.length] as { depth: number }).depth
        const t3 = performance.now()
        if (sink < 0) throw new Error('sink')
        res[name] = { readNs: ((t3 - t2) * 1e6) / reads, buildNs: ((t1 - t0) * 1e6) / 2000 }
      }
    }
    return res
  })
  console.log(`getter chain, depth 11, read the LEAF's depth (walks 10 getters):`)
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(8)} read ${v.readNs.toFixed(1)} ns   build-chain ${v.buildNs.toFixed(0)} ns`)
} finally {
  await browser.close()
}
