// JavaScript `Date` on native: a date is its epoch milliseconds, and the surface lowers to the runtimes' `PyreonDate`.
//
// `new Date(…)` used to be a named drop ("class construction is outside the supported subset") and every getter was
// emitted verbatim, so the commonest date code in an app — a timestamp, a due date, `d.getFullYear()`,
// `d.toISOString().slice(0, 10)` — did not build. The compile half pins the emit on both toolchains; the behaviour
// half EXECUTES both runtimes in a fixed time zone with a daylight-saving switch and compares to the web's answers.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

const app = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Ev = { title: string; at: Date }
function dayKey(d: Date): string { return d.toISOString().slice(0, 10) }
export function App() {
  const now = signal(new Date())
  const due = signal(new Date('2026-03-10T09:30:00Z'))
  const events = signal<Ev[]>([{ title: 'a', at: new Date(2026, 0, 31) }])
  const label = computed(() => String(now().getFullYear()) + '-' + String(now().getMonth() + 1) + ' ' + dayKey(due()))
  const late = computed(() => due().getTime() < Date.now())
  const days = computed(() => Math.floor((due().getTime() - now().getTime()) / 86400000))
  const utc = computed(() => Date.UTC(2026, 1, 1) + Date.parse('2026-01-01') + events()[0]!.at.getTimezoneOffset())
  return (<Stack><Text>{label()}</Text><Text>{String(late())}</Text><Text>{days()}</Text><Text>{utc()}</Text>
    <Button onPress={() => now.set(new Date())}>tick</Button></Stack>)
}`

describe('Date emit', () => {
  it('Swift: a Date is a Double; the constructors and methods call the PyreonDate runtime', () => {
    const { code, warnings } = emit(app, 'swift')
    expect(code).toContain('var at: Double')
    expect(code).toContain('func dayKey(_ d: Double) -> String { pyreonSlice(pyreonDateISO(d), 0, 10) }')
    expect(code).toContain('@State private var now: Double = (Date().timeIntervalSince1970 * 1000)')
    expect(code).toContain('pyreonDateFrom("2026-03-10T09:30:00Z")')
    expect(code).toContain('pyreonDateMake(false, 2026, 0, 31)')
    expect(code).toContain('pyreonDateGet(now, 0, false)')
    expect(code).toContain('pyreonDateMake(true, 2026, 1, 1)')
    expect(code).toContain('pyreonDateTimezoneOffset(events[0].at)')
    expect(warnings).toEqual([])
  })

  it('Kotlin: the same calls', () => {
    const { code, warnings } = emit(app, 'kotlin')
    expect(code).toContain('data class Ev(var title: String, var at: Double)')
    expect(code).toContain('pyreonDateMake(false, 2026L, 0L, 31L)')
    expect(code).toContain('pyreonDateGet(now, 1L, false)')
    expect(warnings).toEqual([])
  })

  it('a file that declares its own Date is left alone', () => {
    const src = app.replace("type Ev = { title: string; at: Date }", "type Ev = { title: string; at: number }\nclass Date { n = 1 }")
    expect(emit(src, 'swift').code).not.toContain('pyreonDateFrom')
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

// ── Behaviour: both runtimes against the web, in New York (a DST switch on 2026-03-08 and 2026-11-01) ───────────

const TZ = 'America/New_York'
const PARSE = [
  '2026-03-10T09:30:00Z', '2026-03-10', '2026-03-10T09:30', '2026-03-08T02:30', '2026-11-01T01:30', '2026-06-01 12:00',
  '2026-06-01T24:00', '2026-02-30', '2026-13-01', 'abc', '2026-06-01T12:00:00.123456+02:00', '+002026-06-01', '2026',
  '2026-06', '0050-03-01',
]
const MAKE: number[][] = [[2026, 0, 31], [2026, 12, 1], [2026, 1, 30, 25, 61, 61, 1001], [99, 0, 1], [2026, 2, 8, 2, 30]]
const MS = [0, 1717257600123, -1, -86400001, 1772953200000, 1793516400000]

let savedTz: string | undefined
beforeAll(() => {
  savedTz = process.env.TZ
  process.env.TZ = TZ
})
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ
  else process.env.TZ = savedTz
})

function webLines(): string[] {
  const out: string[] = []
  const show = (n: number) => (Number.isNaN(n) ? 'NaN' : String(n))
  for (const s of PARSE) out.push(`parse ${s} ${show(Date.parse(s))}`)
  for (const p of MAKE) {
    const local = new (Date as unknown as new (...a: number[]) => Date)(...p).getTime()
    const utc = (Date.UTC as (...a: number[]) => number)(...p)
    out.push(`make ${p.join(',')} ${show(local)} ${show(utc)}`)
  }
  for (const m of MS) {
    const d = new Date(m)
    const g = [d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]
    const u = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCDay(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()]
    out.push(`get ${m} ${g.join(',')} ${u.join(',')} ${d.getTimezoneOffset()} ${d.toISOString()}`)
  }
  return out
}

const runtimeFile = (lang: 'swift' | 'kotlin') =>
  readFileSync(
    lang === 'swift'
      ? join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonDate.swift')
      : join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonDate.kt'),
    'utf8',
  )

const q = (s: string) => JSON.stringify(s)

function swiftMain(): string {
  const lines: string[] = ['func show(_ n: Double) -> String { n.isNaN ? "NaN" : String(Int64(n)) }']
  for (const s of PARSE) lines.push(`print("parse ${s} " + show(pyreonDateFrom(${q(s)})))`)
  for (const p of MAKE) {
    const a = p.map((n) => `${n}`).join(', ')
    lines.push(`print("make ${p.join(',')} " + show(pyreonDateMake(false, ${a})) + " " + show(pyreonDateMake(true, ${a})))`)
  }
  for (const m of MS) {
    lines.push(
      `print("get ${m} " + (0..<8).map { show(pyreonDateGet(${m}.0, $0, false)) }.joined(separator: ",") + " " + (0..<8).map { show(pyreonDateGet(${m}.0, $0, true)) }.joined(separator: ",") + " " + show(pyreonDateTimezoneOffset(${m}.0)) + " " + pyreonDateISO(${m}.0))`,
    )
  }
  return lines.join('\n')
}

function kotlinMain(): string {
  const lines: string[] = ['fun show(n: Double): String = if (n.isNaN()) "NaN" else n.toLong().toString()', 'fun main() {']
  for (const s of PARSE) lines.push(`  println("parse ${s} " + show(pyreonDateFrom(${q(s)})))`)
  for (const p of MAKE) {
    const a = p.map((n) => `${n}`).join(', ')
    lines.push(`  println("make ${p.join(',')} " + show(pyreonDateMake(false, ${a})) + " " + show(pyreonDateMake(true, ${a})))`)
  }
  for (const m of MS) {
    lines.push(
      `  println("get ${m} " + (0 until 8).joinToString(",") { show(pyreonDateGet(${m}.0, it, false)) } + " " + (0 until 8).joinToString(",") { show(pyreonDateGet(${m}.0, it, true)) } + " " + show(pyreonDateTimezoneOffset(${m}.0)) + " " + pyreonDateISO(${m}.0))`,
    )
  }
  lines.push('}')
  return lines.join('\n')
}

describe('PyreonDate keeps the web semantics (TZ=America/New_York)', () => {
  it.runIf(isSwiftcAvailable())('Swift runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-date-'))
    writeFileSync(join(dir, 'main.swift'), `${runtimeFile('swift')}\n${swiftMain()}\n`)
    execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
    const out = execFileSync(join(dir, 'run'), { encoding: 'utf8', env: { ...process.env, TZ } }).trim().split('\n')
    expect(out).toEqual(webLines())
  }, 180_000)

  it.runIf(isKotlincAvailable())('Kotlin runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-date-'))
    writeFileSync(join(dir, 'PyreonDate.kt'), runtimeFile('kotlin'))
    writeFileSync(join(dir, 'main.kt'), `import com.pyreon.runtime.*\n${kotlinMain()}\n`)
    execFileSync('kotlinc', [join(dir, 'PyreonDate.kt'), join(dir, 'main.kt'), '-include-runtime', '-d', join(dir, 'p.jar')], {
      stdio: 'pipe',
    })
    const out = execFileSync('java', ['-jar', join(dir, 'p.jar')], { encoding: 'utf8', env: { ...process.env, TZ } })
      .trim()
      .split('\n')
    expect(out).toEqual(webLines())
  }, 240_000)
})
