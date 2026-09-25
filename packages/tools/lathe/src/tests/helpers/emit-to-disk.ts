/**
 * Generate a spec and write the tree where it can be IMPORTED and run.
 *
 * Inside the package (`src/tests/.generated/run/<name>`) for the reason the
 * adapter fixture gives: generated modules import `@pyreon/http`, `zod`, …
 * by bare specifier, and only a directory inside the workspace resolves them.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type LatheSection } from '../../core/config'
import { generate, type GenerateResult } from '../../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '.generated', 'run')

export interface Emitted {
  root: string
  result: GenerateResult
  /** Import a generated module by its output-relative path (`endpoints/default.ts`). */
  load<T = Record<string, unknown>>(path: string): Promise<T>
  file(path: string): string
  /**
   * Every file of one layer (`endpoints`, `queries`), barrel excluded, joined.
   * An untagged operation is grouped by its PATH, so a test that asserts on
   * "the endpoints" must not name one group's file.
   */
  layer(dir: string): string
}

export function emitToDisk(
  name: string,
  spec: string,
  config: Omit<LatheSection, 'input' | 'projects'> = {},
): Emitted {
  const result = generate(spec, resolveConfig({ input: 'x', ...config }))
  const root = join(ROOT, name)
  rmSync(root, { recursive: true, force: true })
  for (const f of result.files) {
    const abs = join(root, f.path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.contents)
  }
  return {
    root,
    result,
    load: async <T,>(path: string): Promise<T> => (await import(join(root, path))) as T,
    file: (path: string): string => {
      const f = result.files.find((x) => x.path === path)
      if (!f) throw new Error(`no generated file ${path}`)
      return f.contents
    },
    layer: (dir: string): string =>
      result.files
        .filter((x) => x.path.startsWith(`${dir}/`) && x.path !== `${dir}/index.ts`)
        .map((x) => x.contents)
        .join('\n'),
  }
}

export function cleanEmitted(name: string): void {
  rmSync(join(ROOT, name), { recursive: true, force: true })
}
