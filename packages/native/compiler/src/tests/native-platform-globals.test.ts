// JavaScript / browser globals and JavaScript-only methods in native output.
//
// A probe of everyday app code found a class of shapes that compiled with ZERO warnings and failed the native build:
// the emitters lower a fixed set of globals (`Math.*`, `Date.now`, `parseInt`, `console.log`, …) and re-emit anything
// outside it verbatim — `setTimeout(…)`, `fetch(…)`, `Promise.all(…)`, `Number.isNaN(v)`, `a.localeCompare(b)`,
// `crypto.randomUUID()`, `console.error(…)`. Two halves close it:
//
// - the frequent pure ones LOWER (the `Number.` spellings canonicalize to the globals, `isFinite`, a NaN test on a
//   parse call, `localeCompare`, `crypto.randomUUID`, every `console` level), proven by executing the emitted helpers
//   on both toolchains against the web's own answer;
// - everything else that survives is NAMED (`verbatimPlatformWarnings`), judged by survival in the final output.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const head = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Todo = { id: string; title: string }
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

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

// ── The lowered half ────────────────────────────────────────────────────────────────────────────────────────────

const lowered = `${head}
function App() {
  const raw = signal('12')
  const todos = signal<Todo[]>([])
  const n = computed(() => { const v = parseInt(raw(), 10); return Number.isNaN(parseInt(raw(), 10)) ? 0 : v })
  const f = computed(() => Number.parseFloat(raw()) + Number.parseInt(raw(), 10))
  const finite = computed(() => Number.isFinite(parseFloat(raw())))
  const ratio = computed(() => Number.isFinite(f() / 3) && !Number.isNaN(f()))
  const sorted = computed(() => [...todos()].sort((a, b) => a.title.localeCompare(b.title)))
  const id = computed(() => crypto.randomUUID())
  const log = () => { console.log('n', n()); console.warn('w'); console.error('e', f(), finite()); console.info(); console.debug(id()) }
  return (<Stack><Text>{n()}</Text><Text>{f()}</Text><Text>{String(finite())}</Text><Text>{String(ratio())}</Text>
    <Text>{sorted().length}</Text><Text>{id()}</Text><Button onPress={log}>log</Button></Stack>)
}`

describe('frequent globals lower on both targets', () => {
  it('Swift: Number.* canonicalizes, a NaN test on a parse checks the parse, localeCompare / randomUUID / console lower', () => {
    const { code, warnings } = emit(lowered, 'swift')
    expect(code).toContain('(pyreonParseInt(raw, 10) == nil) ? 0 : v')
    expect(code).toContain('pyreonParseFloat(raw) + Double((pyreonParseInt(raw, 10) ?? 0))')
    expect(code).toContain('(pyreonParseFloat(raw)).isFinite')
    expect(code).toContain('(f / Double(3)).isFinite && !(f).isNaN')
    expect(code).toContain('a.title.localizedCompare(b.title).rawValue')
    expect(code).toContain('private var id: String { UUID().uuidString.lowercased() }')
    expect(code).toContain('print("e", f, finite)')
    expect(code).not.toMatch(/Number\.|crypto\.|console\./)
    expect(warnings).toEqual([])
  })

  it('Kotlin: the same shapes; console joins several arguments because println takes one', () => {
    const { code, warnings } = emit(lowered, 'kotlin')
    expect(code).toContain('if ((pyreonParseInt(raw, 10) == null)) 0L else v')
    expect(code).toContain('(pyreonParseFloat(raw)).isFinite()')
    expect(code).toContain('java.text.Collator.getInstance().compare(a.title, b.title).toLong()')
    expect(code).toContain('java.util.UUID.randomUUID().toString()')
    expect(code).toContain('println(listOf<Any?>("e", f, finite).joinToString(" "))')
    expect(code).toContain('println("w")')
    expect(code).not.toMatch(/Number\.|crypto\.|console\./)
    expect(warnings).toEqual([])
  })

  it.runIf(swiftOk)('swiftc type-checks the Swift (stubs)', () => {
    const r = validateSwiftWithStubs(emit(lowered, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isSwiftUIAvailable())('swiftc type-checks the Swift (real SDK)', () => {
    const r = validateSwiftTypecheck(emit(lowered, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(kotlincOk)('kotlinc compiles the Kotlin', () => {
    const r = validateKotlin(emit(lowered, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  // The real-SDK lane links a runtime file only when the emit names one of its functions: a source that parses text
  // and never interpolates a Double must still bring `PyreonNumber.swift` with it.
  it.runIf(isSwiftUIAvailable())('a parse with no Double interpolation still links the parsers (real SDK)', () => {
    const src = `${head}
function App() {
  const raw = signal('3')
  const big = computed(() => parseFloat(raw()) > 2 && parseInt(raw(), 10) < 9 && Number(raw()) !== 0)
  return (<Stack><Text>{big() ? 'big' : 'small'}</Text></Stack>)
}`
    const code = emit(src, 'swift').code
    expect(code).not.toContain('pyreonNumberString(')
    const r = validateSwiftTypecheck(code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it('an optional receiver keeps the optional on both targets', () => {
    const src = `${head}
function App() {
  const t = signal<Todo | undefined>(undefined)
  const c = computed(() => t()?.title.localeCompare('m') ?? 0)
  return (<Stack><Text>{c()}</Text></Stack>)
}`
    expect(emit(src, 'swift').code).toContain('(t?.title.localizedCompare("m").rawValue ?? 0)')
    expect(emit(src, 'kotlin').code).toContain('?.let { java.text.Collator.getInstance().compare(it, "m").toLong() }')
  })
})

describe('a NaN test on a non-literal integer is named, because a native integer is never NaN', () => {
  it('`const v = parseInt(s); isNaN(v)` folds and says why', () => {
    const src = `${head}
function App() {
  const raw = signal('x')
  const bad = computed(() => { const v = parseInt(raw(), 10); return isNaN(v) })
  return (<Stack><Text>{String(bad())}</Text></Stack>)
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const w = emit(src, target).warnings.join('\n')
      expect(w).toContain('a native integer is never NaN')
      expect(w).toContain('isNaN(parseInt(text))')
    }
  })

  it('a literal argument is not named', () => {
    const src = `${head}
function App() { return (<Stack><Text>{String(isNaN(3))}</Text></Stack>) }`
    expect(emit(src, 'swift').warnings).toEqual([])
  })
})

// ── Behaviour: the emitted helpers EXECUTE and agree with the web ───────────────────────────────────────────────

const helpers = `${head}
function cmp(a: string, b: string): number { return Math.sign(a.localeCompare(b)) }
function nums(s: string): string {
  const i = isNaN(parseInt(s, 10)) ? 'NaN' : String(parseInt(s, 10))
  const h = Number.isNaN(Number.parseInt(s, 16)) ? 'NaN' : String(parseInt(s, 16))
  const f = String(parseFloat(s))
  const n = String(Number(s))
  const fin = String(Number.isFinite(parseFloat(s)))
  return i + ' ' + h + ' ' + f + ' ' + n + ' ' + fin
}
function uuidShape(): boolean { const u = crypto.randomUUID(); return u.length === 36 && u === u.toLowerCase() && u.charAt(14) === '4' }
function App() { return (<Stack><Text>{String(cmp('a', 'b'))}</Text></Stack>) }`

// The web's answers, computed by the same functions in this process.
const webCmp = (a: string, b: string) => Math.sign(a.localeCompare(b))
const webNums = (s: string) => {
  const i = isNaN(parseInt(s, 10)) ? 'NaN' : String(parseInt(s, 10))
  const h = Number.isNaN(Number.parseInt(s, 16)) ? 'NaN' : String(parseInt(s, 16))
  return `${i} ${h} ${String(parseFloat(s))} ${String(Number(s))} ${String(Number.isFinite(parseFloat(s)))}`
}
const CMP_CASES: [string, string][] = [['a', 'b'], ['b', 'a'], ['a', 'a'], ['a', 'B'], ['B', 'a'], ['apple', 'Apple']]
// Each one a shape where Foundation / kotlin's whole-string parse disagreed with the web's algorithm. Integers past
// 2^53 are left out on purpose: a native Int is exact there, where the web's float is not.
const PARSE_CASES = ['12', 'abc', '-7', '0', '1e3', '3.5', '12px', ' 42 ', '', '  ', '0x1f', 'ff', '-0', '.5', '5.', '1e', '+3', '-Infinity', 'Infinityx', '1_000', '0b101']

const runtimeNumber = (lang: 'swift' | 'kotlin') =>
  readFileSync(
    lang === 'swift'
      ? join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonNumber.swift')
      : join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonNumber.kt'),
    'utf8',
  ).replace(/^(?:package|import) .*$/gm, '')

/** A top-level declaration: from its first line to the next column-0 line. */
function topLevel(code: string, start: RegExp): string {
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

const expected = [
  ...CMP_CASES.map(([a, b]) => `cmp ${a} ${b} ${webCmp(a, b)}`),
  ...PARSE_CASES.map((s) => `parse [${s}] ${webNums(s)}`),
  'uuid true',
].join('\n')

// `pyreonNumString` is the file-level helper the emitter writes for `String(number)`.
const FNS = ['cmp', 'nums', 'uuidShape', 'pyreonNumString']

describe('the lowered globals behave like the web', () => {
  it.runIf(swiftOk)('Swift', () => {
    const code = emit(helpers, 'swift').code
    const fns = FNS.map((n) => topLevel(code, new RegExp(`^(?:private )?func ${n}\\(`))).join('\n')
    const q = (s: string) => JSON.stringify(s)
    const main = [
      ...CMP_CASES.map(([a, b]) => `print("cmp ${a} ${b} \\(Int(cmp(${q(a)}, ${q(b)})))")`),
      ...PARSE_CASES.map((s) => `print("parse [${s}] " + nums(${q(s)}))`),
      'print("uuid \\(uuidShape())")',
    ].join('\n')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-globals-'))
    // `charAt` lowers to the runtime's `pyreonCharAt` (PyreonSlice.swift); its one-line definition is inlined.
    const prelude = `import Foundation
${runtimeNumber('swift')}
func pyreonCharAt(_ s: String, _ i: Int) -> String { let u = Array(s.utf16); return i >= 0 && i < u.count ? String(utf16CodeUnits: [u[i]], count: 1) : "" }
`
    writeFileSync(join(dir, 'main.swift'), `${prelude}${fns}\n${main}\n`)
    execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
    expect(execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n')).toEqual(expected.split('\n'))
  }, 180_000)

  it.runIf(kotlinRunOk)('Kotlin', () => {
    const code = emit(helpers, 'kotlin').code
    const fns = FNS.map((n) => topLevel(code, new RegExp(`^(?:private )?fun ${n}\\(`))).join('\n')
    const q = (s: string) => JSON.stringify(s)
    const main = [
      'fun main() {',
      ...CMP_CASES.map(([a, b]) => `  println("cmp ${a} ${b} \${cmp(${q(a)}, ${q(b)}).toInt()}")`),
      ...PARSE_CASES.map((s) => `  println("parse [${s}] " + nums(${q(s)}))`),
      '  println("uuid ${uuidShape()}")',
      '}',
    ].join('\n')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-globals-'))
    writeFileSync(join(dir, 'main.kt'), `${runtimeNumber('kotlin')}\n${fns}\n${main}\n`)
    execFileSync('kotlinc', [join(dir, 'main.kt'), '-include-runtime', '-d', join(dir, 'p.jar')], { stdio: 'pipe' })
    expect(execFileSync('java', ['-jar', join(dir, 'p.jar')], { encoding: 'utf8' }).trim().split('\n')).toEqual(expected.split('\n'))
  }, 240_000)
})

// ── The named half: what survives verbatim is warned ────────────────────────────────────────────────────────────

const survivors = `${head}
function App() {
  const out = signal('')
  const flash = () => { out.set('saved'); setTimeout(() => out.set(''), 2000) }
  const load = async () => { const r = await fetch('https://x.test/a'); out.set(String(r.status)) }
  const both = async () => { await Promise.all([load(), load()]) }
  const keep = () => localStorage.setItem('k', out())
  const day = (iso: string) => iso.normalize('NFC')
  return (<Stack><Text>{out()}</Text><Text>{day('x')}</Text><Button onPress={flash}>f</Button><Button onPress={both}>b</Button>
    <Button onPress={keep}>k</Button></Stack>)
}`

describe('a global or JS-only method that survives verbatim is named', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: each survivor is named once, with what to write instead`, () => {
      const { warnings } = emit(survivors, target)
      const named = (n: string) => warnings.filter((w) => w.startsWith(`${n} is a JavaScript/browser global`))
      for (const n of ['setTimeout', 'fetch', 'Promise', 'localStorage']) expect(named(n), n).toHaveLength(1)
      expect(named('fetch')[0]).toContain('data-fetching hook')
      expect(named('localStorage')[0]).toContain('storage hook')
      // `normalize` on a string receiver already has a more specific warning; the survival check does not repeat it.
      expect(warnings.filter((w) => w.includes('normalize'))).toHaveLength(1)
    })
  }

  it('a name the source binds itself is not a global', () => {
    const src = `${head}
const fetch = (u: string): string => u
function App() {
  const show = (location: string, history: number) => location + String(history)
  return (<Stack><Text>{fetch('a')}</Text><Text>{show('x', 1)}</Text></Stack>)
}`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(src, target).warnings.join('\n')).not.toContain('JavaScript/browser global')
    }
  })

  it('a lowered global is not named', () => {
    const src = `${head}
function App() {
  const t = signal(Date.now())
  const go = () => console.log(Math.max(1, 2), JSON.stringify(t()), String(Number('3')))
  return (<Stack><Text>{t()}</Text><Button onPress={go}>g</Button></Stack>)
}`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(src, target).warnings.join('\n')).not.toMatch(/JavaScript\/browser global|JavaScript method/)
    }
  })

  it('a JS-only method on a receiver no other check types is named on both targets', () => {
    const src = `${head}
type Ev = { n: number }
function App() {
  const ev = signal<Ev>({ n: 1.5 })
  const p = computed(() => ev().n.toPrecision(3))
  return (<Stack><Text>{p()}</Text></Stack>)
}`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(src, target).warnings.join('\n')).toContain('.toPrecision(…) is a JavaScript method')
    }
  })

  it('a Kotlin-stdlib method spelled like the JS one is not named on Kotlin', () => {
    const src = `${head}
function App() {
  const s = signal('7')
  const p = computed(() => s().padStart(3, '0'))
  return (<Stack><Text>{p()}</Text></Stack>)
}`
    expect(emit(src, 'kotlin').warnings).toEqual([])
  })
})
