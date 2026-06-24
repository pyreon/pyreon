#!/usr/bin/env bun
/**
 * Compiled-verdict benchmark — runtime `.is()` (→ `parse().ok`, JIT-compiled)
 * vs the build-emitted inlined compiled verdict that
 * `pyreon({ compileValidators: true })` attaches via `_attachCompiledVerdict`.
 * Honest measurement of the actual benefit of the validate compiler additions
 * (`@pyreon/compiler` `analyzeValidate` + `emitValidator`). No fabricated numbers.
 *
 * Methodology (mirrors the repo's bench objectivity standards):
 *  - NODE_ENV=production (run via `bench:compiled-verdict`) so the dev-mode
 *    reactive-devtools instrumentation can't skew the numbers.
 *  - Two instances per schema from ONE source: a plain `runtime` schema whose
 *    `.is()` falls through to `parse().ok`, and a `compiled` twin with the
 *    build-emitted verdict attached (exactly what the vite-plugin emits).
 *  - Realistic 70/30 valid/invalid input stream (error-path cost differs).
 *  - Warmup (both paths JIT their closures) then median ns/op over R runs of K
 *    iterations; also a relative speedup.
 *  - The emitted verdict is byte-equivalent to the runtime (locked by the
 *    compiler's emit-equivalence gate) — this measures SPEED only.
 *
 * HONEST READ (steady-state, Apple-class hardware): compiled `.is()` is ~1.6–3×
 * faster than `parse().ok` — biggest on cheap schemas (number/array, where the
 * Result-allocation + parse machinery overhead dominates) and smallest on
 * expensive ones (email regex, where the regex work is shared). BUT it's
 * NANOSECONDS (~20ns/call): only matters in a hot `.is()` loop (filtering /
 * gating large arrays). `.parse()` — the common form/request path — is
 * unchanged, and only module-level fully-emittable schemas qualify.
 *
 * Run: bun run --filter=@pyreon/validate bench:compiled-verdict
 */
import { analyzeValidate, emitValidator } from '@pyreon/compiler'
import { s } from '../src/v1'

function buildPair(label: string, src: string, valid: unknown[], invalid: unknown[]) {
  // oxlint-disable no-new-func
  const runtime = new Function('s', `return ${src}`)(s) as ReturnType<typeof s.string>
  const compiled = new Function('s', `return ${src}`)(s) as ReturnType<typeof s.string>
  const info = analyzeValidate(`const X = ${src}`)[0]
  if (!info?.emittable) throw new Error(`${label}: not emittable`)
  const issuesFn = new Function(`return ${emitValidator(info.node)}`)() as (v: unknown) => unknown[]
  // oxlint-enable no-new-func
  const verdict = (v: unknown): boolean => {
    try {
      return issuesFn(v).length === 0
    } catch {
      return false
    }
  }
  ;(compiled as unknown as { _attachCompiledVerdict(f: (v: unknown) => boolean): unknown })._attachCompiledVerdict(verdict)
  const inputs: unknown[] = []
  for (let i = 0; i < 100; i++) inputs.push(i % 10 < 7 ? valid[i % valid.length] : invalid[i % invalid.length])
  return { label, runtime, compiled, inputs }
}

function timeIs(schema: { is(v: unknown): boolean }, inputs: unknown[], iters: number): number {
  let acc = 0
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) if (schema.is(inputs[i % inputs.length])) acc++
  const dt = performance.now() - t0
  if (acc < 0) throw new Error('unreachable') // keep `acc` live (defeat DCE)
  return (dt * 1e6) / iters // ns/op
}

function bench(pair: ReturnType<typeof buildPair>, iters: number, runs: number) {
  timeIs(pair.runtime, pair.inputs, 50_000)
  timeIs(pair.compiled, pair.inputs, 50_000)
  const r: number[] = []
  const c: number[] = []
  for (let k = 0; k < runs; k++) {
    r.push(timeIs(pair.runtime, pair.inputs, iters))
    c.push(timeIs(pair.compiled, pair.inputs, iters))
  }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]!
  const rt = med(r)
  const ct = med(c)
  return { label: pair.label, runtimeNs: rt, compiledNs: ct, speedup: rt / ct }
}

const PAIRS = [
  buildPair('string().email()', 's.string().email()',
    ['a@b.co', 'user@example.com', 'x.y@z.io'], ['nope', '', '@bad', 'a@b']),
  buildPair('number().int().min(18)', 's.number().int().min(18)',
    [18, 25, 99, 40], [17, 3.5, 'x', null, -1]),
  buildPair('object{email,age,name}',
    's.object({ email: s.string().email(), age: s.number().int().min(18), name: s.string().min(1) })',
    [{ email: 'a@b.co', age: 30, name: 'Ann' }, { email: 'x@y.io', age: 18, name: 'Bo' }],
    [{ email: 'bad', age: 30, name: 'Ann' }, { email: 'a@b.co', age: 5, name: 'X' }, null, { age: 30 }]),
  buildPair('array(number())', 's.array(s.number())',
    [[1, 2, 3], [], [4, 5]], [[1, 'x', 3], 'nope', null]),
]

const ITERS = 500_000
const RUNS = 7
console.log(`\nCompiled verdict vs runtime .is() — ${ITERS.toLocaleString()} iters × ${RUNS} runs (median ns/op, lower=faster)\n`)
console.log('schema'.padEnd(28), 'runtime .is()'.padStart(14), 'compiled .is()'.padStart(15), 'speedup'.padStart(9))
console.log('─'.repeat(68))
for (const p of PAIRS) {
  const { label, runtimeNs, compiledNs, speedup } = bench(p, ITERS, RUNS)
  console.log(
    label.padEnd(28),
    `${runtimeNs.toFixed(1)}ns`.padStart(14),
    `${compiledNs.toFixed(1)}ns`.padStart(15),
    `${speedup.toFixed(2)}×`.padStart(9),
  )
}
console.log('\n.is() only; .parse() (the common form/request path) is unchanged. Nanosecond-scale — matters in hot .is() loops, not one-off validation.\n')
