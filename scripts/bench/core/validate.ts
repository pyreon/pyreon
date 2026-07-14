/**
 * Validation benchmark — measures parse ops/sec for `@pyreon/validate`'s `s`
 * runtime vs the three dominant Standard-Schema validators.
 *
 * Compares:
 *   - @pyreon/validate  — Pyreon's `s` validator (compile-on-first-parse + JIT)
 *   - zod@4             — the de-facto reference (v4 precompiles on build)
 *   - valibot@1         — pipe/action model, tree-shake-first
 *   - arktype@2         — type-DSL with an aggressive JIT (perf leader on valid-parse)
 *
 * Usage: bun scripts/bench/core/validate.ts
 *
 * OBJECTIVITY CONTRACT:
 *   1. `NODE_ENV=production` is forced FIRST — @pyreon/validate (like the other
 *      framework packages) gates dev-only instrumentation on it; benching dev
 *      mode measures the instrumentation, not the validator.
 *   2. Every schema is the IDIOMATIC form for its library expressing the SAME
 *      validation goal (no lib sandbagged). All four parse the identical input
 *      objects; correctness is asserted once before timing so a validator that
 *      "wins" by not actually validating is caught.
 *   3. WARMUP runs before timing so each lib's compile-on-first-use / JIT cost
 *      is amortized (zod precompiles on build, arktype JITs on first call,
 *      valibot compiles per action, Pyreon compiles its op-list on first parse).
 *   4. Both VALID and INVALID inputs are timed — validators diverge sharply on
 *      the error path (issue allocation vs early-exit).
 */

process.env.NODE_ENV = 'production'

import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import { s } from '../../../packages/fundamentals/validate/src/index'

// ─── Harness ─────────────────────────────────────────────────────────────────

interface Row {
  lib: string
  opsPerSec: number
}

function bench(fn: () => void, durationMs = 1200): number {
  for (let i = 0; i < 2000; i++) fn() // warmup → amortize compile/JIT
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    fn()
    fn()
    fn()
    fn()
    fn()
    fn()
    fn()
    fn()
    fn()
    fn()
    ops += 10
  }
  const elapsed = (performance.now() - start) / 1000
  return Math.round(ops / elapsed)
}

const fmt = (n: number) => n.toLocaleString('en-US')

function report(title: string, rows: Row[]): void {
  const fastest = Math.max(...rows.map((r) => r.opsPerSec))
  console.log(`\n  ${title}`)
  for (const r of rows.sort((a, b) => b.opsPerSec - a.opsPerSec)) {
    const rel = r.opsPerSec === fastest ? '1.00× 🥇' : `${(fastest / r.opsPerSec).toFixed(2)}× slower`
    console.log(`    ${r.lib.padEnd(18)} ${fmt(r.opsPerSec).padStart(12)} ops/s   ${rel}`)
  }
}

// ─── Schemas (idiomatic per lib, same validation goal) ─────────────────────────

// A) small object — name(min 2) / age(int 0..150) / email / active(bool)
const pyrUser = s.object({
  name: s.string().min(2),
  age: s.number().int().between(0, 150),
  email: s.string().email(),
  active: s.boolean(),
})
const zUser = z.object({
  name: z.string().min(2),
  age: z.number().int().min(0).max(150),
  email: z.email(),
  active: z.boolean(),
})
const vUser = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
  age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
  email: v.pipe(v.string(), v.email()),
  active: v.boolean(),
})
const aUser = type({
  name: 'string >= 2',
  age: '0 <= number.integer <= 150',
  email: 'string.email',
  active: 'boolean',
})

const validUser = { name: 'Alice', age: 30, email: 'alice@example.com', active: true }
const invalidUser = { name: 'A', age: 999, email: 'nope', active: 'yes' }

// B) nested object — record with a nested user + string[] tags
const pyrNested = s.object({ id: s.number().int(), owner: pyrUser, tags: s.array(s.string()) })
const zNested = z.object({ id: z.number().int(), owner: zUser, tags: z.array(z.string()) })
const vNested = v.object({ id: v.pipe(v.number(), v.integer()), owner: vUser, tags: v.array(v.string()) })
const aNested = type({ id: 'number.integer', owner: aUser, tags: 'string[]' })
const validNested = { id: 1, owner: validUser, tags: ['x', 'y', 'z'] }
const invalidNested = { id: 1.5, owner: invalidUser, tags: ['x', 2] }

// C) array of 20 users
const pyrArr = s.array(pyrUser)
const zArr = z.array(zUser)
const vArr = v.array(vUser)
const aArr = aUser.array()
const validArr = Array.from({ length: 20 }, () => validUser)
const invalidArr = Array.from({ length: 20 }, (_, i) => (i === 10 ? invalidUser : validUser))

// D) discriminated union
const pyrDU = s.discriminatedUnion('kind', [
  s.object({ kind: s.literal('circle'), radius: s.number() }),
  s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
])
const zDU = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('circle'), radius: z.number() }),
  z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
])
const vDU = v.variant('kind', [
  v.object({ kind: v.literal('circle'), radius: v.number() }),
  v.object({ kind: v.literal('rect'), w: v.number(), h: v.number() }),
])
const aDU = type({ kind: "'circle'", radius: 'number' }).or({ kind: "'rect'", w: 'number', h: 'number' })
const validDU = { kind: 'rect', w: 3, h: 4 }
const invalidDU = { kind: 'rect', w: 'x', h: 4 }

// E) scalars — the shapes where validation is trivial and per-parse allocation
// dominates. `bare string` isolates the pure `.parse()` overhead; `int 0..150`
// isolates a small check chain. Kept alongside the composite shapes so the
// scalar story is measured, not asserted.
const pyrStr = s.string()
const zStr = z.string()
const vStr = v.string()
const aStr = type('string')
const validStr = 'hello world'
const invalidStr = 42

const pyrInt = s.number().int().between(0, 150)
const zInt = z.number().int().min(0).max(150)
const vInt = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150))
const aInt = type('0 <= number.integer <= 150')
const validInt = 30
const invalidInt = 999

// ─── Parse adapters (each returns boolean ok — never throws) ───────────────────

const ARK_ERR = type.errors
const adapters = {
  pyreon: { user: pyrUser, nested: pyrNested, arr: pyrArr, du: pyrDU, str: pyrStr, int: pyrInt, run: (sch: any, x: unknown) => sch.parse(x).ok },
  zod: { user: zUser, nested: zNested, arr: zArr, du: zDU, str: zStr, int: zInt, run: (sch: any, x: unknown) => sch.safeParse(x).success },
  valibot: { user: vUser, nested: vNested, arr: vArr, du: vDU, str: vStr, int: vInt, run: (sch: any, x: unknown) => v.safeParse(sch, x).success },
  arktype: { user: aUser, nested: aNested, arr: aArr, du: aDU, str: aStr, int: aInt, run: (sch: any, x: unknown) => !(sch(x) instanceof ARK_ERR) },
} as const

// ─── Correctness gate (a validator that doesn't validate can't "win") ──────────

function assertCorrect(): void {
  for (const [lib, a] of Object.entries(adapters)) {
    const checks: [string, boolean][] = [
      ['user valid', a.run(a.user, validUser) === true],
      ['user invalid', a.run(a.user, invalidUser) === false],
      ['nested valid', a.run(a.nested, validNested) === true],
      ['nested invalid', a.run(a.nested, invalidNested) === false],
      ['arr valid', a.run(a.arr, validArr) === true],
      ['arr invalid', a.run(a.arr, invalidArr) === false],
      ['du valid', a.run(a.du, validDU) === true],
      ['du invalid', a.run(a.du, invalidDU) === false],
      ['str valid', a.run(a.str, validStr) === true],
      ['str invalid', a.run(a.str, invalidStr) === false],
      ['int valid', a.run(a.int, validInt) === true],
      ['int invalid', a.run(a.int, invalidInt) === false],
    ]
    for (const [name, ok] of checks) {
      if (!ok) throw new Error(`[validate-bench] correctness FAIL: ${lib} ${name}`)
    }
  }
  console.log('  ✓ correctness gate passed (all 4 libs agree on valid/invalid for every shape)')
}

// ─── Run ───────────────────────────────────────────────────────────────────────

console.log('\n=== @pyreon/validate parse benchmark ===')
console.log(`  Bun ${Bun.version} · ${process.platform}/${process.arch} · NODE_ENV=production`)
assertCorrect()

const shapes: [string, 'user' | 'nested' | 'arr' | 'du' | 'str' | 'int', unknown, unknown][] = [
  ['Scalar string', 'str', validStr, invalidStr],
  ['Scalar int (0..150)', 'int', validInt, invalidInt],
  ['Small object (5 fields)', 'user', validUser, invalidUser],
  ['Nested object', 'nested', validNested, invalidNested],
  ['Array of 20 objects', 'arr', validArr, invalidArr],
  ['Discriminated union', 'du', validDU, invalidDU],
]

for (const [title, key, valid, invalid] of shapes) {
  for (const [mode, input] of [['valid', valid], ['invalid', invalid]] as const) {
    const rows: Row[] = Object.entries(adapters).map(([lib, a]) => ({
      lib,
      opsPerSec: bench(() => {
        a.run(a[key], input)
      }),
    }))
    report(`${title} — ${mode} input`, rows)
  }
}
console.log('')
