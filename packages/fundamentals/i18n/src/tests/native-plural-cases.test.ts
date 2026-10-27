// The native i18n runtimes (`native/swift/PyreonI18n.swift`,
// `native/kotlin/.../PyreonI18n.kt`) carry the CLDR cardinal plural rules as
// DATA because Foundation has no public "category for a number" API and the
// Kotlin JVM test harness cannot reach `android.icu`. Neither target's tests
// can consult `Intl.PluralRules`, so this suite is what ties them to real CLDR:
//
//   1. the two rule TABLES are identical (one table, two evaluators);
//   2. the two native test files share one case list, byte-for-byte;
//   3. every expected category in that list is what `Intl.PluralRules`
//      (ICU, CLDR 48 in this runtime) returns.
//
// The native suites then assert their evaluators reproduce the list, so a
// rule typo on either side fails one of the three suites.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const NATIVE = resolve(import.meta.dirname, '../../native')
const read = (rel: string) => readFileSync(resolve(NATIVE, rel), 'utf8')
const SWIFT_RUNTIME = read('swift/PyreonI18n.swift')
const KOTLIN_RUNTIME = read('kotlin/com/pyreon/runtime/PyreonI18n.kt')
const SWIFT_TESTS = read('tests/PyreonI18nTests.swift')
const KOTLIN_TESTS = read('tests/PyreonI18nTest.kt')

function block(source: string, tag: string): string {
  const start = source.indexOf(`// <${tag}>`)
  const end = source.indexOf(`// </${tag}>`)
  if (start < 0 || end < start) throw new Error(`missing <${tag}> block`)
  return source.slice(start, end)
}

/** One entry per line: `[languages, category, rule, category, rule, …]`. */
function ruleTable(source: string): string[][] {
  return block(source, 'cldr-plural-table')
    .split('\n')
    .map((line) => [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]!))
    .filter((strings) => strings.length > 0)
}

function cases(source: string): Array<[string, number, string]> {
  return [...block(source, 'plural-cases').matchAll(/"([\w-]+)",\s*([\d.]+),\s*"(\w+)"/g)].map((m) => [
    m[1]!,
    Number(m[2]),
    m[3]!,
  ])
}

describe('native CLDR plural data', () => {
  it('the Swift and Kotlin rule tables are identical', () => {
    const swift = ruleTable(SWIFT_RUNTIME)
    expect(swift.length).toBeGreaterThan(15)
    expect(ruleTable(KOTLIN_RUNTIME)).toEqual(swift)
  })

  it('covers every language the docs promise', () => {
    const langs = new Set(ruleTable(SWIFT_RUNTIME).flatMap((row) => row[0]!.split(' ')))
    for (const l of 'en de fr es it pt nl cs sk pl ru uk ar he ja zh ko tr'.split(' ')) {
      expect(langs.has(l), l).toBe(true)
    }
  })

  it('the Swift and Kotlin test files share one case list', () => {
    const swift = cases(SWIFT_TESTS)
    expect(swift.length).toBeGreaterThan(100)
    expect(cases(KOTLIN_TESTS)).toEqual(swift)
  })

  it('every expected category is what Intl.PluralRules returns', () => {
    for (const [locale, count, expected] of cases(SWIFT_TESTS)) {
      expect(new Intl.PluralRules(locale).select(count), `${locale} ${count}`).toBe(expected)
    }
  })

  it('every category a rule names is a CLDR category', () => {
    const valid = new Set(['zero', 'one', 'two', 'few', 'many'])
    for (const row of ruleTable(SWIFT_RUNTIME)) {
      for (let i = 1; i < row.length; i += 2) expect(valid.has(row[i]!), row[i]).toBe(true)
    }
  })
})

describe('web candidate order the native runtimes mirror', () => {
  it('a CLDR category with no message falls back to _other before the bare key', async () => {
    const { createI18n } = await import('../create-i18n')
    const i18n = createI18n({
      locale: 'cs',
      messages: { cs: { files_one: '{{count}} soubor', files_other: '{{count}} souborů' } },
    })
    // cs 3 → `few`, which has no message here.
    expect(i18n.t('files', { count: 3 })).toBe('3 souborů')
    expect(i18n.t('files', { count: 1 })).toBe('1 soubor')
  })

  it('the full Czech repro from #3981 resolves one/few/many/other and switches locale', async () => {
    const { createI18n } = await import('../create-i18n')
    const i18n = createI18n({
      locale: 'cs',
      messages: {
        cs: {
          files_one: '{{count}} soubor',
          files_few: '{{count}} soubory',
          files_many: '{{count}} souboru',
          files_other: '{{count}} souborů',
        },
        en: { files_one: '{{count}} file', files_other: '{{count}} files' },
      },
    })
    expect([1, 3, 1.5, 5].map((count) => i18n.t('files', { count }))).toEqual([
      '1 soubor',
      '3 soubory',
      '1.5 souboru',
      '5 souborů',
    ])
    i18n.locale.set('en')
    expect(i18n.t('files', { count: 3 })).toBe('3 files')
  })
})
