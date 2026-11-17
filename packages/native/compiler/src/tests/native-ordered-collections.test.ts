// `Map`, `Set` and `Record<string, T>` keep INSERTION order on iOS, as they do on the web and on Android.
//
// Swift's `Dictionary` / `Set` order their entries by hash, and Swift seeds hashing per process: the same `Record`
// rendered in a different order on every launch, `Object.keys(r).join(',')` changed between runs, and
// `JSON.stringify(record)` documented the order as "not recoverable". Kotlin was already right (`mutableMapOf` /
// `mutableSetOf` are LinkedHashMap / LinkedHashSet). The Swift emit now spells these types with the runtime's ordered
// twins (`PyreonMap` / `PyreonSet`, `PyreonCollections.swift`), which keep the Dictionary / Set spelling the emit
// already used. Found on the way and lowered here too: `m.keys()` / `m.values()` and `Object.keys(r)` /
// `Object.values(r)` on a map (emitted verbatim or as an empty array), and the `new Map(other)` copy.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

const app = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Todo = { id: string; title: string }
export function App() {
  const m = signal(new Map<string, number>([['b', 1], ['a', 2]]))
  const tags = signal(new Set<string>(['x']))
  const counts = signal<Record<string, number>>({ b: 1, a: 2 })
  const todos = signal<Todo[]>([])
  const byId = computed(() => new Map(todos().map((t) => [t.id, t])))
  const keys = computed(() => [...m().keys()].join(','))
  const total = computed(() => Object.values(counts()).reduce((a, b) => a + b, 0))
  const names = computed(() => Object.keys(counts()).join(','))
  const bump = () => {
    const next = new Map(m())
    next.set('c', 3)
    next.delete('b')
    m.set(next)
    const t = new Set(tags())
    t.add('y')
    tags.set(t)
  }
  return (<Stack><Text>{keys()}</Text><Text>{total()}</Text><Text>{names()}</Text><Text>{byId().size}</Text>
    <Text>{String(tags().has('y'))}</Text><Button onPress={bump}>b</Button></Stack>)
}`

describe('Map / Set / Record emit', () => {
  it('Swift: the ordered twins, keys / values as arrays, a map copy by value', () => {
    const { code, warnings } = emit(app, 'swift')
    expect(code).toContain('@State private var m: PyreonMap<String, Int> = PyreonMap<String, Int>([("b", 1), ("a", 2)])')
    expect(code).toContain('@State private var tags: PyreonSet<String> = PyreonSet(["x"])')
    expect(code).toContain('@State private var counts: PyreonMap<String, Int> = PyreonMap<String, Int>([("b", 1), ("a", 2)])')
    expect(code).toContain('PyreonMap(todos.map { t in (t.id, t) })')
    expect(code).toContain('m.keys.joined(separator: ",")')
    expect(code).toContain('counts.values.reduce(')
    expect(code).toContain('counts.keys.joined(separator: ",")')
    expect(code).toMatch(/var next = m\n\s+next\["c"\] = 3\n\s+next\.removeValue\(forKey: "b"\)/)
    expect(code).not.toMatch(/\[String: Int\]|Dictionary\(|Set<String>\(/)
    expect(warnings).toEqual([])
  })

  it('Kotlin: LinkedHashMap already keeps order; keys / values as lists, the copy keeps it', () => {
    const { code, warnings } = emit(app, 'kotlin')
    expect(code).toContain('m.keys.toList().joinToString(",")')
    expect(code).toContain('counts.values.toList().fold(')
    expect(code).toContain('counts.keys.toList().joinToString(",")')
    expect(code).toContain('val next = m.toMutableMap()')
    expect(warnings).toEqual([])
  })

  it('a copy of something that is not a map is named', () => {
    const src = app.replace('const next = new Map(m())', 'const next = new Map(todos())')
    expect(emit(src, 'swift').warnings.join('\n')).toContain('only a copy of another Map / Record lowers natively')
  })

  it.runIf(isSwiftcAvailable())('swiftc type-checks it (stubs)', () => {
    const r = validateSwiftWithStubs(emit(app, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isSwiftUIAvailable())('swiftc type-checks it (real SDK)', () => {
    const r = validateSwiftTypecheck(emit(app, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc compiles it', () => {
    const r = validateKotlin(emit(app, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})

// ── Behaviour: the Swift runtime keeps the web's order rules ───────────────────────────────────────────────────

function webSequence(): string {
  const out: string[] = []
  const m = new Map<string, number>([['b', 1], ['a', 2], ['b', 9]])
  out.push(`ctor ${[...m.keys()].join(',')} ${[...m.values()].join(',')}`)
  m.set('c', 3)
  m.set('b', 4)
  out.push(`set ${[...m.entries()].map(([k, v]) => `${k}=${v}`).join(',')}`)
  m.delete('b')
  m.set('b', 5)
  out.push(`readd ${[...m.keys()].join(',')}`)
  const s = new Set(['z', 'a', 'z', 'm'])
  s.add('a')
  s.delete('z')
  s.add('z')
  out.push(`set ${[...s].join(',')}`)
  const r: Record<string, number> = { zeta: 1, alpha: 2 }
  r.mid = 3
  out.push(`json ${JSON.stringify(r)}`)
  return out.join('\n')
}

const SWIFT_SCENARIO = `
var out: [String] = []
var m: PyreonMap<String, Int> = PyreonMap([("b", 1), ("a", 2), ("b", 9)])
out.append("ctor \\(m.keys.joined(separator: ",")) \\(m.values.map { String($0) }.joined(separator: ","))")
m["c"] = 3
m["b"] = 4
out.append("set " + m.map { "\\($0.key)=\\($0.value)" }.joined(separator: ","))
m.removeValue(forKey: "b")
m["b"] = 5
out.append("readd \\(m.keys.joined(separator: ","))")
var s = PyreonSet(["z", "a", "z", "m"])
s.insert("a")
s.remove("z")
s.insert("z")
out.append("set \\(s.map { $0 }.joined(separator: ","))")
var r: PyreonMap<String, Int> = ["zeta": 1, "alpha": 2]
r["mid"] = 3
out.append("json " + PyreonJSON.stringify(r))
print(out.joined(separator: "\\n"))
`

const runtimeFile = (name: string) =>
  readFileSync(join(__dirname, `../../../runtime-swift/Sources/PyreonRuntime/${name}`), 'utf8').replace(
    /^import Foundation$/m,
    '',
  )

describe('PyreonMap / PyreonSet keep the web order rules', () => {
  it.runIf(isSwiftcAvailable())('constructor duplicates, overwrite, delete + re-add, Set order, JSON key order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-ordered-'))
    writeFileSync(
      join(dir, 'main.swift'),
      `import Foundation\n${runtimeFile('PyreonCollections.swift')}\n${runtimeFile('PyreonNumber.swift')}\n${runtimeFile('PyreonJSON.swift')}\n${SWIFT_SCENARIO}`,
    )
    execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
    expect(execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n')).toEqual(webSequence().split('\n'))
  }, 180_000)
})

// ── End to end: the compiled code iterates in the web's order ──────────────────────────────────────────────────
//
// What escaped the emit-level checks above: a seeded `new Map([[k, v], …])` and a `Record` literal were emitted as a
// bare Swift dictionary literal (`[k: v, …]`), which is a `PyreonMap` only where something pins the type. An
// unannotated local (`const r: Record<string, number> = {…}` lowers to `let r = […]`) made it a `Dictionary`, so
// `Object.keys(r)` came out in hash order — a different order on every launch. And `JSON.parse` into a `Record`
// took `JSONDecoder`'s `allKeys`, whose order is also a hash. Five keys make a hash order matching the source order
// a 1-in-120 accident, and the Swift side runs each case in a fresh process (a fresh hash seed).

const ORDER_CORPUS = `
export function c_map_keys(): string { const m = new Map<string, number>([['zeta', 1], ['alpha', 2], ['mid', 3], ['b', 4], ['q', 5]]); return [...m.keys()].join(',') }
export function c_map_untyped(): string { const m = new Map([['zeta', 'z'], ['alpha', 'a'], ['mid', 'm'], ['b', 'b'], ['q', 'q']]); return [...m.values()].join(',') }
export function c_map_duplicate(): string { const m = new Map<string, number>([['zeta', 1], ['alpha', 2], ['zeta', 3]]); return [...m.keys()].join(',') + ' ' + [...m.values()].join(',') }
export function c_map_set(): string { const m = new Map<string, number>(); m.set('zeta', 1); m.set('alpha', 2); m.set('mid', 3); m.set('k', 4); m.set('b', 5); return [...m.keys()].join(',') }
export function c_record_keys(): string { const r: Record<string, number> = { zeta: 1, alpha: 2, mid: 3, k: 4, b: 5 }; return Object.keys(r).join(',') }
export function c_record_values(): string { const r: Record<string, number> = { zeta: 1, alpha: 2, mid: 3, k: 4, b: 5 }; return Object.values(r).join(',') }
function rec(): Record<string, string> { return { zeta: 'z', alpha: 'a', mid: 'm', k: 'k', b: 'b' } }
export function c_record_returned(): string { return Object.keys(rec()).join(',') }
export function c_record_stringify(): string { const r: Record<string, number> = { zeta: 1, alpha: 2, mid: 3, k: 4, b: 5 }; return JSON.stringify(r) }
export function c_set(): string { const s = new Set<string>(['zeta', 'alpha', 'mid', 'k', 'b']); return [...s].join(',') }
function decode(): Record<string, number> { return JSON.parse('{"zeta":1,"alpha":2,"mid":3,"k":4,"b":5,"q":6}') as Record<string, number> }
export function c_json_decode(): string { try { return Object.keys(decode()).join(',') } catch { return 'err' } }
type Row = { name: string; tags: Record<string, number> }
function decodeRows(): Row[] { return JSON.parse('[{"name":"x","tags":{"y":1,"c":2,"x":3,"d":4,"e":5}},{"name":"y","tags":{"zz":1,"aa":2,"mm":3,"bb":4,"k\\u0041":5}}]') as Row[] }
export function c_json_nested(): string { try { return JSON.stringify(decodeRows()) } catch { return 'err' } }
`

describe('Map / Record order, end to end on both targets', () => {
  it('the corpus is what it claims (five or more keys, never in sorted order)', () => {
    for (const r of runWeb(ORDER_CORPUS)) expect(r).not.toBe('err')
    expect(runWeb(ORDER_CORPUS)[0]).toBe('zeta,alpha,mid,b,q')
  })

  it('no Map / Record literal reaches Swift as a bare dictionary literal', () => {
    const code = transform(`${ORDER_CORPUS}\nexport function H() { return null }`, { target: 'swift' }).code ?? ''
    expect(code).not.toMatch(/= \["/)
    expect(code).toContain('PyreonMap<String, Int>([("zeta", 1), ("alpha", 2)')
  })

  it.runIf(canRunSwift())('Swift iterates in the web order', () => {
    expect(mismatches(caseNames(ORDER_CORPUS), runWeb(ORDER_CORPUS), runSwift(ORDER_CORPUS))).toEqual([])
  }, 600_000)

  it.runIf(canRunKotlin())('Kotlin iterates in the web order', () => {
    expect(mismatches(caseNames(ORDER_CORPUS), runWeb(ORDER_CORPUS), runKotlin(ORDER_CORPUS))).toEqual([])
  }, 600_000)
})
