/**
 * `format` — run the project's formatter over generated output.
 *
 * Teams format everything they commit, and a generated tree that is not
 * formatted either fails their `format:check` or gets reformatted by it —
 * after which `lathe check` reports every file stale, because it compares
 * against Lathe's own bytes. So the formatter is applied INSIDE the pipeline,
 * before a file is written and before `check` compares: the committed,
 * formatted output is exactly what the next run produces.
 *
 * Kept out of `generate()`, which stays synchronous and pure; formatters
 * (prettier, biome's JS API) are asynchronous.
 */

import type { GeneratedFile } from '../emit/writer'
import { OUTPUT_MANIFEST } from './output-manifest'

/** See `LatheSection.format`. */
export type LatheFormatter = (code: string, path: string) => string | Promise<string>

/**
 * Files never passed to a formatter: Lathe's machine records. Their bytes are
 * Lathe's contract with its next run, not source anyone reads.
 */
const BOOKKEEPING = new Set([OUTPUT_MANIFEST, 'api-surface.json'])

/**
 * Format `files` with `format`, preserving order. Without a formatter the
 * input is returned as-is.
 *
 * @example
 * ```ts
 * import { format as prettier } from 'prettier'
 * import { formatFiles, generate, resolveConfig } from '@pyreon/lathe'
 *
 * const config = resolveConfig({ input: './openapi.yaml' })
 * const files = await formatFiles(generate(spec, config).files, (code, path) => prettier(code, { filepath: path }))
 * ```
 */
export async function formatFiles(
  files: readonly GeneratedFile[],
  format: LatheFormatter | undefined,
): Promise<GeneratedFile[]> {
  if (!format) return [...files]
  return Promise.all(
    files.map(async (file) => {
      if (BOOKKEEPING.has(file.path)) return file
      let out: unknown
      try {
        out = await format(file.contents, file.path)
      } catch (err) {
        throw new Error(
          `[Pyreon] lathe: \`format\` failed on \`${file.path}\`: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        )
      }
      if (typeof out !== 'string') {
        throw new Error(
          `[Pyreon] lathe: \`format\` returned ${out === null ? 'null' : typeof out} for \`${file.path}\` — it must return the formatted source as a string.`,
        )
      }
      return { path: file.path, contents: out }
    }),
  )
}
