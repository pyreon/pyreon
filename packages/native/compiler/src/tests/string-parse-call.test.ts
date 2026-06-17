// String predicate methods + numeric parse globals.
//
// startsWith/endsWith: valid Kotlin String methods, but Swift uses
// hasPrefix/hasSuffix — the verbatim JS names were invalid Swift.
// parseInt/parseFloat: global functions with no native equivalent on
// either target → Swift `Int(s) ?? 0` / `Double(s) ?? 0`, Kotlin
// `(s).toIntOrNull() ?: 0` / `(s).toDoubleOrNull() ?: 0.0` (the `?? 0`
// default stands in for JS's NaN-on-failure, which has no native analog).
// All four currently emitted silent-invalid; common in real apps
// (search filters, parsing user/text input).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (expr: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
export function C() { const s = signal('Hello'); const out = computed(() => ${expr}); return out }`

describe('startsWith / endsWith (Swift mapping)', () => {
  it('Swift: startsWith → hasPrefix', () => {
    const out = transform(SRC("s().startsWith('He')"), { target: 'swift' }).code
    expect(out).toContain('.hasPrefix("He")')
    expect(out).not.toContain('.startsWith(')
  })
  it('Swift: endsWith → hasSuffix', () => {
    const out = transform(SRC("s().endsWith('lo')"), { target: 'swift' }).code
    expect(out).toContain('.hasSuffix("lo")')
    expect(out).not.toContain('.endsWith(')
  })
  it('Kotlin: startsWith / endsWith stay verbatim (valid Kotlin)', () => {
    expect(transform(SRC("s().startsWith('He')"), { target: 'kotlin' }).code).toContain(
      '.startsWith("He")',
    )
  })
})

describe('parseInt / parseFloat globals', () => {
  it('Swift: parseInt → (Int(x) ?? 0); parseFloat → (Double(x) ?? 0)', () => {
    expect(transform(SRC("parseInt('42')"), { target: 'swift' }).code).toContain(
      '(Int("42") ?? 0)',
    )
    expect(transform(SRC("parseFloat('3.14')"), { target: 'swift' }).code).toContain(
      '(Double("3.14") ?? 0)',
    )
  })
  it('Kotlin: parseInt → toIntOrNull ?: 0; parseFloat → toDoubleOrNull ?: 0.0', () => {
    expect(transform(SRC("parseInt('42')"), { target: 'kotlin' }).code).toContain(
      '(("42").toIntOrNull() ?: 0)',
    )
    expect(transform(SRC("parseFloat('3.14')"), { target: 'kotlin' }).code).toContain(
      '(("3.14").toDoubleOrNull() ?: 0.0)',
    )
  })
  it('neither emits the bare parseInt/parseFloat call', () => {
    expect(transform(SRC("parseInt('42')"), { target: 'swift' }).code).not.toContain('parseInt(')
    expect(transform(SRC("parseFloat('3.14')"), { target: 'kotlin' }).code).not.toContain(
      'parseFloat(',
    )
  })
})
