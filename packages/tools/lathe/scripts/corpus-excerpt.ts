/**
 * Cut a small, self-contained EXCERPT out of a large real spec, for the
 * vendored corpus under `src/tests/fixtures/corpus/`.
 *
 * Real specs are 1–13 MB; the permanent gate cannot vendor them. An excerpt
 * keeps the shapes that matter -- the exact schemas, operations and examples
 * that broke the generator -- plus the transitive `$ref` closure they need, so
 * the excerpt is a VALID document that exercises the real text.
 *
 * Usage:
 *   bun scripts/corpus-excerpt.ts <spec> <out.json> \
 *     [--schema Name]... [--path '/x']... [--example name]... [--success-only]
 *
 * `--success-only` drops an included operation's non-2xx responses: a real
 * spec's error envelope often references half the document (Stripe's pulls in
 * ~900 schemas), and the generator only reads the success response anyway.
 *
 * Selected examples bring the same-named schema with them, which is how the
 * corpus gate pairs an example with the schema it should validate against.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseSpecText } from '../src/input/yaml'

type Json = Record<string, unknown>

const args = process.argv.slice(2)
const [specPath, outPath] = args
if (!specPath || !outPath) {
  process.stderr.write('usage: corpus-excerpt <spec> <out.json> [--schema N] [--path P] [--example E]\n')
  process.exit(1)
}
const pick = (flag: string): string[] =>
  args.flatMap((a, i) => (a === flag && args[i + 1] !== undefined ? [args[i + 1] as string] : []))

const spec = parseSpecText(readFileSync(specPath, 'utf8')) as Json
const components = (spec.components ?? {}) as Record<string, Json>

const out: Json = {
  openapi: spec.openapi,
  info: spec.info,
  ...(spec.servers ? { servers: spec.servers } : {}),
  paths: {},
  components: {},
}
const outComponents = out.components as Record<string, Json>
const outPaths = out.paths as Json

const queue: unknown[] = []
const seen = new Set<string>()

function take(section: string, name: string): void {
  const key = `${section}/${name}`
  if (seen.has(key)) return
  const node = components[section]?.[name]
  if (node === undefined) return
  seen.add(key)
  ;(outComponents[section] ??= {})[name] = node
  queue.push(node)
}

for (const s of pick('--schema')) take('schemas', s)
for (const e of pick('--example')) {
  take('examples', e)
  take('schemas', e)
}
const successOnly = args.includes('--success-only')
for (const p of pick('--path')) {
  const raw = (spec.paths as Json)[p] as Json | undefined
  if (raw === undefined) throw new Error(`no path ${p}`)
  const item: Json = { ...raw }
  if (successOnly) {
    for (const [method, op] of Object.entries(item)) {
      const responses = (op as Json | undefined)?.responses as Json | undefined
      if (!responses) continue
      item[method] = {
        ...(op as Json),
        responses: Object.fromEntries(Object.entries(responses).filter(([code]) => code.startsWith('2'))),
      }
    }
  }
  outPaths[p] = item
  queue.push(item)
}

// Transitive closure over local component refs.
while (queue.length > 0) {
  const node = queue.pop()
  if (Array.isArray(node)) {
    queue.push(...node)
    continue
  }
  if (node === null || typeof node !== 'object') continue
  for (const [k, v] of Object.entries(node as Json)) {
    if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/')) {
      const [, , section, name] = v.split('/')
      if (section && name) take(section, decodeURIComponent(name).replace(/~1/g, '/').replace(/~0/g, '~'))
    } else {
      queue.push(v)
    }
  }
}

writeFileSync(outPath, `${JSON.stringify(out)}\n`)
process.stdout.write(`${outPath}: ${seen.size} components, ${Object.keys(outPaths).length} paths, ${JSON.stringify(out).length} bytes\n`)
