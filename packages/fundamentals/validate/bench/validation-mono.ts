#!/usr/bin/env bun
/**
 * MONOMORPHIC validation benchmark — Pyreon `s` vs Zod 4 / Valibot 1 /
 * ArkType 2, each measured in its OWN child process.
 *
 * Why a separate harness from `validation.ts`: that one interleaves all four
 * libraries in a single process, which is the right call for a *cold /
 * cross-library* comparison but DEFEATS V8's escape analysis + monomorphic
 * inline caches (the call sites see four shapes, so allocations can't be
 * elided and dispatch goes megamorphic). A REAL app calls ONE schema's
 * `.parse` repeatedly — monomorphic, hot — and there V8 elides the per-parse
 * `ctx` / result allocations entirely. This harness reproduces THAT by
 * spawning one fresh `bun` process per (library, scenario), so each library
 * is measured exactly as a real app would run it.
 *
 * Both numbers are honest and answer different questions:
 *   - validation.ts  → "framework CPU, no single-lib JIT advantage"
 *   - validation-mono.ts → "what a real app that uses this one schema pays"
 *
 * Run: bun bench/validation-mono.ts
 */
process.env.NODE_ENV = 'production'

// The measurement harness, stringified into each child process. `SETUP`
// defines `parse` (a 0-arg fn that parses a fixed input); we time it.
const HARNESS = `
process.env.NODE_ENV='production'
const now=()=>Number(process.hrtime.bigint())
let ACC=0 // consumed-result sink for the .varied scenarios (defeats DCE)
function med(fn){
  for(let i=0;i<40000;i++)fn()                 // warm to steady state
  const xs=[]
  for(let r=0;r<25;r++){const t0=now();for(let i=0;i<200000;i++)fn();xs.push((now()-t0)/200000)}
  xs.sort((a,b)=>a-b)
  return xs[Math.floor(xs.length/2)]
}
`

interface Lib {
  key: 'pyreon' | 'zod' | 'valibot' | 'arktype'
  setup: string // defines `parse`
}
interface Scenario {
  name: string
  libs: Lib[]
}

// Each setup ends by defining `const parse = () => <one parse of a fixed ok input>`.
const scenarios: Scenario[] = [
  {
    // The HARDEST honest scalar shape: the input ROTATES (8 valid values) and
    // the result is CONSUMED (verdict read + value accumulated), so the engine
    // can neither constant-fold the parse nor dead-code-sink the per-parse
    // allocations — this is the loop where a fixed per-parse ctx/Result cost
    // actually shows (a constant discarded parse lets JSC sink everything and
    // flatters whoever allocates most). `ACC` is a harness global.
    name: 'number.scalar.varied',
    libs: [
      { key: 'pyreon', setup: `const {s}=await import('../src/v1.ts');const P=s.number().int().min(0).max(150);const IN=[1,7,42,99,120,3,88,54];let i=0;const parse=()=>{const r=P.parse(IN[i++&7]);if(r.ok)ACC+=r.value}` },
      { key: 'zod', setup: `const {z}=await import('zod');const Z=z.number().int().min(0).max(150);const IN=[1,7,42,99,120,3,88,54];let i=0;const parse=()=>{const r=Z.safeParse(IN[i++&7]);if(r.success)ACC+=r.data}` },
      { key: 'valibot', setup: `const v=await import('valibot');const V=v.pipe(v.number(),v.integer(),v.minValue(0),v.maxValue(150));const IN=[1,7,42,99,120,3,88,54];let i=0;const parse=()=>{const r=v.safeParse(V,IN[i++&7]);if(r.success)ACC+=r.output}` },
      { key: 'arktype', setup: `const {type}=await import('arktype');const A=type('0 <= number.integer <= 150');const IN=[1,7,42,99,120,3,88,54];let i=0;const parse=()=>{const o=A(IN[i++&7]);if(typeof o==='number')ACC+=o}` },
    ],
  },
  {
    name: 'string.scalar.varied',
    libs: [
      { key: 'pyreon', setup: `const {s}=await import('../src/v1.ts');const P=s.string().min(1);const IN=['a','hello','world','xy','pyreon','bench','zz','q'];let i=0;const parse=()=>{const r=P.parse(IN[i++&7]);if(r.ok)ACC+=r.value.length}` },
      { key: 'zod', setup: `const {z}=await import('zod');const Z=z.string().min(1);const IN=['a','hello','world','xy','pyreon','bench','zz','q'];let i=0;const parse=()=>{const r=Z.safeParse(IN[i++&7]);if(r.success)ACC+=r.data.length}` },
      { key: 'valibot', setup: `const v=await import('valibot');const V=v.pipe(v.string(),v.minLength(1));const IN=['a','hello','world','xy','pyreon','bench','zz','q'];let i=0;const parse=()=>{const r=v.safeParse(V,IN[i++&7]);if(r.success)ACC+=r.output.length}` },
      { key: 'arktype', setup: `const {type}=await import('arktype');const A=type('string >= 1');const IN=['a','hello','world','xy','pyreon','bench','zz','q'];let i=0;const parse=()=>{const o=A(IN[i++&7]);if(typeof o==='string')ACC+=o.length}` },
    ],
  },
  {
    name: 'number.int.range',
    libs: [
      { key: 'pyreon', setup: `const {s}=await import('../src/v1.ts');const P=s.number().int().min(0).max(150);const parse=()=>P.parse(42)` },
      { key: 'zod', setup: `const {z}=await import('zod');const Z=z.number().int().min(0).max(150);const parse=()=>Z.safeParse(42)` },
      { key: 'valibot', setup: `const v=await import('valibot');const V=v.pipe(v.number(),v.integer(),v.minValue(0),v.maxValue(150));const parse=()=>v.safeParse(V,42)` },
      { key: 'arktype', setup: `const {type}=await import('arktype');const A=type('0 <= number.integer <= 150');const parse=()=>A(42)` },
    ],
  },
  {
    name: 'object.deep-nested',
    libs: [
      { key: 'pyreon', setup: `const {s}=await import('../src/v1.ts');const P=s.object({id:s.number().int(),user:s.object({name:s.string().min(2),address:s.object({city:s.string().min(1),zip:s.string().length(5)})})});const ok={id:1,user:{name:'Ada',address:{city:'Paris',zip:'75001'}}};const parse=()=>P.parse(ok)` },
      { key: 'zod', setup: `const {z}=await import('zod');const Z=z.object({id:z.number().int(),user:z.object({name:z.string().min(2),address:z.object({city:z.string().min(1),zip:z.string().length(5)})})});const ok={id:1,user:{name:'Ada',address:{city:'Paris',zip:'75001'}}};const parse=()=>Z.safeParse(ok)` },
      { key: 'valibot', setup: `const v=await import('valibot');const V=v.object({id:v.pipe(v.number(),v.integer()),user:v.object({name:v.pipe(v.string(),v.minLength(2)),address:v.object({city:v.pipe(v.string(),v.minLength(1)),zip:v.pipe(v.string(),v.length(5))})})});const ok={id:1,user:{name:'Ada',address:{city:'Paris',zip:'75001'}}};const parse=()=>v.safeParse(V,ok)` },
      { key: 'arktype', setup: `const {type}=await import('arktype');const A=type({id:'number.integer',user:{name:'string >= 2',address:{city:'string >= 1',zip:'string == 5'}}});const ok={id:1,user:{name:'Ada',address:{city:'Paris',zip:'75001'}}};const parse=()=>A(ok)` },
    ],
  },
  {
    name: 'object.user',
    libs: [
      { key: 'pyreon', setup: `const {s}=await import('../src/v1.ts');const P=s.object({name:s.string().min(2),age:s.number().int().min(0).max(150),email:s.string().email(),tags:s.array(s.string())});const ok={name:'Ada',age:36,email:'ada@example.com',tags:['a','b','c']};const parse=()=>P.parse(ok)` },
      { key: 'zod', setup: `const {z}=await import('zod');const Z=z.object({name:z.string().min(2),age:z.number().int().min(0).max(150),email:z.string().email(),tags:z.array(z.string())});const ok={name:'Ada',age:36,email:'ada@example.com',tags:['a','b','c']};const parse=()=>Z.safeParse(ok)` },
      { key: 'valibot', setup: `const v=await import('valibot');const V=v.object({name:v.pipe(v.string(),v.minLength(2)),age:v.pipe(v.number(),v.integer(),v.minValue(0),v.maxValue(150)),email:v.pipe(v.string(),v.email()),tags:v.array(v.string())});const ok={name:'Ada',age:36,email:'ada@example.com',tags:['a','b','c']};const parse=()=>v.safeParse(V,ok)` },
      { key: 'arktype', setup: `const {type}=await import('arktype');const A=type({name:'string >= 2',age:'0 <= number.integer <= 150',email:'string.email',tags:'string[]'});const ok={name:'Ada',age:36,email:'ada@example.com',tags:['a','b','c']};const parse=()=>A(ok)` },
    ],
  },
  {
    name: 'array.20-objects',
    libs: [
      { key: 'pyreon', setup: `const {s}=await import('../src/v1.ts');const P=s.array(s.object({name:s.string().min(2),age:s.number().int().min(0).max(150)}));const ok=Array.from({length:20},(_,i)=>({name:'User'+i,age:20+(i%50)}));const parse=()=>P.parse(ok)` },
      { key: 'zod', setup: `const {z}=await import('zod');const Z=z.array(z.object({name:z.string().min(2),age:z.number().int().min(0).max(150)}));const ok=Array.from({length:20},(_,i)=>({name:'User'+i,age:20+(i%50)}));const parse=()=>Z.safeParse(ok)` },
      { key: 'valibot', setup: `const v=await import('valibot');const V=v.array(v.object({name:v.pipe(v.string(),v.minLength(2)),age:v.pipe(v.number(),v.integer(),v.minValue(0),v.maxValue(150))}));const ok=Array.from({length:20},(_,i)=>({name:'User'+i,age:20+(i%50)}));const parse=()=>v.safeParse(V,ok)` },
      { key: 'arktype', setup: `const {type}=await import('arktype');const A=type({name:'string >= 2',age:'0 <= number.integer <= 150'}).array();const ok=Array.from({length:20},(_,i)=>({name:'User'+i,age:20+(i%50)}));const parse=()=>A(ok)` },
    ],
  },
]

function measureChild(setup: string): number {
  const code = `${HARNESS}\n${setup}\nprocess.stdout.write('NS='+med(parse).toFixed(3))`
  const proc = Bun.spawnSync(['bun', '-e', code], {
    cwd: import.meta.dir, // bench/ — so '../src/v1.ts' + node_modules resolve
    env: { ...process.env, NODE_ENV: 'production' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const out = new TextDecoder().decode(proc.stdout)
  const m = out.match(/NS=([\d.]+)/)
  if (!m) {
    const err = new TextDecoder().decode(proc.stderr).split('\n').slice(0, 4).join(' ')
    throw new Error(`child failed: ${err || out.slice(0, 120)}`)
  }
  return Number(m[1])
}

const rows: Array<{ name: string } & Record<string, number>> = []
for (const sc of scenarios) {
  const row: { name: string } & Record<string, number> = { name: sc.name }
  for (const lib of sc.libs) row[lib.key] = measureChild(lib.setup)
  rows.push(row)
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}µs` : `${n.toFixed(1)}ns`)
console.log(`\nMONOMORPHIC validation benchmark (separate process per library — real-app shape)`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=production`)
console.log(`Median ns/op (lower = faster). Multiplier = vs fastest in row.\n`)
const head = ['scenario', 'pyreon', 'zod', 'valibot', 'arktype', 'winner']
console.log(head.map((h) => h.padEnd(h === 'scenario' ? 20 : 13)).join(''))
console.log('─'.repeat(86))
for (const r of rows) {
  const vals = { pyreon: r.pyreon!, zod: r.zod!, valibot: r.valibot!, arktype: r.arktype! }
  const min = Math.min(...Object.values(vals))
  const winner = Object.entries(vals).find(([, x]) => x === min)?.[0] ?? '?'
  const cell = (n: number) => `${fmt(n)}(${(n / min).toFixed(1)}x)`
  console.log(
    r.name.padEnd(20) +
      cell(vals.pyreon).padEnd(13) +
      cell(vals.zod).padEnd(13) +
      cell(vals.valibot).padEnd(13) +
      cell(vals.arktype).padEnd(13) +
      winner,
  )
}
console.log('\n' + JSON.stringify({ meta: { node: process.version, platform: `${process.platform}/${process.arch}`, mode: 'monomorphic' }, rows }, null, 0))
