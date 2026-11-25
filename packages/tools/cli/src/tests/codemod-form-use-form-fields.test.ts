/**
 * `form-use-form-fields`: rewrites the removed `useForm({ fields: [field(…)] })`
 * shape to `useForm({ initialValues, validators })`.
 *
 * Bisect-verified: with the `fields` property edit removed from the transform,
 * the rewrite specs return `null`.
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS, selectCodemods } from '../codemods'
import { formUseFormFields } from '../codemods/form-use-form-fields'

const run = (src: string, path = 'a.ts') => formUseFormFields.transform(src, path)

describe('form-use-form-fields', () => {
  it('rewrites same-file field() declarations, removes them and the field import (fixture before/after)', () => {
    const before = `import { field, useForm } from '@pyreon/form'

const email = field('email', '', (v) => (!v.includes('@') ? 'Invalid' : undefined))
const remember = field('remember', false)
const confirm = field('confirmPassword', '', (v, all) => (v !== all.password ? 'Mismatch' : undefined))
const password = field('password', '')

export const form = useForm({
  fields: [email, remember, password, confirm],
  onSubmit: (values) => save(values),
  validateOn: 'change',
})
`
    const after = `import { useForm } from '@pyreon/form'

export const form = useForm({
  initialValues: { email: '', remember: false, password: '', confirmPassword: '' }, validators: { email: (v) => (!v.includes('@') ? 'Invalid' : undefined), confirmPassword: (v, all) => (v !== all.password ? 'Mismatch' : undefined) },
  onSubmit: (values) => save(values),
  validateOn: 'change',
})
`
    expect(run(before)).toBe(after)
    expect(run(after)).toBeNull()
  })

  it('rewrites inline field() calls, quotes non-identifier names, and keeps explicit type arguments', () => {
    const src = `import { field as f, useForm as uf } from '@pyreon/form'\nconst form = uf({ fields: [f('address.city', ''), f<'age', number | null>('age', null)], onSubmit })\n`
    expect(run(src, 'a.tsx')).toBe(
      `import { useForm as uf } from '@pyreon/form'\nconst form = uf({ initialValues: { "address.city": '', age: null as number | null }, onSubmit })\n`,
    )
  })

  it('resolves each declaration by scope (one per test block)', () => {
    const src = `import { field, useForm } from '@pyreon/form'
it('a', () => {
  const email = field('email', 'a')
  useForm({ fields: [email], onSubmit })
})
it('b', () => {
  const email = field('email', 'b')
  useForm({ fields: [email], onSubmit })
})
`
    const out = run(src) as string
    expect(out).toContain(`useForm({ initialValues: { email: 'a' }, onSubmit })`)
    expect(out).toContain(`useForm({ initialValues: { email: 'b' }, onSubmit })`)
    expect(out).not.toContain('field')
  })

  it('keeps the field import and a declaration that is still used elsewhere', () => {
    const src = `import { field, useForm } from '@pyreon/form'\nconst email = field('email', '')\nconst other = field('x', 1)\nuseForm({ fields: [field('a', 1)], onSubmit })\nexport { other }\n`
    const out = run(src) as string
    expect(out).toContain(`useForm({ initialValues: { a: 1 }, onSubmit })`)
    expect(out).toContain(`import { field, useForm } from '@pyreon/form'`)
    expect(out).toContain(`const other = field('x', 1)`)
  })

  it('leaves shared, imported, computed, spread and duplicate definitions alone', () => {
    const imp = `import { field, useForm } from '@pyreon/form'\n`
    // Shared: the definition is referenced outside the array.
    expect(run(`${imp}const email = field('email', '')\nuseForm({ fields: [email], onSubmit })\nconsole.log(email.name)\n`)).toBeNull()
    // Imported from another module.
    expect(run(`${imp}import { email } from './fields'\nuseForm({ fields: [email], onSubmit })\n`)).toBeNull()
    // Computed name, spread element, duplicate name.
    expect(run(`${imp}useForm({ fields: [field(name, '')], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields: [...defs], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields: [field('a', 1), field('a', 2)], onSubmit })\n`)).toBeNull()
    // Not @pyreon/form, and an options object that is already migrated.
    expect(run(`import { field, useForm } from './mine'\nuseForm({ fields: [field('a', 1)], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ initialValues: { a: 1 }, onSubmit })\n`)).toBeNull()
  })

  it('is registered and selected for an upgrade across 0.55.0', () => {
    expect(CODEMODS).toContain(formUseFormFields)
    expect(selectCodemods('0.54.0', '0.55.0').map((c) => c.id)).toContain('form-use-form-fields')
    expect(selectCodemods('0.55.0', '0.56.0').map((c) => c.id)).not.toContain('form-use-form-fields')
  })
})
