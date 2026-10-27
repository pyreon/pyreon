// Gap 4 follow-up fixture — @pyreon/validate v1 port.
//
// v1 contract: top-level `const X = withField(schema, { label, ... })`
// shape with literal meta object. The schema arg is DISCARDED (Zod /
// Valibot / ArkType runtimes don't translate to native); v1's
// deliverable is the META STRUCT so downstream code can reference
// labels / hints / placeholders.
//
// Meta values: strings, booleans (`autoFocus`) and numbers (`defaultValue`,
// including a negative and a fractional one) lower as typed struct fields.
// A value with no compile-time literal is warned about by name and left out.
//
// We import + reference `emailSchema` so the source typechecks
// against the actual @pyreon/validate API even though PMTC drops
// the schema at emit time.

import { withField } from '@pyreon/validate'

const emailSchema = {} as unknown

export const emailField = withField(emailSchema, {
  label: 'Email address',
  placeholder: 'name@example.com',
  hint: 'We never share your email',
})

export const passwordField = withField(emailSchema, {
  label: 'Password',
  placeholder: '••••••••',
  autoFocus: false,
})

export const ageField = withField(emailSchema, {
  label: 'Age',
  defaultValue: 18,
  autoFocus: true,
})

export const offsetField = withField(emailSchema, {
  label: 'Offset',
  defaultValue: -1.5,
})
