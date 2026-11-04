import type { ExprIR } from '@pyreon/native-compiler/plugin-api'

export interface RocketstyleComponentIR {
  name: string
  /** The canonical primitive base tag. */
  tag: string
  /** `.theme()` base styles. */
  base: Extract<ExprIR, { kind: 'object' }>
  /** dimension name (`state`/`size`/`variant`) → value name → its style object. */
  dims: Record<string, Record<string, Extract<ExprIR, { kind: 'object' }>>>
  /**
   * The `active:` / `pressed:` sub-objects, keyed like `base` / `dims`
   * (`base` → the `.theme()` block's, `dim.value` → that dimension value's).
   * Absent when the component declares none, so a definition without a
   * pressed style carries exactly the payload it always did.
   */
  pressed?: Record<string, Extract<ExprIR, { kind: 'object' }>>
}
