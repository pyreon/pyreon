import type { ExprIR } from '@pyreon/native-compiler/plugin-api'

export interface StyledComponentIR {
  /** The `const X = …` binding name (the JSX tag used at call sites). */
  name: string
  /** The wrapped canonical primitive tag (`Stack`, `Text`, …). */
  tag: string
  /** The static CSS body as a style object (camelCase keys, literal values). */
  styleObject: Extract<ExprIR, { kind: 'object' }>
}
