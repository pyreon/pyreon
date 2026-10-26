// Tier-2 Strategy-B emit verification — @pyreon/i18n/core (Gap 4 PR-3, v1).
//
// `const i18n = createI18n({ locale, messages, fallbackLocale? })`
// emits the PyreonI18n reactive container. Method `i18n.t(key)` flows
// through unchanged (runtime container defines it).
//
// Scope: `t(key)`, `t(key, { count, … })` (CLDR plurals resolve in the
// runtime), and the locale signal — `i18n.locale()` reads lower to the
// property, `i18n.locale.set(x)` writes to the property assignment.
// Namespaces and async loading stay web-only.
//
// Bisect-verify: disable `tryDeclFromCreateI18n` in parse.ts → each
// "emits" spec fails with "expected … to contain PyreonI18n(…)". Restored
// → all pass.
//
// Reference: docs/src/content/docs/multiplatform-libraries.md → "Tier 2".

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'fixtures', 'tier2-i18n.tsx')

describe('Tier-2 — @pyreon/i18n/core Strategy-B emit (Gap 4 PR-3, v1)', () => {
  it('Swift: emits @State PyreonI18n with literal locale + messages + fallback', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    expect(result.code).toContain('@State private var i18n = PyreonI18n(')
    expect(result.code).toContain('locale: "en"')
    // Per-locale dictionaries baked from the literal config (the
    // fixture grew interpolation + plural keys in the v2 extension —
    // assert the load-bearing prefix of each locale dictionary).
    expect(result.code).toContain('"en": ["hello": "Hello!", "farewell": "Goodbye"')
    expect(result.code).toContain('"de": ["hello": "Hallo!", "farewell": "Auf Wiedersehen"')
    expect(result.code).toContain('fallbackLocale: "en"')
    // Method calls flow through unchanged.
    expect(result.code).toContain('i18n.t("hello")')
    expect(result.code).toContain('i18n.t("farewell")')
  })

  it('Kotlin: emits val + remember PyreonI18n with literal config', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).toContain('val i18n = remember { PyreonI18n(')
    expect(result.code).toContain('initialLocale = "en"')
    expect(result.code).toContain('"en" to mapOf("hello" to "Hello!", "farewell" to "Goodbye"')
    expect(result.code).toContain('"de" to mapOf("hello" to "Hallo!", "farewell" to "Auf Wiedersehen"')
    expect(result.code).toContain('fallbackLocale = "en"')
    expect(result.code).toContain('i18n.t("hello")')
    expect(result.code).toContain('i18n.t("farewell")')
  })

  it('emits NO silent-drop warning for createI18n post-port (Gap 4 PR-1 diagnostic does not fire here)', () => {
    // Once PR #1444 is rebased to drop createI18n from its diagnostic
    // list (this PR ships the real port), the warning vanishes. This
    // test pre-asserts the post-rebase state so the contract is
    // structural-not-merge-order-dependent.
    const src = readFileSync(FIXTURE, 'utf8')
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    const i18nWarnings = (warnings: string[]) =>
      warnings.filter((w) => w.startsWith('createI18n()'))
    expect(i18nWarnings(swift.warnings ?? [])).toEqual([])
    expect(i18nWarnings(kotlin.warnings ?? [])).toEqual([])
  })

  it('emits with no fallbackLocale when the config omits it', () => {
    const source = `
import { createI18n } from '@pyreon/i18n/core'
import { Stack, Text } from '@pyreon/primitives'

export function Hello() {
  const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' } } })
  return <Stack><Text>{i18n.t('hi')}</Text></Stack>
}
`
    const swift = transform(source, { target: 'swift' })
    const kotlin = transform(source, { target: 'kotlin' })
    expect(swift.code).toContain('@State private var i18n = PyreonI18n(locale: "en", messages: ["en": ["hi": "Hi"]])')
    expect(swift.code).not.toContain('fallbackLocale:')
    expect(kotlin.code).toContain('val i18n = remember { PyreonI18n(initialLocale = "en", messages = mapOf("en" to mapOf("hi" to "Hi"))) }')
    expect(kotlin.code).not.toContain('fallbackLocale =')
  })

  it('warns + falls through to silent-drop on non-literal config', () => {
    const source = `
import { createI18n } from '@pyreon/i18n/core'
const cfg: any = {}
export function App() {
  const i18n = createI18n(cfg)
  return null
}
`
    const swift = transform(source, { target: 'swift' })
    const i18nWarning = swift.warnings.find((w) =>
      w.includes('createI18n declaration `i18n`'),
    )
    expect(i18nWarning).toBeDefined()
    // No PyreonI18n line in emit (silent-drop preserved).
    expect(swift.code).not.toContain('PyreonI18n(')
  })

  describe('locale signal (#3981)', () => {
    const SWITCH_SRC = `
import { createI18n } from '@pyreon/i18n'
import { Stack, Text, Button } from '@pyreon/primitives'

export function Files() {
  const i18n = createI18n({
    locale: 'cs',
    messages: {
      cs: { files_one: '{{count}} soubor', files_few: '{{count}} soubory', files_many: '{{count}} souboru', files_other: '{{count}} souborů' },
      en: { files_one: '{{count}} file', files_other: '{{count}} files' },
    },
  })
  return (
    <Stack>
      <Text>{i18n.t('files', { count: 3 })}</Text>
      <Text>{i18n.locale()}</Text>
      <Button onPress={() => i18n.locale.set('en')}>English</Button>
    </Stack>
  )
}
`

    it('Swift: the read drops the call parens, the write assigns the property', () => {
      const r = transform(SWITCH_SRC, { target: 'swift' })
      expect(r.code).toContain('Text(verbatim: "\\(i18n.locale)")')
      expect(r.code).not.toContain('i18n.locale()')
      expect(r.code).toContain('i18n.locale = "en"')
      expect(r.warnings).toEqual([])
    })

    it('Kotlin: the read drops the call parens, the write assigns the property', () => {
      const r = transform(SWITCH_SRC, { target: 'kotlin' })
      expect(r.code).toContain('Text(text = "${i18n.locale}")')
      expect(r.code).not.toContain('i18n.locale()')
      expect(r.code).toContain('i18n.locale = "en"')
      expect(r.warnings).toEqual([])
    })

    it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
      const v = validateSwiftWithStubs(transform(SWITCH_SRC, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    })

    it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
      const v = validateKotlin(transform(SWITCH_SRC, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    })
  })
})
