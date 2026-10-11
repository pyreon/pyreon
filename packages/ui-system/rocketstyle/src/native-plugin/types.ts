import type { ExprIR } from '@pyreon/native-compiler/plugin-api'

export interface RocketstyleComponentIR {
  name: string
  /** The canonical primitive base tag. */
  tag: string
  /** `.theme()` base styles. */
  base: Extract<ExprIR, { kind: 'object' }>
  /** dimension name (`state`/`size`/`variant`) → value name → its style object. */
  dims: Record<string, Record<string, Extract<ExprIR, { kind: 'object' }>>>
}
