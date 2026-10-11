import type { ExprIR } from '@pyreon/native-compiler/plugin-api'

export interface AttrsComponentIR {
  name: string
  tag: string
  defaultAttrs: { name: string; value: ExprIR }[]
}
