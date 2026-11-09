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
    expect(code).toContain('@State private var m: PyreonMap<String, Int> = ["b": 1, "a": 2]')
    expect(code).toContain('@State private var tags: PyreonSet<String> = PyreonSet(["x"])')
    expect(code).toContain('@State private var counts: PyreonMap<String, Int> = ["b": 1, "a": 2]')
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
