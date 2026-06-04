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
// We can't fully convert a zod schema to JSON Schema without a converter
// (zod-to-json-schema, valibot-to-json-schema, etc.) and we explicitly
// don't depend on any specific validator. Instead we emit a permissive
// generic schema that requires `title` (universal convention) and
// permits any other top-level field. The user can replace the generated
// schemas with stricter versions if they want.

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
 * Requires `title`; permits any other field. Apps can replace this with
 * a stricter generated version once they integrate a zod-to-json-schema
 * converter.
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
    const schemaBody = defaultPermissiveSchema(name)
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
