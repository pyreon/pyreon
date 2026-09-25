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

/** Stable, greppable class of a {@link IrNote}. */
export type IrNoteCode =
  | 'unsupported-schema'
  | 'unsupported-ref'
  | 'unsupported-const'
  | 'missing-operation-id'
  | 'multiple-content-types'
  | 'non-json-media-type'
  | 'no-servers'
  | 'unsupported-parameter'
  | 'parameter-serialization'
  | 'unsupported-security'
  | 'response-headers'
  | 'error-responses'
  | 'other-success-responses'
  | 'optional-request-body'
  | 'deprecated'
  | 'extra-tags'
  | 'description-dropped'
  | 'numeric-version'

/**
 * What a note means for the generated client.
 *
 * - `loss` — the spec says something the generated code does NOT honour: a
 *   parameter it cannot send, a header it cannot read, a constraint it does not
 *   enforce. These are the notes to read.
 * - `choice` — Lathe picked among equivalent readings (JSON over XML, the first
 *   tag, the summary over the description). Nothing the spec requires is lost;
 *   the note records WHICH reading, for the reader who wonders.
 *
 * Keeping them under separate severities is what lets the report lead with the
 * losses: Petstore 3 produced 17 notes and 16 were "picked JSON over XML",
 * which buried the one real loss under a wall of benign ones.
 */
export type IrNoteSeverity = 'loss' | 'choice'

/**
 * Severity per code. A `Record` over the code union, so a new code cannot be
 * added without deciding which kind it is -- the compiler refuses the map.
 */
export const NOTE_SEVERITY: Readonly<Record<IrNoteCode, IrNoteSeverity>> = {
  'unsupported-schema': 'loss',
  'unsupported-ref': 'loss',
  'unsupported-const': 'loss',
  'missing-operation-id': 'choice',
  'multiple-content-types': 'choice',
  'non-json-media-type': 'loss',
  'no-servers': 'loss',
  'unsupported-parameter': 'loss',
  'parameter-serialization': 'loss',
  'unsupported-security': 'loss',
  'response-headers': 'loss',
  'error-responses': 'loss',
  'other-success-responses': 'loss',
  'optional-request-body': 'loss',
  deprecated: 'loss',
  'extra-tags': 'choice',
  'description-dropped': 'choice',
  'numeric-version': 'choice',
}

/** The severity of a note, from its code. */
export function noteSeverity(note: Pick<IrNote, 'code'>): IrNoteSeverity {
  return NOTE_SEVERITY[note.code]
}

export interface IrNote {
  /** Stable, greppable class an agent or a gate can branch on. */
  code: IrNoteCode
  message: string
  /**
   * RFC 6901 JSON pointer into the source document (`#/paths/~1pets/get`).
   * `/` and `~` inside a segment are escaped, so the pointer resolves -- a raw
   * path key used to produce `#/paths//pets/get`, which points nowhere.
   */
  at: string
}

/** Where an operation can run once generated. Decided by {@link verify}. */
export type Reach = 'web+native' | 'web-only'
