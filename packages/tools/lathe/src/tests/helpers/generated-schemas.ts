/**
 * Generate `schemas.ts` for a spec, write it inside the package, and IMPORT it.
 *
 * Importing is the point. Two whole classes of bug in this generator are
 * invisible to a string assertion and fatal at import: a schema library that
 * validates its arguments at CONSTRUCTION (`s.discriminatedUnion` throws when a
 * member's tag is not a literal; `s.enum([...]).min(3)` is a TypeError), and a
 * `const` emitted before a dependency it names (a TDZ `ReferenceError`). Both
 * killed whole real-world clients while every emit-level test passed.
 *
 * Written under `src/tests/.generated/` so the emitted imports of
 * `@pyreon/validate` / `zod` resolve through the workspace, and cleaned up per
 * directory rather than wholesale: vitest runs test files in parallel workers
 * that share the tree.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { schemaSource, writeTree } from './write-tree'
import { resolveConfig, type ValidatorName } from '../../core/config'
import { generate } from '../../core/generate'
import type { IrDocument } from '../../core/ir'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '.generated')

/** The Standard Schema surface both libraries expose. */
export interface StdSchema {
  '~standard': {
    validate: (v: unknown) => { issues?: readonly { message: string }[] } | Promise<unknown>
  }
}

export interface LoadedSchemas {
  doc: IrDocument
  schemas: Record<string, StdSchema>
  /** The emitted source, for assertions about shape. */
  source: string
}

const created = new Set<string>()

/** Generate, write and import `schemas.ts` for `spec` under `validator`. */
export async function loadGeneratedSchemas(
  spec: string,
  validator: ValidatorName,
  tag: string,
): Promise<LoadedSchemas> {
  const cfg = resolveConfig({ input: 'x', validator, plugins: ['schemas'] })
  const result = generate(spec, cfg)
  const files = result.files.filter((f) => f.path === 'schemas.ts' || f.path.startsWith('schemas/'))
  const dir = join(ROOT, tag, validator)
  mkdirSync(dir, { recursive: true })
  created.add(join(ROOT, tag))
  // One module per model plus the `schemas.ts` barrel; `source` is every
  // schema declaration as one text, for assertions about what they say.
  const source = schemaSource(files)
  if (files.length === 0) writeFileSync(join(dir, 'schemas.ts'), 'export {}\n')
  else writeTree(dir, files)
  const mod = (await import(join(dir, 'schemas.ts'))) as Record<string, StdSchema>
  return { doc: result.doc, schemas: mod, source }
}

/** Synchronous issue list for a value; the generated schemas are sync. */
export function issuesOf(schema: StdSchema | undefined, value: unknown): readonly { message: string }[] {
  if (!schema) throw new Error('schema not exported')
  const r = schema['~standard'].validate(value)
  if (r instanceof Promise) throw new Error('unexpected async schema')
  return (r as { issues?: readonly { message: string }[] }).issues ?? []
}

/** Remove what this worker wrote. */
export function cleanupGenerated(): void {
  for (const d of created) rmSync(d, { recursive: true, force: true })
  created.clear()
}
