/**
 * PR-E audit regression specs — types correctness.
 *
 *   C5 — Zod schema introspection produces a stricter JSON Schema
 *        (not the generic permissive one) when the user's collection
 *        schema is Zod-shaped.
 *   C6 — Generated `.pyreon/content-types.d.ts` uses type-position
 *        `typeof import('...')` so it resolves under both
 *        `moduleResolution: bundler` AND `nodenext`.
 *   L2 — Emitter writes `.pyreon/tsconfig.json` the user can extend
 *        instead of fiddling with `include`.
 *   L16 — Honor the non-clobber design: emit
 *         `.pyreon/vscode-settings.json` (not `.vscode/settings.json`)
 *         so user editor preferences aren't overwritten.
 */
import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildJsonSchemaFromZod,
  buildSchemaForCollection,
  defaultPermissiveSchema,
  isZodObjectSchema,
  writeVscodeSnippetFile,
  zodFieldToJsonSchema,
  zodTypeNameToJsonSchema,
  emitFrontmatterSchemas,
} from '../type-emit/frontmatter-schema'
import {
  renderContentTypes,
  renderPyreonTsconfig,
  writeContentTypes,
} from '../type-emit/content-types'

// Build a fake Zod-shaped schema that exposes `_def.shape()` exactly
// like a real `z.object(...)`. We don't actually import zod here so the
// test stays validator-agnostic.
function fakeZod<T extends Record<string, unknown>>(
  shape: T,
): { _def: { typeName: 'ZodObject'; shape: () => T } } {
  return { _def: { typeName: 'ZodObject', shape: () => shape } }
}
const zString = () => ({ _def: { typeName: 'ZodString' } })
const zNumber = () => ({ _def: { typeName: 'ZodNumber' } })
const zBoolean = () => ({ _def: { typeName: 'ZodBoolean' } })
const zArray = () => ({ _def: { typeName: 'ZodArray' } })
const zOptional = <T>(inner: T) => ({
  _def: { typeName: 'ZodOptional', innerType: inner },
})
const zDefault = <T>(inner: T) => ({
  _def: { typeName: 'ZodDefault', innerType: inner },
})
const zEnum = (values: readonly string[]) => ({
  _def: { typeName: 'ZodEnum', values },
})

describe('PR-E C5 — Zod schema introspection', () => {
  it('isZodObjectSchema detects a Zod object', () => {
    expect(isZodObjectSchema(fakeZod({ x: zString() }))).toBe(true)
    expect(isZodObjectSchema(null)).toBe(false)
    expect(isZodObjectSchema({})).toBe(false)
    expect(isZodObjectSchema('zod')).toBe(false)
    expect(isZodObjectSchema({ _def: {} })).toBe(false)
  })

  it('zodTypeNameToJsonSchema maps known primitives', () => {
    expect(zodTypeNameToJsonSchema('ZodString')).toEqual({ type: 'string' })
    expect(zodTypeNameToJsonSchema('ZodNumber')).toEqual({ type: 'number' })
    expect(zodTypeNameToJsonSchema('ZodBoolean')).toEqual({ type: 'boolean' })
    expect(zodTypeNameToJsonSchema('ZodArray')).toEqual({ type: 'array' })
    expect(zodTypeNameToJsonSchema('ZodDate')).toEqual({
      type: 'string',
      format: 'date-time',
    })
    expect(zodTypeNameToJsonSchema('ZodObject')).toEqual({ type: 'object' })
    expect(zodTypeNameToJsonSchema('ZodEnum')).toEqual({ type: 'string' })
    expect(zodTypeNameToJsonSchema('ZodLiteral')).toEqual({ type: 'string' })
  })

  it('zodTypeNameToJsonSchema returns null for unknown types (caller emits `{}`)', () => {
    expect(zodTypeNameToJsonSchema('ZodBigInt')).toBeNull()
    expect(zodTypeNameToJsonSchema(undefined)).toBeNull()
  })

  it('zodFieldToJsonSchema unwraps optional/default modifiers', () => {
    const a = zodFieldToJsonSchema(zString())
    expect(a).toEqual({ schema: { type: 'string' }, required: true })
    const b = zodFieldToJsonSchema(zOptional(zString()))
    expect(b).toEqual({ schema: { type: 'string' }, required: false })
    const c = zodFieldToJsonSchema(zDefault(zNumber()))
    expect(c).toEqual({ schema: { type: 'number' }, required: false })
  })

  it('buildJsonSchemaFromZod emits strict additionalProperties:false + required[]', () => {
    const schema = buildJsonSchemaFromZod(
      'docs',
      fakeZod({
        title: zString(),
        description: zOptional(zString()),
        author: zString(),
        tags: zOptional(zArray()),
        draft: zDefault(zBoolean()),
      }),
    ) as Record<string, unknown> & {
      properties: Record<string, unknown>
      required: string[]
    }
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    // Required: title + author (no optional / default wrap).
    expect(schema.required.sort()).toEqual(['author', 'title'])
    expect(schema.properties.title).toEqual({ type: 'string' })
    expect(schema.properties.description).toEqual({ type: 'string' })
    expect(schema.properties.tags).toEqual({ type: 'array' })
    expect(schema.properties.draft).toEqual({ type: 'boolean' })
  })

  it('buildSchemaForCollection falls back to permissive for non-Zod schemas', () => {
    const permissive = defaultPermissiveSchema('docs') as Record<string, unknown>
    expect(buildSchemaForCollection('docs', {})).toEqual(permissive)
    expect(buildSchemaForCollection('docs', null)).toEqual(permissive)
    expect(buildSchemaForCollection('docs', 'string')).toEqual(permissive)
  })

  it('end-to-end: emitFrontmatterSchemas writes a Zod-introspected JSON Schema', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pyreon-emit-'))
    try {
      const config = {
        collections: {
          docs: {
            type: 'pages' as const,
            schema: fakeZod({
              title: zString(),
              author: zString(),
              tags: zOptional(zArray()),
              category: zEnum(['intro', 'guide', 'reference']),
            }),
          },
        },
      }
      const artifacts = await emitFrontmatterSchemas({ config, root })
      expect(artifacts).toHaveLength(1)
      const written = await fs.readFile(artifacts[0]!.file, 'utf8')
      const parsed = JSON.parse(written) as Record<string, unknown>
      expect(parsed.additionalProperties).toBe(false)
      // title + author + category are required (no optional wrap);
      // tags has an `optional()` wrap so it's missing from required.
      expect((parsed.required as string[]).sort()).toEqual([
        'author',
        'category',
        'title',
      ])
      const props = parsed.properties as Record<string, unknown>
      expect(props.tags).toEqual({ type: 'array' })
      expect(props.category).toEqual({ type: 'string' })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe('PR-E C6 — content-types.d.ts uses typeof import() (type-position)', () => {
  it('uses `typeof import("...")` not a top-level ESM import', () => {
    const out = renderContentTypes({
      configFile: '/abs/proj/content.config.ts',
      collectionNames: ['docs'],
      root: '/abs/proj',
    })
    expect(out).toContain('typeof import("../content.config")')
    // No `import type * as ContentConfig` form remains.
    expect(out).not.toContain('import type * as ContentConfig')
  })

  it('quotes collection names safely so weird keys are inert', () => {
    const out = renderContentTypes({
      configFile: '/abs/proj/content.config.ts',
      collectionNames: ['blog-posts', 'data:users'],
      root: '/abs/proj',
    })
    expect(out).toContain('"blog-posts"')
    expect(out).toContain('"data:users"')
  })
})

describe('PR-E L2 — emit .pyreon/tsconfig.json the user can extend', () => {
  it('renderPyreonTsconfig produces a minimal extend-shaped config', () => {
    const ts = JSON.parse(renderPyreonTsconfig()) as Record<string, unknown>
    expect(ts.include).toEqual(['./content-types.d.ts'])
    expect(ts.$schema).toBe('https://json.schemastore.org/tsconfig')
    // No compilerOptions — we don't want to steamroll the user's
    // settings; the extend point is purely about `include`.
    expect(ts.compilerOptions).toBeUndefined()
  })

  it('writeContentTypes emits BOTH content-types.d.ts AND tsconfig.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pyreon-emit-types-'))
    try {
      await writeContentTypes({
        configFile: path.join(root, 'content.config.ts'),
        collectionNames: ['docs'],
        root,
      })
      const dts = await fs.readFile(
        path.join(root, '.pyreon', 'content-types.d.ts'),
        'utf8',
      )
      expect(dts).toContain('typeof import(')
      const tsconfig = JSON.parse(
        await fs.readFile(path.join(root, '.pyreon', 'tsconfig.json'), 'utf8'),
      ) as Record<string, unknown>
      expect(tsconfig.include).toEqual(['./content-types.d.ts'])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe('PR-E L16 — `.pyreon/vscode-settings.json` non-clobber path', () => {
  it('writes a copy-pastable snippet at `.pyreon/vscode-settings.json` (NOT `.vscode/settings.json`)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pyreon-emit-vscode-'))
    try {
      const config = {
        collections: {
          docs: { type: 'pages' as const, schema: fakeZod({ title: zString() }) },
        },
      }
      // First, emit the schema artifacts so writeVscodeSnippetFile
      // has something to wire.
      const artifacts = await emitFrontmatterSchemas({ config, root })
      const file = await writeVscodeSnippetFile({ config, root }, artifacts)
      expect(file).toBe(path.join(root, '.pyreon', 'vscode-settings.json'))
      // The user's `.vscode/` is NOT touched (non-clobber).
      const userVscode = path.join(root, '.vscode', 'settings.json')
      await expect(fs.access(userVscode)).rejects.toBeTruthy()
      // The emitted snippet is valid JSON shaped as a `yaml.schemas`
      // mapping so the user can copy-paste it into their real VS
      // Code settings.
      const json = JSON.parse(await fs.readFile(file, 'utf8')) as Record<
        string,
        unknown
      >
      expect(typeof json['yaml.schemas']).toBe('object')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
