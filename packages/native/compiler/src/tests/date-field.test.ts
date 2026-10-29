// `<Field kind="date" | "time" | "datetime" min max>` (#3980) — the platform's
// own picker, with the web's wall-clock string as the value on every target.
//
// The oracle is `<input type="date" | "time" | "datetime-local">`: its value is
// `YYYY-MM-DD` / `HH:mm` / `YYYY-MM-DDTHH:mm` with no time zone, and `min` /
// `max` are strings in the same format. iOS lowers to the runtime's
// `PyreonDateField` (a `DatePicker`), Android to its `PyreonDateField`
// (Material 3 date / time picker dialogs). The value contract itself is run by
// the runtimes' own tests (Swift `PyreonDateFieldTests`, Kotlin
// `PyreonDateValueTest`); these pin the emit, the warnings and the compile.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const app = (jsx: string) => `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Field, Text } from '@pyreon/primitives'
  export function Booking() {
    const day = signal('2026-10-22')
    const at = signal('')
    const when = signal('')
    const earliest = signal('2026-01-01')
    return (<Stack>${jsx}<Text>{day()}</Text></Stack>)
  }
`
const both = (jsx: string) => ({
  swift: transform(app(jsx), { target: 'swift' }),
  kotlin: transform(app(jsx), { target: 'kotlin' }),
})

describe('<Field kind="date" | "time" | "datetime"> — the emit', () => {
  it('each kind is the runtime picker over the same string value', () => {
    const { swift, kotlin } = both(`
      <Field kind="date" value={day} onChangeText={(v) => day.set(v)} />
      <Field kind="time" value={at} onChangeText={(v) => at.set(v)} />
      <Field kind="datetime" value={when} onChangeText={(v) => when.set(v)} />`)
    expect(swift.code).toContain('PyreonDateField(value: $day, kind: .date)')
    expect(swift.code).toContain('PyreonDateField(value: $at, kind: .time)')
    expect(swift.code).toContain('PyreonDateField(value: $when, kind: .datetime)')
    expect(kotlin.code).toContain('PyreonDateField(value = day, onValueChange = { v -> day = v }, kind = PyreonDateFieldKind.Date)')
    expect(kotlin.code).toContain('kind = PyreonDateFieldKind.Time')
    expect(kotlin.code).toContain('kind = PyreonDateFieldKind.DateTime')
    // Never a text field: the keyboard, mask and submit wiring do not apply.
    expect(swift.code).not.toContain('TextField(')
    expect(kotlin.code).not.toContain('TextField(')
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('static and runtime bounds, a placeholder, disabled and the test id', () => {
    const { swift, kotlin } = both(
      `<Field kind="date" value={day()} onChangeText={(v) => day.set(v)} min={earliest()} max="2026-12-31" placeholder="Day" disabled data-testid="d" />`,
    )
    expect(swift.code).toMatch(/PyreonDateField\(value: Binding\([\s\S]*\), kind: \.date, min: earliest, max: "2026-12-31", placeholder: "Day"\)/)
    expect(swift.code).toContain('.disabled(true)')
    expect(swift.code).toContain('.accessibilityIdentifier("d")')
    expect(kotlin.code).toContain(
      'kind = PyreonDateFieldKind.Date, min = earliest, max = "2026-12-31", placeholder = "Day", enabled = false, modifier = Modifier.testTag("d"))',
    )
  })
})

describe('<Field kind="date"> — every shape that cannot lower is NAMED', () => {
  const warns = (jsx: string, needle: RegExp) => {
    const { swift, kotlin } = both(jsx)
    expect(swift.warnings.some((w) => needle.test(w)), swift.warnings.join('\n')).toBe(true)
    expect(kotlin.warnings.some((w) => needle.test(w)), kotlin.warnings.join('\n')).toBe(true)
    return { swift, kotlin }
  }

  it('a bound that is not in the kind\'s format — or not a real date — is dropped, as a browser ignores it', () => {
    const wrongShape = warns(`<Field kind="date" value={day} onChangeText={(v) => day.set(v)} min="22/10/2026" />`, /`min` must be a date/)
    expect(wrongShape.swift.code).not.toContain('min:')
    warns(`<Field kind="date" value={day} onChangeText={(v) => day.set(v)} max="2026-02-30" />`, /`max` must be a date/)
    warns(`<Field kind="time" value={at} onChangeText={(v) => at.set(v)} min="9:00" />`, /`min` must be a time/)
    warns(`<Field kind="time" value={at} onChangeText={(v) => at.set(v)} max="24:00" />`, /`max` must be a time/)
    warns(`<Field kind="datetime" value={when} onChangeText={(v) => when.set(v)} min="2026-10-22 09:00" />`, /`min` must be a datetime/)
  })

  it('min after max is kept (as on the web) but named', () => {
    warns(`<Field kind="date" value={day} onChangeText={(v) => day.set(v)} min="2026-12-31" max="2026-01-01" />`, /`min` is after `max`/)
  })

  it('onSubmit is not wired — a picker has no keyboard submit', () => {
    const { swift, kotlin } = warns(`<Field kind="date" value={day} onChangeText={(v) => day.set(v)} onSubmit={() => day.set('')} />`, /has no keyboard submit/)
    expect(swift.code).not.toContain('.onSubmit')
    expect(kotlin.code).not.toContain('keyboardActions')
  })

  it('`multiline` wins over a date kind, as on the web — a text area, with `kind` named as ignored', () => {
    const { swift, kotlin } = warns(
      `<Field multiline kind="date" value={day} onChangeText={(v) => day.set(v)} />`,
      /multi-line field has no keyboard kind/,
    )
    expect(swift.code).not.toContain('PyreonDateField')
    expect(swift.code).toContain('axis: .vertical')
    expect(kotlin.code).not.toContain('PyreonDateField')
    expect(kotlin.code).toContain('singleLine = false')
  })

  it('`lines` on a picker is named and ignored, as on the web', () => {
    const { swift, kotlin } = warns(`<Field kind="time" lines={2} value={at} onChangeText={(v) => at.set(v)} />`, /`lines` only applies/)
    expect(swift.code).toContain('PyreonDateField')
    expect(kotlin.code).toContain('PyreonDateField')
  })

  it('a dynamic kind cannot pick a control at compile time', () => {
    const src = `<Field kind={day().length > 0 ? 'date' : 'text'} value={day} onChangeText={(v) => day.set(v)} />`
    const { swift, kotlin } = both(src)
    expect(swift.warnings.join('\n')).toMatch(/non-static value/)
    expect(kotlin.warnings.join('\n')).toMatch(/non-static value/)
  })
})

describe('<Field kind="date"> — the emit compiles', () => {
  const jsx = `
    <Field kind="date" value={day} onChangeText={(v) => day.set(v)} min="2026-01-01" max={earliest()} placeholder="Day" />
    <Field kind="time" value={at()} onChangeText={(v) => at.set(v)} disabled />
    <Field kind="datetime" value={when} onChangeText={(v) => when.set(v)} min="2026-10-22T09:00" />`
  const source = app(jsx)

  it('with no warnings', () => {
    expect(transform(source, { target: 'swift' }).warnings).toEqual([])
    expect(transform(source, { target: 'kotlin' }).warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stubs', () => {
    const res = validateSwiftWithStubs(transform(source, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin type-checks against the stubs', () => {
    const res = validateKotlin(transform(source, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  }, 180_000)

  it.skipIf(!isSwiftUIAvailable())('Swift type-checks against the REAL iOS SDK and the REAL PyreonDateField.swift', () => {
    const runtime = resolve(import.meta.dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonDateField.swift')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-date-real-'))
    try {
      const appPath = join(dir, 'DateApp.swift')
      writeFileSync(appPath, `import SwiftUI\nimport Foundation\n${transform(source, { target: 'swift' }).code}`, 'utf8')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      execFileSync(
        'xcrun',
        ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, appPath, runtime],
        { stdio: 'pipe' },
      )
    } catch (err) {
      const e = err as { stderr?: Buffer }
      expect.fail(String(e.stderr ?? err))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
