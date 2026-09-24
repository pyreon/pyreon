import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Write generated files under `root`, creating directories as needed.
 *
 * The output is a TREE (`schemas/Book.ts`, `endpoints/books.ts`), so a writer
 * that pre-creates a fixed list of directories breaks the day the layout gains
 * one.
 */
export function writeTree(
  root: string,
  files: Iterable<{ path: string; contents: string }>,
  keep: (path: string) => boolean = () => true,
): void {
  for (const f of files) {
    if (!keep(f.path)) continue
    const abs = join(root, f.path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.contents)
  }
}

/**
 * Every schema declaration in a generated file set, as ONE source text: the
 * per-model modules under `schemas/`, concatenated in the order the
 * `schemas.ts` barrel re-exports them -- which is dependency order, so the
 * result evaluates as a single script. For assertions about what the schemas
 * say, which do not care which module a model lives in.
 */
export function schemaSource(files: Iterable<{ path: string; contents: string }>): string {
  const all = [...files]
  const byPath = new Map(all.map((f) => [f.path, f.contents]))
  const barrel = byPath.get('schemas.ts') ?? ''
  const order = [...barrel.matchAll(/^export \* from '\.\/(schemas\/[^']+)'$/gm)].map((m) => `${m[1]}.ts`)
  return order.map((p) => byPath.get(p) ?? '').join('\n')
}
