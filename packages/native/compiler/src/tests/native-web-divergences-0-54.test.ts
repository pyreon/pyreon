// Five web↔native divergences found in the 0.54 pre-release review, each pinned against the REAL toolchains:
//
// 1. A string `.length` inside an array callback emitted a 32-bit `Int` on Kotlin where a TS integer is `Long`
//    (`names.map((n) => n.length)` → `List<Int>` against `List<Long>`) — the callback param was untyped.
// 2. A helper parameter typed `number` that a caller feeds a Double emitted as `Int` — on BOTH targets.
// 3. `throw 'plain'` then `String(e)` read `Error: plain` natively and `plain` on the web.
// 4. `const [first] = []` trapped natively where the web binds `undefined`.
// 5. Swift `slice` / `substring` / `charAt` / `indexOf` counted Characters while `.length` counts UTF-16 units.
//
// The compile half asserts the emit COMPILES (a warning count is not evidence). The behaviour half EXECUTES the
// emitted helpers — with the shipped runtime files linked, not stubs — and compares to the web's own answer.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { KOTLIN_THROWN_PREAMBLE, SWIFT_THROWN_PREAMBLE } from '../throw-lowering'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const head = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
`

const swiftOk = isSwiftcAvailable()
const kotlincOk = isKotlincAvailable()
function javaOk(): boolean {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const kotlinRunOk = kotlincOk && javaOk()

/** A top-level declaration: its first line through the line before the next column-0 line (a column-0 `}` included). */
function extractTopLevel(code: string, start: RegExp): string {
  const lines = code.split('\n')
  const i = lines.findIndex((l) => start.test(l))
  if (i < 0) throw new Error(`declaration not found in emit: ${start}\n${code}`)
  let end = i
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j]!
    if (l.startsWith('}')) {
      end = j
      break
    }
    if (/^\S/.test(l)) break
    end = j
  }
  return lines.slice(i, end + 1).join('\n')
}

function runtimeFile(lang: 'swift' | 'kotlin', file: string): string {
  const path =
    lang === 'swift'
      ? join(__dirname, `../../../runtime-swift/Sources/PyreonRuntime/${file}.swift`)
      : join(__dirname, `../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/${file}.kt`)
  // One compilation unit cannot carry the runtime's package declaration; the harness file is package-less.
  return readFileSync(path, 'utf8').replace(/^package .*$/m, '')
}

function runSwift(program: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-divergence-'))
  const file = join(dir, 'main.swift')
  const bin = join(dir, 'prog')
  writeFileSync(file, `import Foundation\n${program}\n`)
  execFileSync('swiftc', [file, '-o', bin], { stdio: 'pipe' })
  return execFileSync(bin, { encoding: 'utf8' }).trim()
}

function runKotlin(program: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-divergence-'))
  const file = join(dir, 'main.kt')
  const jar = join(dir, 'p.jar')
  writeFileSync(file, program)
  execFileSync('kotlinc', [file, '-include-runtime', '-d', jar], { stdio: 'pipe' })
  return execFileSync('java', ['-jar', jar], { encoding: 'utf8' }).trim()
}

// ── 1. Kotlin `.length` in an array callback ────────────────────────────────────────────────────────────────────

const lengthInCallback = `${head}
function sum(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) }
function App() {
  const names = signal(['ab', 'cde'])
  const lens = signal<number[]>([0])
  const block = () => sum(names().map((n) => { const t = n.trim(); return t.length }))
  const concise = () => sum(names().map((n) => n.length))
  const kept = () => names().filter((n) => n.length > 2).length
  const total = () => names().reduce((acc, n) => acc + n.length, 0)
  return (<Stack><Text>{String(block())}</Text><Text>{String(concise())}</Text><Text>{String(kept())}</Text>
    <Text>{String(total())}</Text>
    <Button onPress={() => lens.set(names().map((n) => { return n.length }))}>x</Button></Stack>)
}`

describe('1 — a string `.length` inside an array callback is a Long on Kotlin', () => {
  it('the callback param is typed by the receiver element, so `.length` widens with `.toLong()`', () => {
    const out = transform(lengthInCallback, { target: 'kotlin' })
    expect(out.code).toContain('return@map t.length.toLong()')
    expect(out.code).toContain('names.map({ n -> n.length.toLong() })')
    expect(out.code).toContain('acc + n.length.toLong()')
  })

  it.runIf(kotlincOk)('kotlinc compiles it', () => {
    const out = transform(lengthInCallback, { target: 'kotlin' })
    const r = validateKotlin(out.code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(swiftOk)('swiftc still compiles the Swift twin', () => {
    const out = transform(lengthInCallback, { target: 'swift' })
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})

// ── 2. A `number` parameter fed a Double ────────────────────────────────────────────────────────────────────────

const paramFedDouble = `${head}
function fmt(n: number): string { return 'v=' + String(n) }
function twice(n: number): number { return n * 2 }
function count(n: number): string { return String(n) }
function App() {
  const price = signal(2.5)
  const qty = signal(3)
  const localTotal = (x: number): number => x + 1
  return (<Stack><Text>{fmt(price())}</Text><Text>{String(twice(price()))}</Text><Text>{fmt(2)}</Text>
    <Text>{count(qty())}</Text><Text>{String(localTotal(price()))}</Text></Stack>)
}`

describe('2 — a `number` parameter takes the storage its callers prove', () => {
  it('a Double argument widens the parameter, and a `number` return re-infers over it', () => {
    const swift = transform(paramFedDouble, { target: 'swift' }).code
    expect(swift).toContain('func fmt(_ n: Double) -> String')
    expect(swift).toContain('func twice(_ n: Double) -> Double')
    // A parameter only ever called with integers keeps its integer storage.
    expect(swift).toContain('func count(_ n: Int) -> String')
    const kotlin = transform(paramFedDouble, { target: 'kotlin' }).code
    expect(kotlin).toContain('fun fmt(n: Double): String')
    expect(kotlin).toContain('fun twice(n: Double): Double')
    expect(kotlin).toContain('fun count(n: Long): String')
  })

  it.runIf(swiftOk)('swiftc compiles it', () => {
    const r = validateSwiftWithStubs(transform(paramFedDouble, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(kotlincOk)('kotlinc compiles it', () => {
    const r = validateKotlin(transform(paramFedDouble, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  // The evidence is read wherever the call sits: a loop, a branch, a switch arm, a try block, a block arrow, or a
  // local whose initializer is the Double.
  it.each([
    ['for-of', 'for (const p of [price()]) out = fmt(p)'],
    ['for-range', 'for (let i = 0; i < 2; i++) out = fmt(price())'],
    ['while', 'while (out === "") out = fmt(price())'],
    ['switch', 'switch (out) { case "": out = fmt(price()); break }'],
    ['try', 'try { out = fmt(price()) } catch (e) { out = "" } finally { out = out + "" }'],
    ['if/else', 'if (out === "") { out = "" } else { out = fmt(price()) }'],
    ['local', 'const p = price(); out = fmt(p)'],
    ['block arrow', 'const f = () => { return fmt(price()) }; out = f()'],
  ])('a Double argument inside a %s widens the parameter', (_shape, stmt) => {
    const src = `${head}
function fmt(n: number): string { return 'v=' + String(n) }
function App() {
  const price = signal(2.5)
  const run = () => { let out = ''; ${stmt}; return out }
  return (<Stack><Text>{run()}</Text></Stack>)
}`
    expect(transform(src, { target: 'swift' }).code).toContain('func fmt(_ n: Double) -> String')
  })

  // Found on the way: a concise Kotlin helper whose returned TEXT contains `=` (`'v=' + …`) was read as an
  // assignment and emitted as a Unit block with no `return` ("missing return statement").
  it('a returned string containing `=` keeps the expression body on Kotlin', () => {
    const kotlin = transform(paramFedDouble, { target: 'kotlin' }).code
    expect(kotlin).toMatch(/fun fmt\(n: Double\): String = "v=" \+/)
  })
})

// ── 3. `throw 'plain'` stringifies without the `Error: ` prefix ─────────────────────────────────────────────────

const thrownString = `${head}
function describeThrow(raw: string): string {
  try {
    if (raw === '') throw 'plain'
    if (raw === 't') throw \`tpl \${raw}\`
    throw new Error('boxed')
  } catch (e) {
    return String(e) + '/' + \`\${e}\`
  }
}
function App() {
  const a = signal(describeThrow(''))
  return (<Stack><Text>{a()}</Text></Stack>)
}`

/** What the web answers, by running the same function. */
function describeThrowWeb(raw: string): string {
  try {
    if (raw === '') throw 'plain'
    if (raw === 't') throw `tpl ${raw}`
    throw new Error('boxed')
  } catch (e) {
    return String(e) + '/' + `${e}`
  }
}

describe('3 — a thrown string describes itself as the string', () => {
  const expected = ['', 't', 'x'].map(describeThrowWeb).join('|')

  it('the throw site records that the value is the raw string', () => {
    expect(transform(thrownString, { target: 'swift' }).code).toContain('PyreonThrown(message: "plain", raw: true)')
    expect(transform(thrownString, { target: 'kotlin' }).code).toContain('PyreonThrown("plain", raw = true)')
  })

  it.runIf(swiftOk)('Swift executes to the web answer', () => {
    const code = transform(thrownString, { target: 'swift' }).code
    const fn = extractTopLevel(code, /^func describeThrow\(/)
    const out = runSwift(
      `${SWIFT_THROWN_PREAMBLE}\n${fn}\nprint(["", "t", "x"].map { describeThrow($0) }.joined(separator: "|"))`,
    )
    expect(out).toBe(expected)
  }, 180_000)

  it.runIf(kotlinRunOk)('Kotlin executes to the web answer', () => {
    const code = transform(thrownString, { target: 'kotlin' }).code
    const fn = extractTopLevel(code, /^fun describeThrow\(/)
    const out = runKotlin(
      `${KOTLIN_THROWN_PREAMBLE}\n${fn}\nfun main() { println(listOf("", "t", "x").map { describeThrow(it) }.joinToString("|")) }\n`,
    )
    expect(out).toBe(expected)
  }, 180_000)
})

// ── 4. Destructuring past the end of an array ───────────────────────────────────────────────────────────────────

const destructure = `${head}
function pair(xs: string[]): string {
  const [first, second] = xs
  return (first ?? 'none') + '/' + (second === undefined ? 'none' : second)
}
function firstLen(xs: string[]): number {
  const [only] = xs
  if (!only) return -1
  return only.length
}
function rgb(c: number[]): number {
  const [r, g, b] = c
  return r + g + b
}
function App() {
  const items = signal<string[]>([])
  const [a, b] = items()
  return (<Stack><Text>{pair(items())}</Text><Text>{a ?? 'empty'}</Text>
    <Text>{b === undefined ? 'nob' : b}</Text><Text>{String(firstLen([]))}</Text><Text>{String(rgb([1, 2, 3]))}</Text></Stack>)
}`

function pairWeb(xs: string[]): string {
  const [first, second] = xs
  return (first ?? 'none') + '/' + (second === undefined ? 'none' : second)
}
function firstLenWeb(xs: string[]): number {
  const [only] = xs
  if (!only) return -1
  return only.length
}

describe('4 — a destructured element tested for absence reads nil-safely', () => {
  const expected = [
    pairWeb([]),
    pairWeb(['x']),
    pairWeb(['x', 'y']),
    String(firstLenWeb([])),
    String(firstLenWeb(['abc'])),
  ].join('|')

  it('an element only ever used as present stays a plain subscript', () => {
    const swift = transform(destructure, { target: 'swift' }).code
    expect(swift).toMatch(/let r = __pyDestr\d+\[0\]/)
    expect(swift).toMatch(/let first = \(__pyDestr\d+\.indices\.contains\(0\)/)
    const kotlin = transform(destructure, { target: 'kotlin' }).code
    expect(kotlin).toMatch(/val r = __pyDestr\d+\[0\]/)
    expect(kotlin).toMatch(/val first = __pyDestr\d+\.getOrNull\(0\)/)
    // The component-scope destructure inlines the element read at each use; the tested uses read nil-safely.
    expect(kotlin).toMatch(/__pyDestr\d+\.getOrNull\(0\) \?: "empty"/)
  })

  it.runIf(swiftOk)('swiftc compiles it', () => {
    const r = validateSwiftWithStubs(transform(destructure, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(kotlincOk)('kotlinc compiles it', () => {
    const r = validateKotlin(transform(destructure, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(swiftOk)('Swift executes to the web answer (an empty array no longer traps)', () => {
    const code = transform(destructure, { target: 'swift' }).code
    const fns = [extractTopLevel(code, /^func pair\(/), extractTopLevel(code, /^func firstLen\(/)].join('\n')
    const out = runSwift(
      `${fns}\nprint([pair([]), pair(["x"]), pair(["x", "y"]), String(firstLen([])), String(firstLen(["abc"]))].joined(separator: "|"))`,
    )
    expect(out).toBe(expected)
  }, 180_000)

  it.runIf(kotlinRunOk)('Kotlin executes to the web answer (an empty array no longer throws)', () => {
    const code = transform(destructure, { target: 'kotlin' }).code
    const fns = [extractTopLevel(code, /^fun pair\(/), extractTopLevel(code, /^fun firstLen\(/)].join('\n')
    const out = runKotlin(
      `${fns}\nfun main() { println(listOf(pair(listOf()), pair(listOf("x")), pair(listOf("x", "y")), firstLen(listOf()).toString(), firstLen(listOf("abc")).toString()).joinToString("|")) }\n`,
    )
    expect(out).toBe(expected)
  }, 180_000)
})

// ── 5. String positions are UTF-16 offsets on Swift too ─────────────────────────────────────────────────────────

const positions = `${head}
function cut(s: string): string {
  return [
    s.slice(0, 3),
    s.slice(1),
    s.slice(-1),
    s.slice(-3, -1),
    s.substring(1, 3),
    s.substring(3),
    s.charAt(3),
    s.charAt(9),
    String(s.indexOf('b')),
    String(s.indexOf('b', 4)),
    String(s.includes('a', 1)),
    String(s.startsWith('b', 3)),
    String(s.endsWith('👍', 3)),
    s.padStart(6, '*'),
    String(s.length),
  ].join(',')
}
function App() {
  const s = signal('a👍b')
  return (<Stack><Text>{cut(s())}</Text></Stack>)
}`

/** The web's answer, by running the same function. */
function cutWeb(s: string): string {
  return [
    s.slice(0, 3),
    s.slice(1),
    s.slice(-1),
    s.slice(-3, -1),
    s.substring(1, 3),
    s.substring(3),
    s.charAt(3),
    s.charAt(9),
    String(s.indexOf('b')),
    String(s.indexOf('b', 4)),
    String(s.includes('a', 1)),
    String(s.startsWith('b', 3)),
    String(s.endsWith('👍', 3)),
    s.padStart(6, '*'),
    String(s.length),
  ].join(',')
}

describe('5 — string positions count UTF-16 units on both targets', () => {
  const inputs = ['a👍b', 'abcdef', 'éb', '']
  const expected = inputs.map(cutWeb).join('|')

  it('Swift lowers every position-taking string method through the UTF-16 runtime', () => {
    const swift = transform(positions, { target: 'swift' }).code
    for (const call of ['pyreonSlice(s, 0, 3)', 'pyreonSubstring(s, 1, 3)', 'pyreonCharAt(s, 3)', 'pyreonIndexOf(s, "b")'])
      expect(swift).toContain(call)
    expect(swift).not.toMatch(/dropFirst|Array\(s\)|range\(of:/)
  })

  it.runIf(swiftOk)('Swift executes to the web answer (shipped PyreonSlice.swift linked)', () => {
    const code = transform(positions, { target: 'swift' }).code
    const fn = extractTopLevel(code, /^func cut\(/)
    const literal = inputs.map((s) => JSON.stringify(s)).join(', ')
    const out = runSwift(
      `${runtimeFile('swift', 'PyreonSlice')}\n${fn}\nprint([${literal}].map { cut($0) }.joined(separator: "|"))`,
    )
    expect(out).toBe(expected)
  }, 180_000)

  it.runIf(kotlinRunOk)('Kotlin executes to the web answer (shipped PyreonSlice.kt linked)', () => {
    const code = transform(positions, { target: 'kotlin' }).code
    const fn = extractTopLevel(code, /^fun cut\(/)
    const literal = inputs.map((s) => JSON.stringify(s)).join(', ')
    const out = runKotlin(
      `${runtimeFile('kotlin', 'PyreonSlice')}\n${fn}\nfun main() { println(listOf(${literal}).map { cut(it) }.joinToString("|")) }\n`,
    )
    expect(out).toBe(expected)
  }, 180_000)
})
