/**
 * The HEAVY typecheck gate: generate EVERY plugin from real, large specs and
 * run the real TypeScript compiler over the output.
 *
 * Opt-in, not part of `bun run test`. On a GitHub-sized spec one validator
 * matrix cell takes tens of seconds and several hundred MB, which is the wrong
 * cost for a unit suite. The unit suite carries a small fixture per bug shape
 * (`generated-typecheck.test.ts`); this script is what proves those fixtures
 * are the WHOLE class on specs nobody wrote for lathe.
 *
 * Why it exists at all: every bug it was written for (a faker arrow that
 * returns an object literal without parens, `export interface X {…} | {…}`,
 * a union with no `.nullable()` in its declared type) compiled a spec lathe's
 * own suite ships, and failed on GitHub's or Stripe's — 1,438 errors in one
 * file, 346 in another. A generator's output is only as tested as the specs it
 * was run over.
 *
 * The specs are not committed (GitHub's is 13 MB). Pass paths:
 *
 *   bun scripts/typecheck-real-specs.ts ~/specs/github.json ~/specs/stripe.json
 *   bun scripts/typecheck-real-specs.ts --validator zod ~/specs/stripe.json
 *   bun scripts/typecheck-real-specs.ts --plugins schemas ~/specs/github.json
 *
 * With `schemas` selected it also compiles `schemas.agreement.ts`, which
 * checks every written-out model interface against what its schema infers;
 * `--no-agreement` leaves it out (it re-infers every schema, so it is the one
 * part of the run a consumer never pays for -- drop it to measure what they do).
 *
 * Exits non-zero on any diagnostic in the generated files. Prints the type and
 * instantiation counts too — deterministic, so they are the numbers to quote
 * when a change claims to make the output cheaper for `tsc`.
 */
import ts from 'typescript'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_PLUGINS, resolveConfig, type PluginName, type ValidatorName } from '../src/core/config'
import { generate } from '../src/core/generate'
import { emitSchemaAgreement } from '../src/emit/schema'
import { banner } from '../src/emit/writer'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', 'src', 'tests', '.generated', 'real')
const CORE = join(HERE, '..', '..', '..', 'core', 'core', 'src', 'index.ts')

const argv = process.argv.slice(2)
const validators: ValidatorName[] = []
let plugins: PluginName[] = [...ALL_PLUGINS]
const specs: string[] = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i] as string
  if (a === '--no-agreement') continue
  else if (a === '--validator') validators.push(argv[++i] as ValidatorName)
  else if (a === '--plugins') plugins = (argv[++i] as string).split(',') as PluginName[]
  else specs.push(a)
}
if (specs.length === 0) {
  console.error('[Pyreon] lathe typecheck-real-specs: pass one or more OpenAPI spec paths.')
  process.exit(2)
}
if (validators.length === 0) validators.push('pyreon', 'zod')

let failed = 0
for (const spec of specs) {
  for (const validator of validators) {
    const name = `${basename(spec).replace(/\.[^.]+$/, '')}-${validator}`
    const root = join(ROOT, name)
    const cfg = resolveConfig({ input: 'x', validator, plugins })
    const result = generate(readFileSync(spec, 'utf8'), cfg)
    const files = [...result.files]
    // Proves every written-out interface agrees with its schema, both ways --
    // the output's own consts are cast, so nothing in it relates the two.
    if (plugins.includes('schemas') && process.argv.includes('--no-agreement') === false) {
      files.push(emitSchemaAgreement(result.doc, validator).build(banner(result.doc.title, result.doc.version)))
    }
    rmSync(root, { recursive: true, force: true })
    for (const f of files) {
      const abs = join(root, f.path)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, f.contents)
    }
    const entries = files.filter((f) => /\.tsx?$/.test(f.path)).map((f) => join(root, f.path))
    const program = ts.createProgram(entries, {
      strict: true,
      exactOptionalPropertyTypes: true,
      noEmit: true,
      skipLibCheck: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      jsxImportSource: '@pyreon/core',
      customConditions: ['bun'],
      // `components.tsx` and the Atlas wrapper import `@pyreon/core`, which
      // lathe itself does not depend on -- so it is not linked here. Mapped to
      // the workspace source, the same thing a consumer's install resolves.
      paths: {
        '@pyreon/core': [CORE],
        '@pyreon/core/*': [join(dirname(CORE), '*')],
      },
    })
    const diags = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName.startsWith(root) === true)
    const checker = program.getTypeChecker()
    const byFile = new Map<string, number>()
    for (const d of diags) {
      const f = d.file?.fileName.slice(root.length + 1) ?? '?'
      byFile.set(f, (byFile.get(f) ?? 0) + 1)
    }
    console.log(
      `${name}: ${diags.length} error(s) · ${checker.getTypeCount()} types · ${checker.getInstantiationCount()} instantiations`,
    )
    for (const [f, n] of [...byFile].sort()) console.log(`  ${f}: ${n}`)
    // One example per (file, code): a thousand copies of one mistake are one
    // finding, and the distinct shapes are what a reader needs to see.
    const seen = new Map<string, number>()
    for (const d of diags) {
      const key = `${d.file?.fileName.slice(root.length + 1)} TS${d.code}`
      const n = seen.get(key) ?? 0
      seen.set(key, n + 1)
      if (n > 0) continue
      const { line } = d.file ? d.file.getLineAndCharacterOfPosition(d.start ?? 0) : { line: 0 }
      console.log(`    ${key} @${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 240)}`)
    }
    for (const [key, n] of seen) if (n > 1) console.log(`    ${key}: ${n} total`)
    if (diags.length > 0) failed++
  }
}
process.exit(failed > 0 ? 1 : 0)
