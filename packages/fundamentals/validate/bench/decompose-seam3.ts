#!/usr/bin/env bun
/**
 * Seam probe, round three: the shipped `parse()` (#3316) is two field loads,
 * one call, one `issues.length` read and one Result literal — and it still
 * reads 2.2ns over the emitted validator alone. The remaining suspects are the
 * `this` loads through a many-field class instance and a call target that is
 * only monomorphic per process. This arm answers "what does a per-schema
 * CLOSURE over `compiled` + `ctx`, installed as an OWN `parse` property,
 * buy?" — no library change, the closure is built here from the same parts.
 *
 *   W   `S.parse(v)` in the FIRST slot        — discarded (see below)
 *   PP  prototype seam (own property deleted) — the #3316 method
 *   P   `S.parse(v)`                          — the shipped seam (own closure)
 *   P2  own-property closure built HERE      — the candidate as first probed
 *   P3/P4/P5  the library closure on a fresh instance / the probe closure on a
 *             fresh instance / the library closure called directly
 *   R   `compiled(v, ctx)` raw                — the emit alone
 *   Z   zod-c `c.safeParse(v)`                — the competitor's seam
 *   P0/PP0  duplicates of P and PP in the LAST slot — the controls
 *
 * WHAT THIS PROBE PROVED ABOUT ITSELF (2026-09-07): the arm SLOT moves a
 * result by up to ~1.5ns — the identical prototype seam read 4.48 (PP, slot 2)
 * and 2.99 (PP0, last slot), and the first slot is penalized ~1.4ns (W vs P).
 * bun/JSC tiers the arm closures by call order through the one `batch(fn)`
 * site. So this file can ORDER candidates at the 0.5ns scale only when the
 * duplicate control agrees; the VERDICT on the own-property seam came from
 * the process-isolated `bench/four-cells.ts` A/B (5.02 → 4.63ns), not from
 * here. Keep the W/P0/PP0 arms in any successor.
 *
 *   NODE_ENV=production bun bench/decompose-seam3.ts
 */
import { s } from '../src/index'
import { z } from 'zod'

const hr = () => Number(process.hrtime.bigint())
const N = 200_000
const RUNS = 12
const POOL = Array.from({ length: 1024 }, (_, i) => (i * 17 + 3) % 151)

const S = s.number().int().min(0).max(150)
S.parse(42)
const compiled = (S as unknown as { _compiled: (i: unknown, c: unknown) => unknown })._compiled
const ctx = (S as unknown as { _pureCtx: { issues: unknown[] } })._pureCtx
if (typeof compiled !== 'function' || ctx === undefined) throw new Error('expected a _jitPure compiled validator')

// The candidate: a closure that captures the two fields the method loads off `this`.
const pureFail = (c: { issues: unknown[] }) => {
  const issues = c.issues.slice()
  c.issues.length = 0
  return { ok: false as const, issues }
}
const parseOwn = (i: unknown) => {
  const v = compiled(i, ctx)
  if (ctx.issues.length === 0) return { ok: true as const, value: v }
  return pureFail(ctx)
}
const S2 = s.number().int().min(0).max(150)
S2.parse(42)
;(S2 as unknown as { parse: typeof parseOwn }).parse = parseOwn

const zc = z.compile(z.number().int().min(0).max(150))
// P3: the LIBRARY's own closure, moved onto a fresh instance (tests the closure itself)
const S3 = s.number().int().min(0).max(150)
S3.parse(42)
;(S3 as unknown as { parse: unknown }).parse = (S as unknown as { parse: unknown }).parse
// P4: the PROBE's closure, but called through S (tests the S instance's lookup)
const libParse = (S as unknown as { parse: (i: unknown) => unknown }).parse
const S4 = s.number().int().min(0).max(150)
S4.parse(42)
;(S4 as unknown as { parse: unknown }).parse = parseOwn

// PP: the PROTOTYPE seam (#3316's method) — own property deleted after the
// first parse, so calls resolve to Schema.prototype.parse with _pureCtx set.
const SP = s.number().int().min(0).max(150)
SP.parse(42)
delete (SP as unknown as { parse?: unknown }).parse
if (Object.hasOwn(SP, 'parse')) throw new Error('PP arm still has an own parse')

type Arm = { name: string; fn: () => void }
let k = 0
const arms: Arm[] = [
  { name: 'W   warm  S.parse(v) (first slot, discarded)', fn: () => { S.parse(POOL[k++ & 1023]) } },
  { name: 'PP  proto seam (own deleted)', fn: () => { SP.parse(POOL[k++ & 1023]) } },
  { name: 'P   seam  S.parse(v)', fn: () => { S.parse(POOL[k++ & 1023]) } },
  { name: 'P2  own   S2.parse(v)', fn: () => { S2.parse(POOL[k++ & 1023]) } },
  { name: 'P3  lib-closure on S3', fn: () => { S3.parse(POOL[k++ & 1023]) } },
  { name: 'P4  probe-closure on S', fn: () => { S4.parse(POOL[k++ & 1023]) } },
  { name: 'P5  lib-closure direct', fn: () => { libParse(POOL[k++ & 1023]) } },
  { name: 'R   raw   compiled(v,ctx)', fn: () => { compiled(POOL[k++ & 1023], ctx) } },
  { name: 'Z   zod-c safeParse(v)', fn: () => { zc.safeParse(POOL[k++ & 1023]) } },
  { name: 'P0  seam  S.parse(v) again (last slot)', fn: () => { S.parse(POOL[k++ & 1023]) } },
  { name: 'PP0 proto seam again (last slot)', fn: () => { SP.parse(POOL[k++ & 1023]) } },
]
for (const a of arms) a.fn()
if (!(S.parse(42) as { ok: boolean }).ok || (S.parse(1.5) as { ok: boolean }).ok) throw new Error('S verdicts wrong')
if (!(S2.parse(42) as { ok: boolean }).ok || (S2.parse(1.5) as { ok: boolean }).ok) throw new Error('S2 verdicts wrong')
if (!zc.safeParse(42).success || zc.safeParse(1.5).success) throw new Error('zod verdicts wrong')

function batch(fn: () => void): number {
  const t0 = hr()
  for (let i = 0; i < N; i++) fn()
  return (hr() - t0) / N
}
for (let w = 0; w < 3; w++) for (const a of arms) batch(a.fn)
const samples = new Map<string, number[]>(arms.map((a) => [a.name, []]))
for (let r = 0; r < RUNS; r++) for (const a of arms) samples.get(a.name)!.push(batch(a.fn))
const median = (xs: number[]) => { const so = [...xs].sort((a, b) => a - b); return so[so.length >> 1]! }
let seed = 7
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
const ci = (xs: number[]) => {
  const meds: number[] = []
  for (let i = 0; i < 1000; i++) meds.push(median(Array.from({ length: xs.length }, () => xs[Math.floor(rnd() * xs.length)]!)))
  meds.sort((a, b) => a - b)
  return { lo: meds[Math.floor(meds.length * 0.025)]!, hi: meds[Math.floor(meds.length * 0.975)]! }
}
const f = (x: number) => x.toFixed(2).padStart(6)
console.log(`\nload=${require('node:os').loadavg().map((x: number) => x.toFixed(2)).join(' ')}  N=${N}  runs=${RUNS}\n`)
const R: Record<string, { med: number; lo: number; hi: number }> = {}
for (const a of arms) { const xs = samples.get(a.name)!; R[a.name] = { med: median(xs), ...ci(xs) }; console.log(`${a.name.padEnd(28)} ${f(R[a.name]!.med)} ns  [${f(R[a.name]!.lo)}–${f(R[a.name]!.hi)}]`) }
const g = (p: string) => R[arms.find((a) => a.name.startsWith(p))!.name]!
const tie = (a: { lo: number; hi: number }, b: { lo: number; hi: number }) => !(a.hi < b.lo || b.hi < a.lo)
console.log(`\nP2 vs P: ${tie(g('P2'), g('P ')) ? 'TIE (CI overlap)' : g('P2').med < g('P ').med ? 'OWN CLOSURE FASTER, CI-disjoint' : 'OWN CLOSURE SLOWER, CI-disjoint'}   P2 vs Z: ${tie(g('P2'), g('Z')) ? 'TIE' : g('P2').med < g('Z').med ? 'ahead' : 'behind'}`)
