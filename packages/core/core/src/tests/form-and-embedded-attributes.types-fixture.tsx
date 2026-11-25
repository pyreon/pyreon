/**
 * Type-only fixture for `form-and-embedded-attributes.types.test.ts`: the #4823
 * repro as JSX. Checked by `tsc --noEmit` (core's vitest config has no JSX
 * transform, so it is never imported by a test). Before the fix each of these
 * three expressions was a TS2322 error.
 */
import type {} from '../jsx-runtime'

export const disabled = (): boolean => true

// The #4823 repro, verbatim plus the reactive form.
export const a = (
  <fieldset disabled={true}>
    <input />
  </fieldset>
)

export const b = (
  <select>
    <optgroup label="x" disabled={true}>
      <option>1</option>
    </optgroup>
  </select>
)

export const c = (
  <fieldset form="f" name="n" disabled={disabled}>
    <input />
  </fieldset>
)
