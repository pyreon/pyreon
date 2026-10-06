// A library that owns its native lowering also owns the compile-gate stubs for the runtime types its emit names, and
// the gates append them only to an emit that NAMES one. This locks the two halves every moved library relies on:
// an input that names nothing of theirs gets nothing appended (the bundle must not grow for unrelated emits), and an
// input that names the runtime type gets a stub that declares it on the right target.
import { describe, expect, it } from 'vitest'
import { FIRST_PARTY_VALIDATE_OPTIONS } from '../../../../../scripts/native-first-party-plugins'
import { a11yStubs, i18nStubs, machineStubs, toastStubs } from './first-party-plugins'

describe('first-party stub augmentations', () => {
  it('are loaded into the compile gates the repo scripts use', () => {
    expect(FIRST_PARTY_VALIDATE_OPTIONS.augment).toContain(machineStubs)
    expect(FIRST_PARTY_VALIDATE_OPTIONS.augment).toContain(i18nStubs)
    expect(FIRST_PARTY_VALIDATE_OPTIONS.augment).toContain(toastStubs)
    expect(FIRST_PARTY_VALIDATE_OPTIONS.augment).toContain(a11yStubs)
  })

  it('append nothing to an emit that names none of their runtime types', () => {
    for (const augmentation of FIRST_PARTY_VALIDATE_OPTIONS.augment ?? []) {
      expect(augmentation.swift?.('struct Plain: View { var body: some View { Text("x") } }')).toBe('')
      expect(augmentation.kotlin?.('@Composable fun Plain() { Text("x") }')).toBe('')
    }
  })

  it('the machine stubs declare PyreonMachine on the target that names it', () => {
    expect(machineStubs.swift?.('@State private var m = PyreonMachine(initial: "a", transitions: [:])')).toContain('final class PyreonMachine')
    expect(machineStubs.kotlin?.('val m = remember { PyreonMachine(initial = "a", transitions = mapOf()) }')).toContain('class PyreonMachine')
  })

  it('the i18n stubs declare PyreonI18n on the target that names it', () => {
    expect(i18nStubs.swift?.('@State private var i18n = PyreonI18n(locale: "en", messages: [:])')).toContain('struct PyreonI18n')
    expect(i18nStubs.kotlin?.('val i18n = remember { PyreonI18n(initialLocale = "en", messages = mapOf()) }')).toContain('class PyreonI18n')
  })

  it('the toast and a11y stubs declare their runtime objects on the target that names them', () => {
    expect(toastStubs.swift?.('PyreonToast.shared.add("x", type: "info")')).toContain('final class PyreonToast')
    expect(toastStubs.kotlin?.('PyreonToast.add("x", "info")')).toContain('object PyreonToast')
    expect(a11yStubs.swift?.('PyreonA11y.announce("x", assertive: false)')).toContain('enum PyreonA11y')
    expect(a11yStubs.kotlin?.('PyreonA11y.announce("x", false)')).toContain('object PyreonA11y')
  })
})
