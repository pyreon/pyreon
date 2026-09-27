/**
 * Schema introspection utilities.
 *
 * Extracts field names, types, and metadata from Zod schemas at runtime
 * without importing Zod types directly (duck-typed).
 */

export interface FieldInfo {
  /** Field name (key in the schema object). */
  name: string
  /** Inferred type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array' | 'object' | 'reference' | 'unknown'. */
  type: FieldType
  /** Whether the field is optional. */
  optional: boolean
  /** For enum fields, the list of allowed values. */
  enumValues?: (string | number)[]
  /** For reference fields, the name of the referenced feature. */
  referenceTo?: string
  /** Human-readable label derived from field name. */
  label: string
  /**
   * The schema's own default (`z.number().default(7)`), when it declares one.
   * `defaultInitialValues` prefers it over the type-derived blank.
   */
  defaultValue?: unknown
  /**
   * A string format the schema pins (`z.string().email()` / `z.email()` →
   * `'email'`, `.url()` → `'url'`). `<Field>` maps it to the input type.
   */
  format?: 'email' | 'url'
}

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'array'
  | 'object'
  | 'reference'
  | 'unknown'

/** Symbol used to tag reference schema objects. */
const REFERENCE_TAG = Symbol.for('pyreon:feature:reference')

/**
 * Metadata carried by a reference schema.
 */
export interface ReferenceSchema {
  /** Marker symbol for detection. */
  [key: symbol]: true
  /** Name of the referenced feature. */
  _featureName: string
  /** Duck-typed Zod-like interface: validates as string | number. */
  safeParse: (value: unknown) => {
    success: boolean
    error?: { issues: { message: string }[] }
  }
  /** Async variant for compatibility. */
  safeParseAsync: (
    value: unknown,
  ) => Promise<{ success: boolean; error?: { issues: { message: string }[] } }>
  /** Shape-like marker for schema introspection. */
  _def: { typeName: string }
}

/**
 * Check if a value is a reference schema created by `reference()`.
 */
export function isReference(value: unknown): value is ReferenceSchema {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[REFERENCE_TAG] === true
  )
}

/**
 * Create a reference field that links to another feature.
 *
 * Returns a Zod-compatible schema that validates as `string | number` and
 * carries metadata about the referenced feature for form dropdowns and table links.
 *
 * @example
 * ```ts
 * import { defineFeature, reference } from '@pyreon/feature'
 *
 * const posts = defineFeature({
 *   name: 'posts',
 *   schema: z.object({
 *     title: z.string(),
 *     authorId: reference(users),
 *   }),
 *   api: '/api/posts',
 * })
 * ```
 */
export function reference(feature: { name: string }): ReferenceSchema {
  const featureName = feature.name

  function validateRef(value: unknown): {
    success: boolean
    error?: { issues: { message: string }[] }
  } {
    if (typeof value === 'string' || typeof value === 'number') {
      return { success: true }
    }
    return {
      success: false,
      error: {
        issues: [
          {
            message: `Expected string or number reference to ${featureName}, got ${typeof value}`,
          },
        ],
      },
    }
  }

  return {
    [REFERENCE_TAG]: true,
    _featureName: featureName,
    safeParse: validateRef,
    safeParseAsync: async (value: unknown) => validateRef(value),
    _def: { typeName: 'ZodString' },
  }
}

/**
 * Convert a field name to a human-readable label.
 * e.g., 'firstName' → 'First Name', 'created_at' → 'Created At'
 */
function nameToLabel(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .replace(/[_-]/g, ' ') // snake_case/kebab-case → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize words
}

/**
 * Detect the field type from a Zod schema shape entry.
 * Duck-typed — works with Zod v3 and v4 without importing Zod.
 */
function detectFieldType(zodField: unknown): {
  type: FieldType
  optional: boolean
  enumValues?: (string | number)[]
  referenceTo?: string
  defaultValue?: unknown
  hasDefault?: boolean
  format?: 'email' | 'url'
} {
  // Check for reference fields first
  if (isReference(zodField)) {
    return {
      type: 'reference',
      optional: false,
      referenceTo: zodField._featureName,
    }
  }

  if (!zodField || typeof zodField !== 'object') {
    return { type: 'unknown', optional: false }
  }

  const field = zodField as Record<string, unknown>

  // Check for optional wrapper (ZodOptional or ZodNullable)
  let inner = field
  let optional = false

  // Zod v3: _def.typeName, Zod v4: _zod.def.type
  const getTypeName = (obj: Record<string, unknown>): string | undefined => {
    // v3 path
    const def = obj._def as Record<string, unknown> | undefined
    if (def?.typeName && typeof def.typeName === 'string') {
      return def.typeName
    }
    // v4 path
    const zod = obj._zod as Record<string, unknown> | undefined
    const zodDef = zod?.def as Record<string, unknown> | undefined
    if (zodDef?.type && typeof zodDef.type === 'string') {
      return zodDef.type
    }
    return undefined
  }

  const typeName = getTypeName(inner)

  // Unwrap optional / nullable / default wrappers — in ANY order and depth
  // (`.optional().default(x)`, `.default(x).nullable()`). Pre-fix only ONE
  // optional/nullable layer was peeled and `ZodDefault` not at all, so a
  // `.default(x)` field fell through to the `'string'` fallback (its enum /
  // number type lost) and its declared default was ignored.
  let hasDefault = false
  let defaultValue: unknown
  for (let i = 0; i < 8; i++) {
    const t = getTypeName(inner)
    const isOptional = t === 'ZodOptional' || t === 'ZodNullable' || t === 'optional' || t === 'nullable'
    const isDefault = t === 'ZodDefault' || t === 'default' || t === 'prefault'
    if (!isOptional && !isDefault) break
    const def = (inner._def ?? (inner._zod as Record<string, unknown>)?.def) as
      | Record<string, unknown>
      | undefined
    if (isOptional) optional = true
    if (isDefault && !hasDefault) {
      hasDefault = true
      const raw = def?.defaultValue
      // zod v3 stores a thunk; zod v4 stores the value (a getter on the def).
      defaultValue = typeof raw === 'function' ? (raw as () => unknown)() : raw
    }
    const innerType = def?.innerType
    if (!innerType || typeof innerType !== 'object') break
    inner = innerType as Record<string, unknown>
  }

  const innerTypeName = getTypeName(inner) ?? typeName

  // Map Zod type names to our FieldType
  if (!innerTypeName) return { type: 'unknown', optional }

  const typeMap: Record<string, FieldType> = {
    ZodString: 'string',
    ZodNumber: 'number',
    ZodBoolean: 'boolean',
    ZodDate: 'date',
    ZodEnum: 'enum',
    ZodNativeEnum: 'enum',
    ZodArray: 'array',
    ZodObject: 'object',
    // v4 names
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'date',
    enum: 'enum',
    array: 'array',
    object: 'object',
  }

  const type = typeMap[innerTypeName] ?? 'string'

  // Extract enum values.
  //
  // `enumValues` is documented on `FieldInfo` as "the list of allowed values",
  // and for zod v4 it was never populated: the two paths below looked for
  // `def.values`, which v4 does not have. It stores the members as an ENTRIES
  // map (`{ draft: 'draft', … }`) and exposes them as `.options`. So an enum
  // field came back correctly typed with no values — a documented field that
  // was silently always `undefined`, which reads downstream as "this enum has
  // no members" rather than "we could not read them".
  let enumValues: (string | number)[] | undefined
  if (type === 'enum') {
    const def = inner._def as Record<string, unknown> | undefined
    const zodDef = (inner._zod as Record<string, unknown>)?.def as
      | Record<string, unknown>
      | undefined

    // v3: `_def.values` is the member array.
    if (Array.isArray(def?.values)) {
      enumValues = def.values as (string | number)[]
    } else if (Array.isArray(zodDef?.values)) {
      enumValues = zodDef.values as (string | number)[]
    }

    // v4: `.options` is the public accessor; `entries` is the underlying map,
    // and its VALUES are the members (a native enum maps name → value, so
    // reading values rather than keys is what gives the real members).
    if (!enumValues && Array.isArray((inner as { options?: unknown }).options)) {
      enumValues = (inner as { options: (string | number)[] }).options
    }
    if (!enumValues) {
      const entries = (zodDef?.entries ?? def?.entries) as Record<string, unknown> | undefined
      if (entries && typeof entries === 'object') {
        const values = Object.values(entries).filter(
          (val): val is string | number => typeof val === 'string' || typeof val === 'number',
        )
        if (values.length > 0) enumValues = values
      }
    }
  }

  // String format (email / url) — drives the `<input type>` `<Field>` renders.
  // zod v4: `z.email()` has def.format; `z.string().email()` pushes a check
  // whose `_zod.def.format` names it. zod v3: `_def.checks[].kind`.
  let format: 'email' | 'url' | undefined
  if (type === 'string') {
    const zodDef = (inner._zod as Record<string, unknown>)?.def as Record<string, unknown> | undefined
    const def = inner._def as Record<string, unknown> | undefined
    const formats: unknown[] = [zodDef?.format]
    const checks = (zodDef?.checks ?? def?.checks) as unknown[] | undefined
    if (Array.isArray(checks)) {
      for (const c of checks) {
        const cr = c as Record<string, unknown>
        formats.push(cr.kind, cr.format, ((cr._zod as Record<string, unknown>)?.def as Record<string, unknown>)?.format)
      }
    }
    if (formats.includes('email')) format = 'email'
    else if (formats.includes('url')) format = 'url'
  }

  return {
    type,
    optional,
    ...(enumValues != null ? { enumValues } : {}),
    ...(hasDefault ? { hasDefault, defaultValue } : {}),
    ...(format ? { format } : {}),
  }
}

/**
 * Extract field information from a Zod object schema.
 * Returns an array of FieldInfo objects describing each field.
 *
 * @example
 * ```ts
 * const schema = z.object({ name: z.string(), age: z.number().optional() })
 * const fields = extractFields(schema)
 * // [
 * //   { name: 'name', type: 'string', optional: false, label: 'Name' },
 * //   { name: 'age', type: 'number', optional: true, label: 'Age' },
 * // ]
 * ```
 */
const FIELD_TYPE_NAMES = new Set<string>([
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'array',
  'object',
  'reference',
  'unknown',
])

/**
 * Is this a literal field-type map rather than a validator?
 *
 * Requires at least one entry and EVERY value to be a known field-type name.
 * A Zod/Valibot/ArkType schema never satisfies that — its values are schema
 * objects — so the two forms cannot be confused.
 */
function isLiteralFieldTypeMap(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value)
  if (entries.length === 0) return false
  return entries.every(([, v]) => typeof v === 'string' && FIELD_TYPE_NAMES.has(v))
}

export function extractFields(schema: unknown): FieldInfo[] {
  if (!schema || typeof schema !== 'object') return []

  const s = schema as Record<string, unknown>

  // Get the shape object from the schema
  // Zod v3: schema._def.shape() or schema.shape
  // Zod v4: schema._zod.def.shape or schema.shape
  let shape: Record<string, unknown> | undefined

  // Try schema.shape (works for both v3 and v4)
  if (s.shape && typeof s.shape === 'object') {
    shape = s.shape as Record<string, unknown>
  }

  // Try _def.shape (v3 — can be a function)
  if (!shape) {
    const def = s._def as Record<string, unknown> | undefined
    if (def?.shape) {
      shape =
        typeof def.shape === 'function'
          ? (def.shape as () => Record<string, unknown>)()
          : (def.shape as Record<string, unknown>)
    }
  }

  // Try _zod.def.shape (v4)
  if (!shape) {
    const zod = s._zod as Record<string, unknown> | undefined
    const zodDef = zod?.def as Record<string, unknown> | undefined
    if (zodDef?.shape && typeof zodDef.shape === 'object') {
      shape = zodDef.shape as Record<string, unknown>
    }
  }

  // The LITERAL field-type map — `schema: { id: 'string', done: 'boolean' }`.
  //
  // This is the ONE schema form `@pyreon/native-compiler` can introspect, so it
  // is the form the multiplatform docs prescribe for a feature that has to run
  // on all three targets (a runtime Zod/Valibot/ArkType schema is not
  // introspected there and warns by name). On the web it produced NO fields at
  // all — no auto form fields, no table columns, no create defaults — so the
  // one shape that crosses was inert on the target it was written for.
  //
  // Recognized only when EVERY value is a known field-type string, so a real
  // schema whose shape happens to hold strings can never be mistaken for one.
  if (!shape && isLiteralFieldTypeMap(s)) {
    return Object.entries(s).map(([name, type]) => ({
      name,
      type: type as FieldType,
      optional: false,
      label: nameToLabel(name),
    }))
  }

  if (!shape) return []

  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { type, optional, enumValues, referenceTo, hasDefault, defaultValue, format } =
      detectFieldType(fieldSchema)
    const info: FieldInfo = {
      name,
      type,
      optional,
      label: nameToLabel(name),
    }
    if (enumValues) info.enumValues = enumValues
    if (referenceTo) info.referenceTo = referenceTo
    if (hasDefault) info.defaultValue = defaultValue
    if (format) info.format = format
    return info
  })
}

/**
 * Generate default initial values from a schema's field types.
 */
export function defaultInitialValues(fields: FieldInfo[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    // The schema's own `.default(x)` wins over a type-derived blank.
    if ('defaultValue' in field) {
      values[field.name] = field.defaultValue
      continue
    }
    switch (field.type) {
      case 'string':
        values[field.name] = ''
        break
      case 'number':
        values[field.name] = 0
        break
      case 'boolean':
        values[field.name] = false
        break
      case 'enum':
        values[field.name] = field.enumValues?.[0] ?? ''
        break
      case 'date':
        // `''` is not a Date — `z.date()` rejected the untouched default. An
        // absent value is the honest "not chosen yet".
        values[field.name] = undefined
        break
      case 'array':
        // `''` is not an array — `z.array(...)` rejected the untouched default.
        values[field.name] = []
        break
      default:
        values[field.name] = ''
    }
  }
  return values
}
