import type {
  AstNode,
  DeclIR,
  ExprIR,
  TypeIR,
  ExtDeclSpec,
  ExtPayload,
} from '@pyreon/native-compiler/plugin-api'

export type AnyNode = AstNode & {
  body?: AnyNode | undefined
  params?: AnyNode[] | undefined
  properties?: AnyNode[] | undefined
  callee?: AnyNode | undefined
  key?: AnyNode | undefined
  value?: unknown
}
export interface PureStateData {
  hook: 'useToggle' | 'useCounter'
  initial: boolean | number
  bounds?: { min?: number | undefined; max?: number | undefined } | undefined
  floating?: boolean | undefined
}
export interface DebouncedData {
  source: ExprIR
  type: TypeIR
  delayMs: number
}
export interface RateData {
  mode: 'debounce' | 'throttle'
  delayMs: number
  fn: Extract<DeclIR, { kind: 'function' }>
}
export interface TimerData {
  mode: 'interval' | 'timeout'
  delayMs: number
  body: import('@pyreon/native-compiler/plugin-api').StatementIR[]
}
export function spec(type: string, payload: unknown): ExtDeclSpec {
  return { type, payload: payload as ExtPayload }
}
