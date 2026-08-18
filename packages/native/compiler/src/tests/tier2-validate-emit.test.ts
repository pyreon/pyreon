// Gap 4 follow-up — @pyreon/validate v1 emit tests.
//
// v1 ports `const X = withField(schema, { label, ... })` at top
// level. The schema arg is discarded; the literal meta object
// becomes a per-binding struct (Swift) / data class (Kotlin) +
// module-scope const. Downstream native code references
// X.label / X.placeholder directly.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
import { withField } from '@pyreon/validate'

const schema = {} as unknown

export const emailField = withField(schema, {
  label: 'Email address',
  placeholder: 'name@example.com',
  hint: 'We never share',
})
`

describe('Gap 4 follow-up — @pyreon/validate v1 emit', () => {
  it('Swift: emits PyreonFieldMeta struct + const binding', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('struct PyreonFieldMeta_emailField {')
    expect(r.code).toContain('let label: String = "Email address"')
    expect(r.code).toContain('let placeholder: String = "name@example.com"')
    expect(r.code).toContain('let hint: String = "We never share"')
    expect(r.code).toContain('let emailField = PyreonFieldMeta_emailField()')
  })

  it('Kotlin: emits PyreonFieldMeta data class + val binding', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonFieldMeta_emailField(')
    expect(r.code).toContain('val label: String = "Email address"')
    expect(r.code).toContain('val placeholder: String = "name@example.com"')
    expect(r.code).toContain('val hint: String = "We never share"')
    expect(r.code).toContain('val emailField = PyreonFieldMeta_emailField()')
  })

  it('Non-literal meta arg falls back to silent-drop', () => {
    const src = `
import { withField } from '@pyreon/validate'

const schema = {} as unknown
const dynamicMeta = { label: 'x' }

export const f = withField(schema, dynamicMeta)
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonFieldMeta_f')
    const w = r.warnings.find((w) => w.includes('withField') && w.includes('f'))
    expect(w).toBeDefined()
  })

  it('Non-string meta values are silently dropped (v1 scope)', () => {
    const src = `
import { withField } from '@pyreon/validate'

const schema = {} as unknown

export const f = withField(schema, {
  label: 'Field',
  autoFocus: true,
  defaultValue: 42,
})
`
    const r = transform(src, { target: 'swift' })
    // Only the string `label` survives.
    expect(r.code).toContain('let label: String = "Field"')
    expect(r.code).not.toContain('autoFocus')
    expect(r.code).not.toContain('defaultValue')
  })

  it('Multiple withField sites emit independent structs', () => {
    const src = `
import { withField } from '@pyreon/validate'
const s = {} as unknown
export const a = withField(s, { label: 'A' })
export const b = withField(s, { label: 'B' })
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).toContain('PyreonFieldMeta_a')
      expect(r.code).toContain('PyreonFieldMeta_b')
      expect(r.code).toContain('"A"')
      expect(r.code).toContain('"B"')
    }
  })

  it('NO withField sites → no PyreonFieldMeta_ emit', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
export function App() { return <Stack><Text>x</Text></Stack> }
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonFieldMeta_')
    }
  })
})

// ─── The import warning must agree with the emit ─────────────────────────────
//
// `withField` LOWERS at top level — the specs above lock the struct it emits.
// But `warnUnloweredPyreonModules` runs BEFORE the top-level recognizer, and
// `withField` was missing from the suppression list its siblings (`s`, the
// @pyreon/validation adapters, PermissionsProvider) are all on. So importing
// it printed "has NO native lowering … the native build fails with 'cannot
// find withField in scope'" directly above the `PyreonFieldMeta_*` struct the
// same compile had just produced — telling the author a working API was
// unusable and pointing them at a `<Web>` escape hatch they do not need.
//
// Same class as the toast entry in the anti-pattern catalog, and the exact
// direction native-audit-warnings.test.ts calls "the more damaging one".

const BLANKET = 'has NO native lowering'

describe('@pyreon/validate withField — the import warning tracks the emit', () => {
  it('does NOT claim withField is unlowered when it lowers', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(SRC, { target })
      expect(r.code, target).toContain('PyreonFieldMeta_emailField')
      expect(
        r.warnings.filter((w) => w.includes('withField') && w.includes(BLANKET)),
        target,
      ).toHaveLength(0)
    }
  })

  // The suppression is conditional, not a blanket exemption: when nothing
  // lowers, `withField` IS reproduced verbatim and the warning is accurate.
  it('still warns when no top-level withField lowers', () => {
    const cases = [
      // meta is an identifier, not a literal object
      `const meta = { label: 'N' }\nexport const f = withField({}, meta)`,
      // literal object, but no string-valued entries
      `export const f = withField({}, { rows: 3 })`,
      // imported but never declared at top level at all
      ``,
    ]
    for (const decl of cases) {
      const src = `import { withField } from '@pyreon/validate'\n${decl}\n`
      const r = transform(src, { target: 'swift' })
      expect(
        r.warnings.some((w) => w.includes('withField') && w.includes(BLANKET)),
        decl,
      ).toBe(true)
    }
  })

  // Suppressing the blanket line must not swallow the PRECISE, per-declaration
  // diagnostic — an author with one good and one bad declaration still needs
  // to be told which one was dropped, and why.
  it('keeps the per-declaration diagnostic for a sibling that does not lower', () => {
    const src = `import { withField } from '@pyreon/validate'
export const a = withField({}, { label: 'A' })
export const b = withField({}, { rows: 3 })
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('PyreonFieldMeta_a')
    expect(r.warnings.filter((w) => w.includes(BLANKET) && w.includes('withField'))).toHaveLength(0)
    expect(
      r.warnings.some((w) => w.includes('`b`') && w.includes('no recognized meta fields')),
    ).toBe(true)
  })
})
