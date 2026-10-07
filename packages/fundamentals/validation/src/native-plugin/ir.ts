// The schema model the native compiler lowers a schema declaration to — the payload of a `schema` module
// item. It is plugin-owned data, not compiler IR: the compiler stores it as an opaque JSON payload and only
// this plugin (and `@pyreon/validate`'s, which builds on it) ever reads its shape.
//
// The key ORDER of these objects is load-bearing: the compiler hashes the payload (`legacyList`) into the
// names of the structs it synthesizes, and the hash is the JSON text.

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1.
 * Recognizes the simplest `zodSchema(z.object({...}))` pattern and
 * emits a per-binding struct representing the validated shape.
 * v1 supports `z.string()` / `z.number()` / `z.boolean()` fields.
 * Schema-modifier chains (.min(), .max(), .email(), etc.) are
 * accepted at the AST level but their constraints are NOT
 * enforced in the emitted struct — v1 is shape only. v2 follow-up
 * will emit runtime validation methods that honor constraints.
 */
/**
 * Gap 4 v2.1 — constraint enforcement for emitted schemas.
 * Extracted from Zod modifier chains: `.min(N)`, `.max(N)`,
 * `.email()`, `.url()`, `.uuid()`. Each constraint becomes a
 * runtime check inside the generated `parse()` method.
 *
 * For string fields:
 *   - min: minimum length
 *   - max: maximum length
 *   - email: rough RFC-5322 email regex check
 *   - url: the authoring library's URL rule (see `UrlRule`)
 *   - uuid: UUID-format check
 *
 * For number fields:
 *   - min: numeric minimum (inclusive)
 *   - max: numeric maximum (inclusive)
 */
/**
 * Which URL rule a `.url()` lowers to. The libraries DISAGREE, so the rule is
 * read off the one that authored the schema rather than assumed:
 *
 * - `scheme`: zod's `.url()` -- an absolute URL of any scheme (`mailto:` and
 *   `ftp://` pass).
 * - `http`: `@pyreon/validate`'s default `.url()` -- `http:` / `https:` with a
 *   host, exactly its `URL_RE`. Lowering this as `scheme` made a device ACCEPT
 *   `javascript:alert(1)` where the web rejects it.
 * - `protocol`: `@pyreon/validate`'s `.url({ protocol: /re/ })` -- any
 *   RFC 3986 absolute URI whose scheme (no colon) matches `source`.
 */
export type UrlRule =
  | { kind: 'scheme' }
  | { kind: 'http' }
  | { kind: 'protocol'; source: string; ignoreCase: boolean }

export interface ZodFieldConstraints {
  min?: number
  max?: number
  email?: boolean
  url?: UrlRule
  uuid?: boolean
  /**
   * `.regex(/…/)` — the literal's source, plus whether it carried the `i`
   * flag. Both targets test for a PARTIAL match, which is what
   * `RegExp.test()` does on the web (an anchored pattern still anchors).
   *
   * Only patterns whose syntax is portable across JS / NSRegularExpression
   * / java.util.regex reach here; the recognizer declines the rest by name
   * rather than emitting a check that would disagree with the web.
   */
  regex?: { source: string; ignoreCase: boolean }
}

/**
 * Gap 4 v2.2 — compound field type extension.
 * 'array' marks a list-of-primitive field (z.array(z.string()) etc.);
 * the `element` carries the inner primitive type.
 *
 * Gap 4 v3 — `elementConstraints` carries constraints applied to the
 * INNER element call (`z.array(z.string().min(2))`). v3 ships
 * arrays-of-primitives + per-element constraints; nested arrays and
 * arrays of objects remain deferred.
 */
export type ZodFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  /**
   * Gap 4 v3.2 — nested object reference. `schemaName` points at a
   * sibling `ZodSchemaDefnIR` (typically synthesized + listed in the
   * parent's `auxSchemas`). Emitters render as `<schemaName>` (struct
   * or data class name) and route parse() through the named schema's
   * own `parse()` method.
   */
  | { kind: 'object'; schemaName: string }
  | {
      kind: 'array'
      /**
       * Element type. v2.2 shipped primitives only; v3.2 adds nested
       * object elements via `{ kind: 'object', schemaName }`.
       */
      element:
        | 'string'
        | 'number'
        | 'boolean'
        | { kind: 'object'; schemaName: string }
      /** v3 — applies to PRIMITIVE element types only. */
      elementConstraints?: ZodFieldConstraints
      /**
       * The element is `number().int()`. Absent means a plain `number()`,
       * which accepts a fraction — see the field-level `integer`.
       */
      elementInteger?: boolean
    }

export interface ZodSchemaDefnIR {
  /** Top-level binding name (e.g. `userSchema`). */
  bindingName: string
  /** Field shape extracted from `z.object({ ... })`. */
  fields: {
    name: string
    type: ZodFieldType
    /** Gap 4 v2.1 — constraints extracted from the modifier chain. */
    constraints?: ZodFieldConstraints
    /**
     * Gap 4 v2.2 — `.optional()` or `.nullable()` modifier present.
     * Emitted as `T?` in both Swift and Kotlin; parse() returns nil
     * (not throw) when the field is missing.
     */
    optional?: boolean
    /**
     * `.int()` is in the modifier chain. Absent on a `number()` field means
     * the schema accepts a FRACTION (`1.5`), which is the evidence
     * `refineStructFloatsFromResponseSchemas` uses to type a decode struct's
     * matching field Double rather than PMTC's `number` → Int default.
     */
    integer?: boolean
  }[]
  /**
   * Gap 4 v3.2 — auxiliary schemas synthesized while parsing this
   * one. A `z.object({ address: z.object({...}) })` produces an
   * auxiliary `<binding>_address` schema; a `z.array(z.object({...}))`
   * produces a `<binding>_<field>_Item`. The top-level schema's
   * emitter must emit each aux schema as a sibling struct/data-class
   * BEFORE the main schema (Swift compiles top-down; Kotlin uses
   * forward references either way, but ordering improves readability).
   */
  auxSchemas?: ZodSchemaDefnIR[]
  /**
   * Gap 4 v3.3 — discriminated union shape. Set when the source is
   * `z.discriminatedUnion('<field>', [z.object({...}), ...])`. When
   * set, `fields` is empty — the emitter renders the schema as a
   * Swift enum / Kotlin sealed class with each variant as an
   * associated-value case. Each variant references an aux schema in
   * `auxSchemas` (one per variant).
   */
  discriminator?: {
    /** Discriminator field name (e.g. `'type'`). */
    field: string
    /** One entry per variant. */
    variants: {
      /** Literal value the variant matches (e.g. `'cat'`). */
      literal: string
      /** Aux schema name (the variant's struct/data class). */
      schemaName: string
      /**
       * Variant tag (PascalCased literal). Used as the enum case /
       * sealed-class subclass name (e.g. `Cat`, `Dog`).
       */
      caseName: string
    }[]
  }
  /**
   * Standalone-validation follow-up — this schema was SYNTHESIZED from an
   * inline `s.object({ … }).safeParse(x)` expression rather than a top-level
   * `const X = s.object({ … })` declaration. The emitter suppresses the
   * trailing instance binding (`let <bindingName> = …` / the Kotlin val),
   * which only exists so a top-level schema name resolves as a value; an
   * inline schema is referenced solely through its static `safeParseResult`.
   */
  inline?: boolean
  /**
   * Standalone-validation follow-up — emit the web-faithful
   * `safeParseResult(_ input:) -> PyreonParseResult<Self>` static method on
   * this schema (in addition to the `Result`-returning `safeParse`). The
   * `.safeParse(x).success` / `.data` shape shared source writes lowers to a
   * call on it, because Swift's `Result` / Kotlin's `Result` carry no
   * `.success` Bool. Only inline-validated schemas set this.
   */
  emitSafeParseResult?: boolean
}