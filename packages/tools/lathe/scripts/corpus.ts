/**
 * The FULL-size real-spec run, on demand: `bun run corpus <dir-of-specs>`.
 *
 * The vendored excerpts under `src/tests/fixtures/corpus/` are the permanent
 * gate; this is its large sibling for the specs too big to vendor (GitHub is
 * 13 MB, Stripe 8 MB). For every `*.json` / `*.yaml` in the directory it
 * loads the spec, generates the full plugin set, IMPORTS the generated
 * `schemas.ts` under both validators, and validates the spec's own
 * `components.examples` through the same-named schema. It reports, it does
 * not gate: a large spec's examples carry their own upstream bugs, which the
 * report lists for a human to classify.
 *
 * Timings are printed for orientation only -- they are NOT a benchmark
 * (single run, no interleaving, whatever the machine's load is).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveConfig } from '../src/core/config'
import { generate } from '../src/core/generate'
import { typeIdent } from '../src/core/naming'
import { parseSpecText } from '../src/input/yaml'

const dir = process.argv[2]
if (!dir) {
  process.stderr.write('usage: bun scripts/corpus.ts <directory of OpenAPI specs>\n')
  process.exit(1)
}

// Inside the package so the emitted imports resolve through the workspace.
const OUT = join(import.meta.dir, '..', 'src', 'tests', '.generated', 'corpus-full')
let failed = 0

for (const file of readdirSync(dir).filter((f) => /\.(json|ya?ml)$/.test(f)).sort()) {
  const text = readFileSync(resolve(dir, file), 'utf8')
  for (const validator of ['pyreon', 'zod'] as const) {
    const started = Date.now()
    try {
      const result = generate(text, resolveConfig({ input: 'x', validator }))
      const schemas = result.files.find((f) => f.path === 'schemas.ts')?.contents ?? 'export {}\n'
      const target = join(OUT, file.replace(/\W/g, '_'), validator)
      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, 'schemas.ts'), schemas)
      const mod = (await import(join(target, 'schemas.ts'))) as Record<
        string,
        { '~standard'?: { validate: (v: unknown) => { issues?: readonly { message: string; path?: readonly unknown[] }[] } } }
      >
      const examples =
        (parseSpecText(text) as { components?: { examples?: Record<string, { value?: unknown }> } }).components?.examples ?? {}
      let accepted = 0
      const rejected: string[] = []
      for (const [name, ex] of Object.entries(examples)) {
        const schema = mod[typeIdent(name)]?.['~standard']
        if (!schema || !('value' in ex)) continue
        const r = schema.validate(ex.value)
        if (!r.issues || r.issues.length === 0) accepted++
        else rejected.push(`${name}: ${r.issues[0]?.message ?? ''}`)
      }
      process.stdout.write(
        `ok    ${file} ${validator}: ${result.doc.models.length} models, ${result.doc.operations.length} ops, ` +
          `${result.doc.notes.length} notes, examples ${accepted} accepted / ${rejected.length} rejected (${Date.now() - started}ms)\n`,
      )
      for (const r of rejected.slice(0, 20)) process.stdout.write(`        rejected ${r}\n`)
    } catch (err) {
      failed++
      process.stdout.write(`FAIL  ${file} ${validator}: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }
}
rmSync(OUT, { recursive: true, force: true })
process.exit(failed > 0 ? 1 : 0)
