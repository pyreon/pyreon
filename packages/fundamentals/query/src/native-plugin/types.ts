import type { ExprIR, StatementIR, TypeIR } from '@pyreon/native-compiler/plugin-api'

/** The payload of a `query` declaration (see `recognizeQuery`). */
export interface QueryPayload {
  /** The decoded result type `T`. */
  type: TypeIR
  /** The literal fetch URL; absent when `urlExpr` or `valueExpr` took its place. */
  url?: string
  /** A RUNTIME fetch URL: a `template` the emit interpolates INSIDE the async harness. */
  urlExpr?: ExprIR
  /** A non-fetch `queryFn` returning the value directly. */
  valueExpr?: ExprIR
  /** The cache key — the `queryKey` array's literals colon-joined. */
  queryKey: string
  /** A RUNTIME cache key built from non-literal `queryKey` parts. */
  queryKeyExpr?: ExprIR
  /** `staleTime` in milliseconds (Swift converts to seconds). */
  staleMillis: number
  method?: string
  headers?: Record<string, string>
  body?: string
}

/** The payload of a `stream` declaration (see `recognizeStream`). */
export interface StreamPayload {
  format: 'sse' | 'ndjson'
  /** `SseEvent<T>` (SSE) or the NDJSON line type. */
  itemType: TypeIR
  /** The decoded payload type `T`. */
  dataType: TypeIR
  sseText: boolean
  url: string
  urlExpr?: ExprIR
  method: string
  headers?: Record<string, string>
  accept?: string
  requestBody?: string
  requestBodyExpr?: ExprIR
  enabled?: ExprIR
  onEvent?: { param: string; body: StatementIR[] }
  events?: string[]
  lastEventId?: string
  reconnect: { attempts: number; delay: number; maxDelay: number; onEnd: boolean } | null
  maxEvents: number
}
