#!/usr/bin/env bun
/**
 * Empirical behavior / error-shape / Standard-Schema-conformance /
 * adversarial-correctness probe across Pyreon `s`, Zod 4, Valibot 1, ArkType 2.
 * Every result below is the REAL output of invoking each lib — no assertions.
 */
process.env.NODE_ENV = 'production'
import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { s } from '../src/v1'

const line = (t: string) => console.log('\n' + '─'.repeat(72) + '\n' + t + '\n' + '─'.repeat(72))

// canonical schemas
const P = s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150), email: s.string().email(), tags: s.array(s.string()) })
const Z = z.object({ name: z.string().min(2), age: z.number().int().min(0).max(150), email: z.string().email(), tags: z.array(z.string()) })
const V = v.object({ name: v.pipe(v.string(), v.minLength(2)), age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)), email: v.pipe(v.string(), v.email()), tags: v.array(v.string()) })
const A = type({ name: 'string >= 2', age: '0 <= number.integer <= 150', email: 'string.email', tags: 'string[]' })

// ── 1. Standard Schema (~standard) conformance ──
line('1. Standard Schema (~standard) conformance — present? version/vendor')
const std = (sch: any) => { const s2 = sch['~standard']; return s2 ? `version=${s2.version} vendor=${s2.vendor}` : 'ABSENT' }
console.log('  pyreon :', std(P))
console.log('  zod    :', std(Z))
console.log('  valibot:', std(V))
console.log('  arktype:', std(A))

// ── 2. Error shape + issue count for a multi-error invalid input ──
const bad = { name: 'A', age: 999, email: 'nope', tags: ['ok', 42] }
line('2. Error output for { name:"A", age:999, email:"nope", tags:["ok",42] } — shape + count + nested path')
{
  const r = P.parse(bad)
  console.log('  PYREON  ok=' + r.ok + ' issues=' + (r.ok ? 0 : r.issues.length))
  if (!r.ok) console.log('   ', JSON.stringify(r.issues.map((i) => ({ path: i.path, code: (i as any).code, msg: i.message }))))
}
{
  const r = Z.safeParse(bad)
  console.log('  ZOD     ok=' + r.success + ' issues=' + (r.success ? 0 : r.error.issues.length))
  if (!r.success) console.log('   ', JSON.stringify(r.error.issues.map((i) => ({ path: i.path, code: i.code, msg: i.message }))))
}
{
  const r = v.safeParse(V, bad)
  console.log('  VALIBOT ok=' + r.success + ' issues=' + (r.success ? 0 : r.issues.length))
  if (!r.success) console.log('   ', JSON.stringify(r.issues.map((i) => ({ path: i.path?.map((p: any) => p.key), msg: i.message }))))
}
{
  const r = A(bad)
  const isErr = r instanceof type.errors
  console.log('  ARKTYPE isError=' + isErr + ' count=' + (isErr ? (r as any).length : 0))
  if (isErr) console.log('    summary:', JSON.stringify((r as any).summary))
}

// ── 3. Adversarial divergence table ──
line('3. Adversarial accept/reject divergence (✓=accept, ✗=reject)')
const Pn = s.number().int().min(0).max(150)
const Zn = z.number().int().min(0).max(150)
const Vn = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150))
const An = type('0 <= number.integer <= 150')
const Ps = s.string().min(2), Zs = z.string().min(2), Vs = v.pipe(v.string(), v.minLength(2)), As = type('string >= 2')
const Pe = s.string().email(), Ze = z.string().email(), Ve = v.pipe(v.string(), v.email()), Ae = type('string.email')

const acc = {
  pyreon: (sch: any, x: unknown) => sch.parse(x).ok,
  zod: (sch: any, x: unknown) => sch.safeParse(x).success,
  valibot: (sch: any, x: unknown) => v.safeParse(sch, x).success,
  arktype: (sch: any, x: unknown) => !(sch(x) instanceof type.errors),
}
function row(label: string, schemas: any, x: unknown) {
  const m = (k: keyof typeof acc) => { try { return acc[k](schemas[k], x) ? '✓' : '✗' } catch { return 'ERR' } }
  console.log('  ' + label.padEnd(34) + 'P:' + m('pyreon') + '  Z:' + m('zod') + '  Va:' + m('valibot') + '  Ar:' + m('arktype'))
}
const NUM = { pyreon: Pn, zod: Zn, valibot: Vn, arktype: An }
const STR = { pyreon: Ps, zod: Zs, valibot: Vs, arktype: As }
const EMAIL = { pyreon: Pe, zod: Ze, valibot: Ve, arktype: Ae }
console.log(' NUMBER int 0..150:')
row('NaN', NUM, NaN); row('Infinity', NUM, Infinity); row('-0', NUM, -0)
row('"42" (string coercion?)', NUM, '42'); row('42.5 (non-int)', NUM, 42.5)
row('151 (over max)', NUM, 151); row('0 (boundary)', NUM, 0); row('150 (boundary)', NUM, 150)
row('MAX_SAFE_INTEGER+1', NUM, Number.MAX_SAFE_INTEGER + 1)
console.log(' STRING min(2):')
row('"" (empty)', STR, ''); row('"a" (len1)', STR, 'a'); row('"  " (2 spaces)', STR, '  ')
row('"👍" (1 emoji, 2 UTF16 units)', STR, '👍'); row('"ab"', STR, 'ab')
console.log(' EMAIL strictness:')
for (const e of ['a@b', 'a@b.c', 'user+tag@ex.com', 'foo@bar', 'x@xn--80ak6aa92e.com', 'a@b.com', 'plainaddr', 'a @b.com']) row(JSON.stringify(e), EMAIL, e)

// ── 4. Object extra-key handling (strip / strict / passthrough) ──
line('4. Unknown-key handling — input has extra key {x:1}; what is in the output value?')
const extra = { name: 'Ada', age: 30, email: 'a@b.com', tags: [], x: 1, __proto__: { polluted: true } as any }
{ const r = P.parse(extra); console.log('  PYREON  ok=' + r.ok + ' value=' + (r.ok ? JSON.stringify(r.value) : 'n/a')) }
{ const r = Z.safeParse(extra); console.log('  ZOD     ok=' + r.success + ' value=' + (r.success ? JSON.stringify(r.data) : 'n/a')) }
{ const r = v.safeParse(V, extra); console.log('  VALIBOT ok=' + r.success + ' value=' + (r.success ? JSON.stringify(r.output) : 'n/a')) }
{ const r = A(extra); const ok = !(r instanceof type.errors); console.log('  ARKTYPE ok=' + ok + ' value=' + (ok ? JSON.stringify(r) : 'n/a')) }

// ── 5. Prototype-pollution safety ──
line('5. Prototype-pollution — parse JSON with a __proto__ payload; did Object.prototype get polluted?')
const polluter = JSON.parse('{"name":"Ada","age":30,"email":"a@b.com","tags":[],"__proto__":{"polluted":true}}')
const POBJ = s.object({ name: s.string(), age: s.number(), email: s.string(), tags: s.array(s.string()) })
const ZOBJ = z.object({ name: z.string(), age: z.number(), email: z.string(), tags: z.array(z.string()) })
const VOBJ = v.object({ name: v.string(), age: v.number(), email: v.string(), tags: v.array(v.string()) })
const AOBJ = type({ name: 'string', age: 'number', email: 'string', tags: 'string[]' })
const checkPoll = (label: string, fn: () => void) => { fn(); console.log('  ' + label.padEnd(10) + 'Object.prototype.polluted = ' + ((Object.prototype as any).polluted ?? 'undefined (safe)')); delete (Object.prototype as any).polluted }
checkPoll('pyreon', () => POBJ.parse(JSON.parse(JSON.stringify(polluter))))
checkPoll('zod', () => ZOBJ.safeParse(JSON.parse(JSON.stringify(polluter))))
checkPoll('valibot', () => v.safeParse(VOBJ, JSON.parse(JSON.stringify(polluter))))
checkPoll('arktype', () => AOBJ(JSON.parse(JSON.stringify(polluter))))

console.log('\nDONE')
