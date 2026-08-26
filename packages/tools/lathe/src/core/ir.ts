/**
 * The Lathe IR — a spec-agnostic model of an API.
 *
 * Everything downstream (every emitter, the lowerability verifier, the CLI
 * report) reads THIS and never the OpenAPI document. That boundary is the
 * reason a second input — a GraphQL SDL, a `@pyreon/zero` route table read
 * directly, a hand-written manifest — is a new `input/` module and nothing
 * else, rather than a rewrite of the generators.
 *
 * The types are deliberately smaller than OpenAPI. A spec can express a great
 * deal that no target here can represent, and the honest place to lose that is
 * at the boundary, ONCE, with a recorded reason — not silently in six
 * different emitters that each discover the gap on their own.
 */

/** A resolved type in the IR. Recursive; `ref` closes cycles. */
export type IrType =
  | { kind: 'string'; format?: StringFormat; enum?: readonly string[] }
  | { kind: 'number'; integer: boolean }
  | { kind: 'boolean' }
  | { kind: 'null' }
  /** Anything the input could not narrow. Emitters render `unknown`. */
  | { kind: 'unknown'; reason: string }
  | { kind: 'array'; items: IrType }
  | { kind: 'object'; fields: readonly IrField[]; additional?: IrType | undefined }
  /** A named model defined elsewhere in {@link IrDocument.models}. */
  | { kind: 'ref'; name: string }
  | { kind: 'union'; options: readonly IrType[]; discriminator?: string | undefined }

/** Formats Lathe understands. Anything else degrades to a plain string. */
export type StringFormat = 'email' | 'uri' | 'uuid' | 'date' | 'date-time' | 'binary'

export interface IrField {
  name: string
  type: IrType
  required: boolean
  nullable: boolean
  /** From the spec's `description`/`title` — becomes `withField` metadata. */
  doc?: string | undefined
  /** Constraints Pyreon-validate can express. */
  min?: number | undefined
  max?: number | undefined
  pattern?: string | undefined
  /** Spec `example`, used by the mock emitter and rendered into JSDoc. */
  example?: unknown
}

/** A named top-level model — one generated schema + one generated type. */
export interface IrModel {
  name: string
  type: IrType
  doc?: string | undefined
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface IrParam {
  name: string
  type: IrType
  required: boolean
  doc?: string | undefined
}

/** One API operation — the unit every emitter iterates. */
export interface IrOperation {
  /** Stable, unique, already a valid identifier (`getUserById`). */
  id: string
  method: HttpMethod
  /** Pyreon-shaped path: `/users/:id`, NOT OpenAPI's `/users/{id}`. */
  path: string
  /** Grouping key from the spec's first tag; `default` when untagged. */
  tag: string
  summary?: string | undefined
  pathParams: readonly IrParam[]
  queryParams: readonly IrParam[]
  /** Request body type, when the operation takes one. */
  body?: IrType | undefined
  /** The 2xx response type. `undefined` means no content. */
  response?: IrType | undefined
}

export interface IrDocument {
  title: string
  version: string
  /** From `servers[0].url`; `''` when the spec declares none. */
  baseUrl: string
  models: readonly IrModel[]
  operations: readonly IrOperation[]
  /**
   * Everything the input layer dropped, with a reason. Surfaced by the CLI and
   * counted by the gate — a spec feature Lathe cannot represent is a REPORTED
   * loss, never a silent one.
   */
  notes: readonly IrNote[]
}

export interface IrNote {
  /** Stable, greppable class an agent or a gate can branch on. */
  code:
    | 'unsupported-schema'
    | 'unsupported-ref'
    | 'missing-operation-id'
    | 'multiple-content-types'
    | 'no-servers'
    | 'cyclic-ref'
  message: string
  /** JSON-pointer-ish location in the source document. */
  at: string
}

/** Where an operation can run once generated. Decided by {@link verify}. */
export type Reach = 'web+native' | 'web-only'
