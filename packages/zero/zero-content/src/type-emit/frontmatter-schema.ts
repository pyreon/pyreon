import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ContentConfig } from '../types'

// ─── Frontmatter JSON Schema emission ──────────────────────────────────────
//
// Writes a JSON Schema file per collection so editors (VS Code, JetBrains)
// can autocomplete + validate frontmatter inside `.md` files via the
// `yaml-schema` editor convention. The plugin pairs each schema with an
// entry in `.vscode/settings.json` mapping content directories to their
// schemas.
//
// Pre-fix (PR-E audit C5) the emitter always produced a fully permissive
// schema regardless of what the user's `defineCollection({ schema })`
// looked like, so IDE autocomplete only suggested `title` /
// `description` / `sidebar.{order,group}` — never the user's actual
// fields (e.g. `author: z.string()`, `tags: z.array(z.string())`).
//
// We now introspect Zod-shaped schemas (`schema._def.shape()`) and emit
// a stricter JSON Schema that lists the real fields, plus their basic
// type info. Non-Zod schemas (Valibot, ArkType, Typia) fall back to the
// permissive shape; consumers can land per-validator adapters as
// follow-ups without touching the call site.

export interface EmitFrontmatterSchemaArgs {
  config: ContentConfig
  /** Vite root, used to compute output paths. */
  root: string
}

export interface SchemaArtifact {
  /** Absolute path to the emitted schema. */
  file: string
  /** Collection name. */
  collection: string
  /** Glob pattern that matches the collection's `.md` files. */
  glob: string
}

/**
 * Default permissive JSON Schema for a markdown file's frontmatter.
 * Requires `title`; permits any other field. Used as the fallback when
 * the collection schema isn't Zod-shaped (we currently introspect Zod
 * only; Valibot / ArkType adapters can land later without touching
 * the call site).
 *
 * @internal exported for testing
 */
export function defaultPermissiveSchema(collection: string): unknown {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://schemas.pyreon.dev/zero-content/${collection}.json`,
    title: `Frontmatter for ${collection}`,
    type: 'object',
    required: ['title'],
    additionalProperties: true,
    properties: {
      title: { type: 'string', description: 'Page title' },
      description: { type: 'string', description: 'Brief description' },
      sidebar: {
        type: 'object',
        properties: {
          order: { type: 'number', description: 'Order within group' },
          group: { type: 'string', description: 'Sidebar group label' },
        },
        additionalProperties: false,
      },
    },
  }
}

interface ZodFieldShape {
  typeName?: string
  innerType?: { _def?: ZodFieldShape }
  values?: readonly unknown[]
}

interface ZodSchemaShape {
  _def?: {
    typeName?: string
    shape?: () => Record<string, { _def?: ZodFieldShape }>
  }
}

/**
 * Map a Zod `_def.typeName` to a JSON Schema type. Returns `null` when
 * the type isn't recognised (we still emit the field as a permissive
 * `{}` so editors keep autocomplete on the key).
 *
 * @internal exported for testing
 */
export function zodTypeNameToJsonSchema(
  typeName: string | undefined,
): Record<string, unknown> | null {
  switch (typeName) {
    case 'ZodString':
      return { type: 'string' }
    case 'ZodNumber':
      return { type: 'number' }
    case 'ZodBoolean':
      return { type: 'boolean' }
    case 'ZodDate':
      // YAML dates are typically ISO strings; JSON Schema's
      // `format: 'date-time'` lets editors hint accordingly.
      return { type: 'string', format: 'date-time' }
    case 'ZodArray':
      return { type: 'array' }
    case 'ZodObject':
      return { type: 'object' }
    case 'ZodLiteral':
      return { type: 'string' }
    case 'ZodEnum':
    case 'ZodNativeEnum':
      return { type: 'string' }
    default:
      return null
  }
}

/**
 * Walk the Zod shape underneath one field def to produce its JSON
 * Schema fragment. Handles `optional()` / `nullable()` / `default()`
 * wrappers by unwrapping `_def.innerType`.
 *
 * @internal exported for testing
 */
export function zodFieldToJsonSchema(field: {
  _def?: ZodFieldShape
}): { schema: Record<string, unknown>; required: boolean } {
  let cur: { _def?: ZodFieldShape } | undefined = field
  let required = true
  // Unwrap modifier layers (optional/nullable/default all wrap an
  // inner type). Capped at depth 6 to avoid pathological cycles.
  for (let i = 0; i < 6 && cur?._def; i++) {
    const tn = cur._def.typeName
    if (tn === 'ZodOptional' || tn === 'ZodDefault') {
      required = false
      cur = cur._def.innerType
      continue
    }
    if (tn === 'ZodNullable') {
      cur = cur._def.innerType
      continue
    }
    break
  }
  const schema = cur?._def
    ? zodTypeNameToJsonSchema(cur._def.typeName) ?? {}
    : {}
  return { schema, required }
}

/**
 * Detect whether a user's schema looks like a Zod object schema (one
 * we can introspect for shape). Returns `false` for Valibot/ArkType/
 * Typia which require their own adapters (out of scope here — they
 * fall back to permissive).
 *
 * @internal exported for testing
 */
export function isZodObjectSchema(value: unknown): value is ZodSchemaShape {
  if (value === null || typeof value !== 'object') return false
  const def = (value as { _def?: { typeName?: unknown; shape?: unknown } })._def
  if (!def || typeof def !== 'object') return false
  return def.typeName === 'ZodObject' && typeof def.shape === 'function'
}

/**
 * Build a stricter JSON Schema from a Zod object schema. The result
 * lists every top-level field with its inferred type + required-ness;
 * `additionalProperties` is `false` so the editor warns on unknown
 * keys. Falls back to permissive when introspection fails.
 *
 * @internal exported for testing
 */
export function buildJsonSchemaFromZod(
  collection: string,
  schema: ZodSchemaShape,
): unknown {
  try {
    const def = schema._def
    if (!def?.shape) return defaultPermissiveSchema(collection)
    const shape = def.shape()
    if (!shape || typeof shape !== 'object') {
      return defaultPermissiveSchema(collection)
    }
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, field] of Object.entries(shape)) {
      const { schema: fieldSchema, required: isRequired } = zodFieldToJsonSchema(
        field as { _def?: ZodFieldShape },
      )
      properties[key] = fieldSchema
      if (isRequired) required.push(key)
    }
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `https://schemas.pyreon.dev/zero-content/${collection}.json`,
      title: `Frontmatter for ${collection}`,
      type: 'object',
      required,
      additionalProperties: false,
      properties,
    }
  } catch {
    // Any unexpected shape — bail to permissive so we don't break
    // the build for misconfigured schemas. Editor autocomplete just
    // degrades to the permissive baseline.
    return defaultPermissiveSchema(collection)
  }
}

/**
 * Best-effort JSON Schema for the given collection. Tries Zod
 * introspection first; falls back to permissive when the user
 * brought a non-Zod validator (Valibot/ArkType/Typia all duck-type
 * onto Standard Schema but don't expose Zod's `_def`).
 *
 * @internal exported for testing
 */
export function buildSchemaForCollection(
  collection: string,
  rawSchema: unknown,
): unknown {
  if (isZodObjectSchema(rawSchema)) {
    return buildJsonSchemaFromZod(collection, rawSchema)
  }
  return defaultPermissiveSchema(collection)
}

/**
 * Write per-collection JSON Schema files under `<root>/.pyreon/schemas/`.
 * Returns the list of emitted artifacts (paths + glob patterns) so the
 * caller can wire `.vscode/settings.json` later.
 */
export async function emitFrontmatterSchemas(
  args: EmitFrontmatterSchemaArgs,
): Promise<SchemaArtifact[]> {
  const outDir = path.join(args.root, '.pyreon', 'schemas')
  await fs.mkdir(outDir, { recursive: true })
  const artifacts: SchemaArtifact[] = []
  for (const [name, def] of Object.entries(args.config.collections)) {
    if (def.type !== 'pages') continue
    const schemaBody = buildSchemaForCollection(name, def.schema)
    const file = path.join(outDir, `${name}.json`)
    await fs.writeFile(file, JSON.stringify(schemaBody, null, 2), 'utf8')
    const collectionPath = def.path ?? `src/content/${name}`
    const rel = collectionPath.replace(/\\/g, '/')
    const glob = rel.endsWith('/') ? `${rel}**/*.md` : `${rel}/**/*.md`
    artifacts.push({ file, collection: name, glob })
  }
  return artifacts
}

/**
 * Render the `.vscode/settings.json` snippet that wires each emitted
 * schema to its content glob via the `yaml.schemas` setting (the
 * markdown YAML frontmatter editor convention used by VS Code's YAML
 * extension).
 *
 * @internal exported for testing
 */
export function renderVscodeSnippet(artifacts: SchemaArtifact[]): string {
  const schemas: Record<string, string[]> = {}
  for (const a of artifacts) {
    schemas[a.file] = [a.glob]
  }
  return JSON.stringify({ 'yaml.schemas': schemas }, null, 2)
}

/**
 * Write a `.vscode/settings.json` snippet to a separate file
 * (`.pyreon/vscode-settings.json`). Apps can copy-paste the relevant
 * lines into their real `.vscode/settings.json` — we DON'T touch their
 * actual settings file to avoid clobbering user customization.
 *
 * Why `.pyreon/vscode-settings.json` and NOT `.vscode/settings.json`?
 * (PR-E audit L16 — explicit non-clobber by design.) The settings
 * file is owned by the user; merging into it would lose their
 * formatter / extension / editor preferences. Emitting alongside
 * the generated schemas keeps the snippet discoverable AND lets the
 * `yaml.schemas` block stay regenerable across schema edits without
 * fighting whatever else lives in the user's VS Code settings.
 */
export async function writeVscodeSnippetFile(
  args: EmitFrontmatterSchemaArgs,
  artifacts: SchemaArtifact[],
): Promise<string> {
  const file = path.join(args.root, '.pyreon', 'vscode-settings.json')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, renderVscodeSnippet(artifacts), 'utf8')
  return file
}
