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
}

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "array"
  | "object"
  | "reference"
  | "unknown"

/** Symbol used to tag reference schema objects. */
const REFERENCE_TAG = Symbol.for("pyreon:feature:reference")

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
    typeof value === "object" &&
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
    if (typeof value === "string" || typeof value === "number") {
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
    _def: { typeName: "ZodString" },
  }
}

/**
 * Convert a field name to a human-readable label.
 * e.g., 'firstName' → 'First Name', 'created_at' → 'Created At'
 */
function nameToLabel(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/[_-]/g, " ") // snake_case/kebab-case → spaces
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
} {
  // Check for reference fields first
  if (isReference(zodField)) {
    return {
      type: "reference",
      optional: false,
      referenceTo: zodField._featureName,
    }
  }

  if (!zodField || typeof zodField !== "object") {
    return { type: "unknown", optional: false }
  }

  const field = zodField as Record<string, unknown>

  // Check for optional wrapper (ZodOptional or ZodNullable)
  let inner = field
  let optional = false

  // Zod v3: _def.typeName, Zod v4: _zod.def.type
  const getTypeName = (obj: Record<string, unknown>): string | undefined => {
    // v3 path
    const def = obj._def as Record<string, unknown> | undefined
    if (def?.typeName && typeof def.typeName === "string") {
      return def.typeName
    }
    // v4 path
    const zod = obj._zod as Record<string, unknown> | undefined
    const zodDef = zod?.def as Record<string, unknown> | undefined
    if (zodDef?.type && typeof zodDef.type === "string") {
      return zodDef.type
    }
    return undefined
  }

  const typeName = getTypeName(inner)

  // Unwrap optional/nullable
  if (
    typeName === "ZodOptional" ||
    typeName === "ZodNullable" ||
    typeName === "optional" ||
    typeName === "nullable"
  ) {
    optional = true
    const def = inner._def as Record<string, unknown> | undefined
    const innerType = def?.innerType ?? (inner._zod as Record<string, unknown>)?.def
    if (innerType && typeof innerType === "object") {
      inner = innerType as Record<string, unknown>
    }
  }

  const innerTypeName = getTypeName(inner) ?? typeName

  // Map Zod type names to our FieldType
  if (!innerTypeName) return { type: "unknown", optional }

  const typeMap: Record<string, FieldType> = {
    ZodString: "string",
    ZodNumber: "number",
    ZodBoolean: "boolean",
    ZodDate: "date",
    ZodEnum: "enum",
    ZodNativeEnum: "enum",
    ZodArray: "array",
    ZodObject: "object",
    // v4 names
    string: "string",
    number: "number",
    boolean: "boolean",
    date: "date",
    enum: "enum",
    array: "array",
    object: "object",
  }

  const type = typeMap[innerTypeName] ?? "string"

  // Extract enum values
  let enumValues: (string | number)[] | undefined
  if (type === "enum") {
    const def = inner._def as Record<string, unknown> | undefined
    if (def?.values && Array.isArray(def.values)) {
      enumValues = def.values as (string | number)[]
    }
    // v4 path
    const zodDef = (inner._zod as Record<string, unknown>)?.def as
      | Record<string, unknown>
      | undefined
    if (zodDef?.values && Array.isArray(zodDef.values)) {
      enumValues = zodDef.values as (string | number)[]
    }
  }

  return {
    type,
    optional,
    ...(enumValues != null ? { enumValues } : {}),
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
export function extractFields(schema: unknown): FieldInfo[] {
  if (!schema || typeof schema !== "object") return []

  const s = schema as Record<string, unknown>

  // Get the shape object from the schema
  // Zod v3: schema._def.shape() or schema.shape
  // Zod v4: schema._zod.def.shape or schema.shape
  let shape: Record<string, unknown> | undefined

  // Try schema.shape (works for both v3 and v4)
  if (s.shape && typeof s.shape === "object") {
    shape = s.shape as Record<string, unknown>
  }

  // Try _def.shape (v3 — can be a function)
  if (!shape) {
    const def = s._def as Record<string, unknown> | undefined
    if (def?.shape) {
      shape =
        typeof def.shape === "function"
          ? (def.shape as () => Record<string, unknown>)()
          : (def.shape as Record<string, unknown>)
    }
  }

  // Try _zod.def.shape (v4)
  if (!shape) {
    const zod = s._zod as Record<string, unknown> | undefined
    const zodDef = zod?.def as Record<string, unknown> | undefined
    if (zodDef?.shape && typeof zodDef.shape === "object") {
      shape = zodDef.shape as Record<string, unknown>
    }
  }

  if (!shape) return []

  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { type, optional, enumValues, referenceTo } = detectFieldType(fieldSchema)
    const info: FieldInfo = {
      name,
      type,
      optional,
      label: nameToLabel(name),
    }
    if (enumValues) info.enumValues = enumValues
    if (referenceTo) info.referenceTo = referenceTo
    return info
  })
}

/**
 * Generate default initial values from a schema's field types.
 */
export function defaultInitialValues(fields: FieldInfo[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    switch (field.type) {
      case "string":
        values[field.name] = ""
        break
      case "number":
        values[field.name] = 0
        break
      case "boolean":
        values[field.name] = false
        break
      case "enum":
        values[field.name] = field.enumValues?.[0] ?? ""
        break
      case "date":
        values[field.name] = ""
        break
      default:
        values[field.name] = ""
    }
  }
  return values
}
