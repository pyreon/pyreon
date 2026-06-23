/**
 * Type-level contract for the `AriaRole` union on `PyreonHTMLAttributes.role`.
 *
 * `AriaRole` exists to give `role="…"` autocomplete + literal discoverability
 * WITHOUT restricting the attribute — the `(string & {})` member keeps the
 * union OPEN so any string (custom roles, `role={dynamicString}`, future
 * tokens) still assigns. So the contract is: known roles AND arbitrary
 * strings both assign; it's a non-breaking DX refinement, not a restriction.
 */
import { describe, expectTypeOf, it } from 'vitest'
import type { AriaRole, PyreonHTMLAttributes } from '../index'

describe('AriaRole', () => {
  it('accepts known WAI-ARIA role literals', () => {
    expectTypeOf<'button'>().toMatchTypeOf<AriaRole>()
    expectTypeOf<'tab'>().toMatchTypeOf<AriaRole>()
    expectTypeOf<'gridcell'>().toMatchTypeOf<AriaRole>()
    expectTypeOf<'switch'>().toMatchTypeOf<AriaRole>()
    expectTypeOf<'none'>().toMatchTypeOf<AriaRole>()
  })

  it('stays OPEN — any string still assigns (non-breaking)', () => {
    // A custom / non-standard role string is still a valid AriaRole.
    expectTypeOf<'my-custom-role'>().toMatchTypeOf<AriaRole>()
    expectTypeOf<string>().toMatchTypeOf<AriaRole>()
  })

  it('is the type of the `role` HTML attribute (value + accessor forms)', () => {
    type RoleProp = PyreonHTMLAttributes['role']
    // Static value form.
    expectTypeOf<AriaRole>().toMatchTypeOf<RoleProp>()
    // Reactive accessor form (`role={() => cond() ? 'tab' : undefined}`).
    expectTypeOf<() => AriaRole | undefined>().toMatchTypeOf<RoleProp>()
    // undefined (omitted) is allowed.
    expectTypeOf<undefined>().toMatchTypeOf<RoleProp>()
  })
})
