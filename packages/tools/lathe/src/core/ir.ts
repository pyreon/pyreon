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
  | IrStringType
  | IrNumberType
  | { kind: 'boolean' }
  | { kind: 'null' }
  /**
   * A closed set of JSON values: an `enum`, or a `const` (one value). Its own
   * kind rather than a flag on `string`, for two reasons found on real specs:
   * string constraints attached to an enum emitted `s.enum([…]).min(3)` -- a
   * TypeError at import that killed DigitalOcean's whole schema module -- and
   * a NON-string enum (`[1, 2]`, `['a', 1, null]`) had nowhere to go.
   */
  | { kind: 'enum'; values: readonly IrLiteral[] }
  /** Anything the input could not narrow. Emitters render `unknown`. */
  | { kind: 'unknown'; reason: string }
  | IrArrayType
  | { kind: 'object'; fields: readonly IrField[]; additional?: IrType | undefined }
  /** A named model defined elsewhere in {@link IrDocument.models}. */
  | { kind: 'ref'; name: string }
  | {
      kind: 'union'
      options: readonly IrType[]
      /**
       * The discriminating property's WIRE name (`pet_type`, not `petType`) --
       * it is a key in the payload, not an identifier in the output.
       */
      discriminator?: string | undefined
    }
  /**
   * `inner`, or `null`.
   *
   * A wrapper rather than a field flag so nullability applies wherever a type
   * can appear -- a model root, an array item, a response root, a parameter.
   * As a field-only flag, `nullable: true` on a COMPONENT model (the way
   * GitHub spells every nullable relation) was dropped, and the generated
   * client rejected valid `200` responses with `Expected object, received null`.
   */
  | { kind: 'nullable'; inner: IrType }

/** A JSON scalar an `enum` / `const` can hold. */
export type IrLiteral = string | number | boolean | null

export interface IrStringType {
  kind: 'string'
  format?: StringFormat | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  pattern?: string | undefined
}

export interface IrNumberType {
  kind: 'number'
  integer: boolean
  minimum?: number | undefined
  maximum?: number | undefined
  /** Strict bounds. 3.0's boolean form is normalized to these numbers. */
  exclusiveMinimum?: number | undefined
  exclusiveMaximum?: number | undefined
  multipleOf?: number | undefined
}

export interface IrArrayType {
  kind: 'array'
  items: IrType
  minItems?: number | undefined
  maxItems?: number | undefined
  uniqueItems?: boolean | undefined
}

/** Formats Lathe understands. Anything else degrades to a plain string. */
export type StringFormat = 'email' | 'uri' | 'uuid' | 'date' | 'date-time' | 'binary'

export interface IrField {
  name: string
  /** Nullability lives on the type (`kind: 'nullable'`), like everywhere else. */
  type: IrType
  required: boolean
  /** From the spec's `description`/`title` — becomes `withField` metadata. */
  doc?: string | undefined
  /** Spec `example`, used by the mock emitter and rendered into JSDoc. */
  example?: unknown
  /**
   * Server-assigned (`readOnly`) / client-only (`writeOnly`). The input layer
   * uses these to derive the REQUEST and RESPONSE shapes of a model; by the
   * time emitters see the document, a request type carries no readOnly field
   * and a response type no writeOnly one.
   */
  readOnly?: boolean | undefined
  writeOnly?: boolean | undefined
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

/**
 * How a request body travels on the wire.
 *
 * The IR used to carry only a TYPE, so every body went out as `json:` -- and
 * Stripe (611 of 612 mutations) and Twilio accept only form encoding.
 */
export type BodyEncoding = 'json' | 'form' | 'multipart' | 'text' | 'binary'

/** One property's serialization in a form body — OpenAPI's Encoding Object. */
export interface IrFieldEncoding {
  style?: 'form' | 'deepObject' | 'spaceDelimited' | 'pipeDelimited' | undefined
  explode?: boolean | undefined
}

export interface IrBody {
  /** The chosen media type, verbatim (`application/x-www-form-urlencoded`). */
  mediaType: string
  encoding: BodyEncoding
  /**
   * The body's shape. For `text` a string; for `binary` a `binary`-format
   * string (the emitters render it as a Blob in request position).
   */
  type: IrType
  /** `form` only: per-property serialization, when the spec declares any. */
  fieldEncoding?: Readonly<Record<string, IrFieldEncoding>> | undefined
}

/** One API operation — the unit every emitter iterates. */
export interface IrOperation {
  /** Stable, unique, already a valid identifier (`getUserById`). */
  id: string
  method: HttpMethod
  /** Pyreon-shaped path: `/users/:id`, NOT OpenAPI's `/users/{id}`. */
  path: string
  /**
   * The operation's OWN server, when its operation- or path-level `servers`
   * differ from the document's. Absolute; a config `baseUrl` does not
   * override it.
   */
  baseUrl?: string | undefined
  /** Grouping key from the spec's first tag; `default` when untagged. */
  tag: string
  summary?: string | undefined
  pathParams: readonly IrParam[]
  queryParams: readonly IrParam[]
  /**
   * Header parameters, keyed by their wire name. `Accept`, `Content-Type` and
   * `Authorization` are never here: OpenAPI says a header parameter with one
   * of those names SHALL be ignored (the client and the security scheme own
   * them).
   */
  headerParams: readonly IrParam[]
  /** Cookie parameters, keyed by their wire name. */
  cookieParams: readonly IrParam[]
  /** Request body, when the operation takes one. */
  body?: IrBody | undefined
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
  | 'cyclic-ref'
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
  'cyclic-ref': 'loss',
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
