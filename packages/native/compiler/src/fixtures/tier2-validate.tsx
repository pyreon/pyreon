// Gap 4 follow-up fixture — @pyreon/validate v1 port.
//
// v1 contract: top-level `const X = withField(schema, { label, ... })`
// shape with literal meta object. The schema arg is DISCARDED (Zod /
// Valibot / ArkType runtimes don't translate to native); v1's
// deliverable is the META STRUCT so downstream code can reference
// labels / hints / placeholders.
//
// v2+ deferred:
//   - Schema introspection (Strategy-A per-validator lowering)
//   - parseReactive / formatErrors / watchValid runtime
//   - Non-string meta values (boolean autoFocus, i18n key objects)
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
})
