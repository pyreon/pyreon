// `Intl` on native (#3980) — the emit, the warnings, and the compile.
//
// The OUTPUT is checked against the web in `intl-differential.test.ts` (iOS)
// and on the emulator (Android). This file checks that the source shapes an app
// writes reach those runtime calls, that every shape outside the subset is
// NAMED, and that the emit compiles — against the mirror stubs everywhere, and
// against the real iOS SDK + the real `PyreonIntl.swift` on a Mac.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planDateTime, planNumber, type IntlOptionInput } from '../intl-options'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const app = (body: string, jsx: string, moduleScope = '') => `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  ${moduleScope}
  export function App() {
    const startsAt = signal(1792656000000)
    const qty = signal(3)
    const price = signal(9.99)
    const zone = signal('Europe/Berlin')
    const lang = signal('de-DE')
    ${body}
    return (<Stack>${jsx}</Stack>)
  }
`
const both = (body: string, jsx: string, moduleScope = '') => ({
  swift: transform(app(body, jsx, moduleScope), { target: 'swift' }),
  kotlin: transform(app(body, jsx, moduleScope), { target: 'kotlin' }),
})

const opts = (o: Record<string, string | number | boolean>): Map<string, IntlOptionInput> =>
  new Map(Object.entries(o).map(([k, v]) => [k, { kind: 'static', value: v }]))

describe('the ECMA-402 options → the V8 skeleton', () => {
  const skeleton = (o: Record<string, string | number | boolean>, entry: Parameters<typeof planDateTime>[0] = 'DateTimeFormat') => {
    const r = planDateTime(entry, opts(o))
    return r.plan?.kind === 'datetime' ? r.plan.skeleton : undefined
  }

  it('maps each component the way V8 does', () => {
    expect(skeleton({ year: 'numeric', month: 'short', day: 'numeric' })).toBe('yMMMd')
    expect(skeleton({ weekday: 'long', month: 'long', day: 'numeric' })).toBe('EEEEMMMMd')
    expect(skeleton({ year: '2-digit', month: '2-digit', day: '2-digit' })).toBe('yyMMdd')
    expect(skeleton({ hour: 'numeric', minute: '2-digit' })).toBe('jmm')
    expect(skeleton({ hour: '2-digit', minute: '2-digit', hour12: false })).toBe('HHmm')
    expect(skeleton({ hour: 'numeric', hour12: true })).toBe('h')
    expect(skeleton({ hour: 'numeric', hourCycle: 'h23' })).toBe('H')
    expect(skeleton({ hour: 'numeric', minute: 'numeric', timeZoneName: 'short' })).toBe('jmz')
  })

  it('applies ToDateTimeOptions defaults per entry point', () => {
    expect(skeleton({})).toBe('yMd')
    expect(skeleton({}, 'toLocaleDateString')).toBe('yMd')
    expect(skeleton({}, 'toLocaleTimeString')).toBe('jms')
    expect(skeleton({}, 'toLocaleString')).toBe('yMdjms')
    // A component of the REQUIRED kind suppresses the defaults; one of the
    // other kind does not (`toLocaleTimeString({ month })` still shows the time).
    expect(skeleton({ month: 'long' }, 'toLocaleTimeString')).toBe('MMMMjms')
    expect(skeleton({ hour: 'numeric' }, 'toLocaleString')).toBe('j')
    // `timeZoneName` alone is neither a date nor a time component.
    expect(skeleton({ timeZoneName: 'short' })).toBe('yMdz')
  })

  it('refuses the shapes JavaScript throws for', () => {
    expect(planDateTime('DateTimeFormat', opts({ dateStyle: 'short', year: 'numeric' })).plan).toBeNull()
    expect(planDateTime('toLocaleDateString', opts({ timeStyle: 'short' })).plan).toBeNull()
    expect(planDateTime('toLocaleTimeString', opts({ dateStyle: 'short' })).plan).toBeNull()
    expect(planNumber('x', opts({ style: 'currency' })).plan).toBeNull()
    expect(planNumber('x', opts({ minimumFractionDigits: 3, maximumFractionDigits: 1 })).plan).toBeNull()
  })

  it('names every option outside the subset', () => {
    for (const key of ['era', 'dayPeriod', 'fractionalSecondDigits', 'calendar', 'bogus']) {
      const r = planDateTime('DateTimeFormat', opts({ [key]: 'x' }))
      expect(r.warnings.some((w) => w.includes(`\`${key}\``)), key).toBe(true)
    }
    for (const key of ['notation', 'signDisplay', 'unit', 'maximumSignificantDigits', 'roundingMode', 'bogus']) {
      const r = planNumber('x', opts({ [key]: 'x' }))
      expect(r.warnings.some((w) => w.includes(`\`${key}\``)), key).toBe(true)
    }
    expect(planNumber('x', opts({ style: 'unit' })).warnings.join()).toMatch(/style: "unit"/)
    expect(planNumber('x', opts({ style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol' })).warnings.join()).toMatch(/narrowSymbol/)
    expect(planNumber('x', opts({ minimumFractionDigits: 200 })).warnings.join()).toMatch(/RangeError/)
  })
})

describe('the source shapes an app writes', () => {
  it("the issue's repro: a bound formatter with a runtime time zone", () => {
    const { swift, kotlin } = both(
      `const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone() })`,
      `<Text>{() => fmt.format(startsAt())}</Text>`,
    )
    expect(swift.code).toContain('let fmt = PyreonDateTimeFormat(locale: "de-DE", dateStyle: "medium", timeStyle: "short", timeZone: zone)')
    expect(swift.code).toContain('fmt.format(startsAt)')
    expect(kotlin.code).toContain('val fmt = PyreonDateTimeFormat(locale = "de-DE", dateStyle = "medium", timeStyle = "short", timeZone = zone)')
    expect(kotlin.code).toContain('fmt.format(startsAt)')
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('a module-scope formatter, an Int value, and a runtime locale', () => {
    const { swift, kotlin } = both(
      '',
      `<Text>{money.format(qty())}</Text><Text>{new Intl.NumberFormat(lang()).format(price())}</Text>`,
      `const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`,
    )
    expect(swift.code).toContain('private let money = PyreonNumberFormat(locale: "en-US", style: "currency", currency: "USD")')
    expect(swift.code).toContain('money.format(Double(qty))')
    expect(swift.code).toContain('PyreonNumberFormat(locale: lang).format(price)')
    expect(kotlin.code).toContain('money.format((qty).toDouble())')
    expect(swift.warnings).toEqual([])
  })

  it('the constructor arguments keep declaration order when the locale is a runtime value', () => {
    // Swift REQUIRES labelled arguments in declaration order.
    const { swift } = both('', `<Text>{new Intl.DateTimeFormat(lang(), { dateStyle: 'short' }).format(startsAt())}</Text>`)
    expect(swift.code).toContain('PyreonDateTimeFormat(locale: lang, dateStyle: "short")')
  })

  it('n.toLocaleString(…) — with and without arguments — is a number formatter', () => {
    const { swift, kotlin } = both(
      '',
      `<Text>{qty().toLocaleString()}</Text><Text>{price().toLocaleString('de-DE', { minimumFractionDigits: 2 })}</Text>`,
    )
    expect(swift.code).toContain('PyreonNumberFormat().format(Double(qty))')
    expect(swift.code).toContain('PyreonNumberFormat(locale: "de-DE", minimumFractionDigits: 2).format(price)')
    expect(kotlin.code).toContain('PyreonNumberFormat(locale = "de-DE", minimumFractionDigits = 2).format(price)')
    // The old degrade-to-String(x) warning is gone: this now lowers for real.
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('new Date(ms).toLocale{Date,Time,}String with the per-method defaults', () => {
    const { swift } = both(
      '',
      `<Text>{new Date(startsAt()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
       <Text>{new Date(startsAt()).toLocaleTimeString('de-DE')}</Text>
       <Text>{new Date(startsAt()).toLocaleString()}</Text>`,
    )
    expect(swift.code).toContain('PyreonDateTimeFormat(locale: "en-GB", skeleton: "EEEEMMMMd").format(startsAt)')
    expect(swift.code).toContain('PyreonDateTimeFormat(locale: "de-DE", skeleton: "jms").format(startsAt)')
    expect(swift.code).toContain('PyreonDateTimeFormat(skeleton: "yMdjms").format(startsAt)')
    expect(swift.warnings).toEqual([])
  })

  it('format(new Date()) is the current time; format(new Date(ms)) is ms', () => {
    const { swift, kotlin } = both(
      `const f = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' })`,
      `<Text>{f.format(new Date())}</Text><Text>{f.format(new Date(startsAt()))}</Text>`,
    )
    expect(swift.code).toContain('f.format((Date().timeIntervalSince1970 * 1000))')
    expect(swift.code).toContain('f.format(startsAt)')
    expect(kotlin.code).toContain('f.format(System.currentTimeMillis().toDouble())')
  })
})

describe('every shape outside the subset is NAMED, never emitted verbatim', () => {
  const warns = (body: string, jsx: string, needle: RegExp) => {
    const { swift, kotlin } = both(body, jsx)
    expect(swift.warnings.some((w) => needle.test(w)), swift.warnings.join('\n')).toBe(true)
    expect(kotlin.warnings.some((w) => needle.test(w)), kotlin.warnings.join('\n')).toBe(true)
  }

  it('another Intl constructor', () => {
    warns(`const pr = new Intl.PluralRules('en')`, `<Text>x</Text>`, /`Intl\.PluralRules`/)
    warns(`const rt = new Intl.RelativeTimeFormat('en')`, `<Text>x</Text>`, /`Intl\.RelativeTimeFormat`/)
  })

  it('a formatter method other than format', () => {
    warns(`const f = new Intl.NumberFormat('en')`, `<Text>{String(f.formatToParts(1).length)}</Text>`, /formatToParts/)
    warns(`const f = new Intl.DateTimeFormat('en')`, `<Text>{f.formatRange(1, 2)}</Text>`, /formatRange/)
  })

  it('a non-literal options object', () => {
    warns(`const o = { dateStyle: 'short' }; const f = new Intl.DateTimeFormat('en', o)`, `<Text>{f.format(1)}</Text>`, /non-literal options object/)
  })

  it('a dynamic component option, and an unsupported one', () => {
    warns(`const st = signal('short')`, `<Text>{new Intl.DateTimeFormat('en', { dateStyle: st() }).format(1)}</Text>`, /`dateStyle` must be a string literal/)
    warns('', `<Text>{price().toLocaleString('en', { notation: 'compact' })}</Text>`, /`notation` has no native lowering/)
  })

  it('a locale list, and a multi-argument Date', () => {
    warns('', `<Text>{price().toLocaleString(['de-DE', 'en-US'])}</Text>`, /locale LIST/)
    warns('', `<Text>{new Date(2026, 9, 22).toLocaleDateString()}</Text>`, /new Date\(y, m, …\)/)
  })

  it('toLocaleDateString on something that is not `new Date(ms)`', () => {
    warns('', `<Text>{startsAt().toLocaleDateString()}</Text>`, /not written `new Date\(ms\)`/)
  })
})

describe('the emit compiles', () => {
  const body = `const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone() })
    const digits = signal(2)`
  const jsx = `<Text>{() => fmt.format(startsAt())}</Text>
    <Text>{money.format(qty())}</Text>
    <Text>{price().toLocaleString(lang(), { minimumFractionDigits: digits(), maximumFractionDigits: 4 })}</Text>
    <Text>{new Date(startsAt()).toLocaleDateString('en-GB', { weekday: 'long' })}</Text>
    <Text>{fmt.format(new Date())}</Text>`
  const moduleScope = `const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code', useGrouping: false })`
  const source = app(body, jsx, moduleScope)

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

  it.skipIf(!isSwiftUIAvailable())('Swift type-checks against the REAL iOS SDK and the REAL PyreonIntl.swift', () => {
    const runtime = resolve(import.meta.dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonIntl.swift')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-intl-real-'))
    try {
      const appPath = join(dir, 'IntlApp.swift')
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
