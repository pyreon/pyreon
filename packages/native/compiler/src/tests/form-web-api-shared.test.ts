// `@pyreon/form` was device-proven on native — via source that cannot compile
// on web.
//
// The web API types the accessors as FUNCTIONS (`packages/fundamentals/form/
// src/types.ts`): `values: () => TValues`, `errors: () => …`. So idiomatic
// shared source reads `form.values().email`.
//
// The native emit only lowered the PROPERTY form, `form.values.email`. That
// made a form non-shared in BOTH directions:
//
//   form.values().email   correct web  → uncompilable native, ZERO warnings
//   form.values.email     compiles native → TYPE ERROR on web
//
// There was no shape that worked on both, which is the entire premise of the
// four-layer model. And because the two device-proven examples were written in
// the native-only shape, every device gate passed while the promise they exist
// to demonstrate — one source, three targets — was not being met for forms.
//
// This is the same mechanism as `attrs(Base)`, `useParams()`, `useFetch` and
// `useStorage`: the capability is exercised along ONE shape and the others are
// never compiled. Here the shape that WAS exercised happened to be the one the
// web cannot run, so device proof actively pointed away from the defect.
//
// Fixed by normalising a zero-arg call on the accessor to the property form in
// both backends, at BOTH sites that recognise it (the general member read and
// the `<Field>` binding special-case, which routes the setter through
// setValue → re-validation and would otherwise fall through to a generic,
// unbuildable field). Additive: the property form is untouched.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (valueExpr: string, errorExpr: string) =>
  `import { useForm } from '@pyreon/form'
import { Stack, Field, Text } from '@pyreon/primitives'
export function C(){
  const form = useForm({ fields: { email: '', name: '' } })
  return (
    <Stack>
      <Field value={${valueExpr}} onChangeText={(v: string) => form.setFieldValue('email', v)} />
      <Text>{${errorExpr}}</Text>
    </Stack>
  )
}`

/** What shared source looks like — matches the published web types. */
const WEB = app('form.values().email', 'form.errors().name')
/** The legacy native-only shape. Still supported; a type error on web. */
const NATIVE_ONLY = app('form.values.email', 'form.errors.name')

describe('form accessors: the web CALL form is shared code', () => {
  it('emits no warnings on either target', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(WEB, { target }).warnings ?? [], target).toEqual([])
    }
  })

  it.skipIf(!isSwiftcAvailable())('the web form type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(WEB, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the web form type-checks on Kotlin', () => {
    const res = validateKotlin(transform(WEB, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it('routes <Field> through the runtime binding, not a generic field', () => {
    // The whole point of the specialized emit: the setter goes through
    // setValue so validation re-runs. Falling through to the generic path
    // both loses that AND produces something that does not build.
    expect(transform(WEB, { target: 'swift' }).code).toContain('form.binding("email")')
    expect(transform(WEB, { target: 'kotlin' }).code).toContain('form.setValue(')
  })

  it('reads a non-bound accessor through the map with a default', () => {
    expect(transform(WEB, { target: 'swift' }).code).toContain('form.errors["name"] ?? ""')
    expect(transform(WEB, { target: 'kotlin' }).code).toContain('form.errors.value["name"] ?: ""')
  })

  // The equivalence that made migrating the device-proven examples safe
  // WITHOUT re-running the device gate: identical bytes cannot behave
  // differently on a device.
  it('is BYTE-IDENTICAL to the legacy property form on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(WEB, { target }).code, target).toBe(
        transform(NATIVE_ONLY, { target }).code,
      )
    }
  })

  it('still supports the legacy property form — the fix is additive', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(NATIVE_ONLY, { target }).warnings ?? [], target).toEqual([])
    }
  })
})

// Drift guard. The examples are the framework's own claim that a form is
// shared code; if one regresses to the native-only shape it silently stops
// being web-compatible while every native gate stays green — exactly the
// state this arc found.
describe('the device-proven examples use the web-compatible shape', () => {
  const EXAMPLES = [
    'examples/native-finance/src/FinanceApp.tsx',
    'examples/native-tasks/src/TasksApp.tsx',
  ]
  const repoRoot = join(import.meta.dirname, '..', '..', '..', '..', '..')

  for (const rel of EXAMPLES) {
    it(`${rel.split('/')[1]}: no property-form accessor reads`, () => {
      const src = readFileSync(join(repoRoot, rel), 'utf8')
      const offenders = src
        .split('\n')
        .map((line, i) => [i + 1, line] as const)
        // Comments describe the old shape on purpose; only code counts.
        .filter(([, line]) => !line.trimStart().startsWith('//'))
        .filter(([, line]) => /\bform\.(values|errors|touched)\.\w/.test(line))
        .map(([n, line]) => `${n}: ${line.trim()}`)
      expect(offenders, `web-incompatible form reads:\n${offenders.join('\n')}`).toEqual([])
    })
  }
})
