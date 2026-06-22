#!/usr/bin/env bun
/**
 * Validation-library comparison benchmark — Pyreon `s` vs Zod 4 / Valibot 1 /
 * ArkType 2. REAL installed deps (devDeps of @pyreon/validate), real parse
 * measurements. No fabricated numbers.
 *
 * Methodology (mirrors the repo's bench objectivity standards):
 *  - NODE_ENV=production before any import.
 *  - Equivalent schema semantics across all four libs (only features ALL
 *    four support — string/number/object/array + min/max/email/int — since
 *    Pyreon `s` v1 is a deliberate subset).
 *  - Idiomatic parse per lib: pyreon `.parse`, zod `.safeParse`,
 *    valibot `safeParse(schema, input)`, arktype `schema(input)`.
 *  - Warmup (each lib JITs / compiles its closure on first parse — arktype
 *    especially) until stable, then timed batches.
 *  - Median ns/op over R runs of K iterations; also reports ops/sec + a
 *    relative multiplier vs the fastest.
 *  - Both VALID and INVALID input paths (error-path cost differs a lot).
 *
 * Run: bun scripts/bench/validation.ts
 */
process.env.NODE_ENV = 'production'

import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { s } from '../src/v1'

// ─── timing core ───────────────────────────────────────────────────────
const now = () => Number(process.hrtime.bigint())

function measure(fn: () => void, { warmup = 5_000, iters = 50_000, runs = 12 } = {}) {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    const t1 = now()
    samples.push((t1 - t0) / iters) // ns/op
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]!
  return median
}

interface Row {
  scenario: string
  path: 'valid' | 'invalid'
  pyreon: number
  zod: number
  valibot: number
  arktype: number
}

const rows: Row[] = []

function bench(
  scenario: string,
  path: 'valid' | 'invalid',
  impls: { pyreon: () => void; zod: () => void; valibot: () => void; arktype: () => void },
) {
  rows.push({
    scenario,
    path,
    pyreon: measure(impls.pyreon),
    zod: measure(impls.zod),
    valibot: measure(impls.valibot),
    arktype: measure(impls.arktype),
  })
}

// ════════════════════════════════════════════════════════════════════════
// Scenario 1 — single string + email
// ════════════════════════════════════════════════════════════════════════
{
  const P = s.string().email()
  const Z = z.string().email()
  const V = v.pipe(v.string(), v.email())
  const A = type('string.email')
  const ok = 'user@example.com'
  const bad = 'not-an-email'
  bench('string.email', 'valid', {
    pyreon: () => P.parse(ok),
    zod: () => Z.safeParse(ok),
    valibot: () => v.safeParse(V, ok),
    arktype: () => A(ok),
  })
  bench('string.email', 'invalid', {
    pyreon: () => P.parse(bad),
    zod: () => Z.safeParse(bad),
    valibot: () => v.safeParse(V, bad),
    arktype: () => A(bad),
  })
}

// ════════════════════════════════════════════════════════════════════════
// Scenario 2 — number with int + range
// ════════════════════════════════════════════════════════════════════════
{
  const P = s.number().int().min(0).max(150)
  const Z = z.number().int().min(0).max(150)
  const V = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150))
  const A = type('0 <= number.integer <= 150')
  const ok = 42
  const bad = 999
  bench('number.int.range', 'valid', {
    pyreon: () => P.parse(ok),
    zod: () => Z.safeParse(ok),
    valibot: () => v.safeParse(V, ok),
    arktype: () => A(ok),
  })
  bench('number.int.range', 'invalid', {
    pyreon: () => P.parse(bad),
    zod: () => Z.safeParse(bad),
    valibot: () => v.safeParse(V, bad),
    arktype: () => A(bad),
  })
}

// ════════════════════════════════════════════════════════════════════════
// Scenario 3 — realistic nested user object
//   { name: string>=2, age: int 0..150, email: string.email,
//     tags: string[] }
// ════════════════════════════════════════════════════════════════════════
{
  const P = s.object({
    name: s.string().min(2),
    age: s.number().int().min(0).max(150),
    email: s.string().email(),
    tags: s.array(s.string()),
  })
  const Z = z.object({
    name: z.string().min(2),
    age: z.number().int().min(0).max(150),
    email: z.string().email(),
    tags: z.array(z.string()),
  })
  const V = v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
    email: v.pipe(v.string(), v.email()),
    tags: v.array(v.string()),
  })
  const A = type({
    name: 'string >= 2',
    age: '0 <= number.integer <= 150',
    email: 'string.email',
    tags: 'string[]',
  })
  const ok = { name: 'Ada', age: 36, email: 'ada@example.com', tags: ['a', 'b', 'c'] }
  const bad = { name: 'A', age: 999, email: 'nope', tags: ['a', 42] }
  bench('object.user', 'valid', {
    pyreon: () => P.parse(ok),
    zod: () => Z.safeParse(ok),
    valibot: () => v.safeParse(V, ok),
    arktype: () => A(ok),
  })
  bench('object.user', 'invalid', {
    pyreon: () => P.parse(bad),
    zod: () => Z.safeParse(bad),
    valibot: () => v.safeParse(V, bad),
    arktype: () => A(bad),
  })
}

// ════════════════════════════════════════════════════════════════════════
// Scenario 4 — array of 20 user objects (bulk)
// ════════════════════════════════════════════════════════════════════════
{
  const P = s.array(
    s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150) }),
  )
  const Z = z.array(z.object({ name: z.string().min(2), age: z.number().int().min(0).max(150) }))
  const V = v.array(
    v.object({
      name: v.pipe(v.string(), v.minLength(2)),
      age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
    }),
  )
  const A = type({ name: 'string >= 2', age: '0 <= number.integer <= 150' }).array()
  const ok = Array.from({ length: 20 }, (_, i) => ({ name: `User${i}`, age: 20 + (i % 50) }))
  bench('array.20-objects', 'valid', {
    pyreon: () => P.parse(ok),
    zod: () => Z.safeParse(ok),
    valibot: () => v.safeParse(V, ok),
    arktype: () => A(ok),
  })
}

// ─── output ───────────────────────────────────────────────────────────
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}µs` : `${n.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')

console.log(`\nValidation benchmark — Pyreon s / Zod 4 / Valibot / ArkType`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=${process.env.NODE_ENV}`)
console.log('Median ns/op (lower = faster). Multiplier = vs fastest in row.\n')

const head = ['scenario', 'path', 'pyreon', 'zod', 'valibot', 'arktype', 'winner']
console.log(head.map((h) => h.padEnd(h === 'scenario' ? 18 : 12)).join(''))
console.log('─'.repeat(90))
const jsonRows: unknown[] = []
for (const r of rows) {
  const vals = { pyreon: r.pyreon, zod: r.zod, valibot: r.valibot, arktype: r.arktype }
  const min = Math.min(...Object.values(vals))
  const winner = (Object.entries(vals).find(([, x]) => x === min)?.[0]) ?? '?'
  const cell = (n: number) => `${fmt(n)}(${(n / min).toFixed(1)}x)`
  console.log(
    r.scenario.padEnd(18) +
      r.path.padEnd(12) +
      cell(r.pyreon).padEnd(12) +
      cell(r.zod).padEnd(12) +
      cell(r.valibot).padEnd(12) +
      cell(r.arktype).padEnd(12) +
      winner,
  )
  jsonRows.push({
    ...r,
    winner,
    opsPerSec: { pyreon: opsPerSec(r.pyreon), zod: opsPerSec(r.zod), valibot: opsPerSec(r.valibot), arktype: opsPerSec(r.arktype) },
  })
}
console.log('\n' + JSON.stringify({ meta: { node: process.version, platform: `${process.platform}/${process.arch}`, zod: 4 }, rows: jsonRows }, null, 0))
