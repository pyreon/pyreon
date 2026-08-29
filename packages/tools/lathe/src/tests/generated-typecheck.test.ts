/**
 * The generated output is TYPECHECKED, for every client × validator pair.
 *
 * The pyreon/pyreon combination has always had this coverage, indirectly:
 * `examples/lathe-bookshelf` commits its generated client and the repo
 * typechecks every workspace. No other combination had any — the runtime tests
 * EXECUTE the output through bun, which transpiles and does not typecheck, so a
 * generated file could carry a type error and every test would still pass.
 *
 * That is not a hypothetical gap for a code generator. The shapes that break
 * are exactly the ones nobody writes by hand: a `z.infer` over a `z.lazy`
 * cycle, an `Infer` helper imported from a library that does not export one, an
 * optional field under `exactOptionalPropertyTypes`.
 *
 * So this runs the real TypeScript compiler over the emitted files, in memory,
 * against the same strict options the repo uses.
 */
import ts from 'typescript'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type ClientName, type ValidatorName } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const TC_ROOT = join(HERE, '.generated', 'typecheck')

/**
 * A spec carrying the shapes most likely to produce un-typecheckable output.
 *
 * A `$ref` CYCLE is the sharp one: it emits `lazy(() => X)`, and inferring a
 * type through that is where a schema library's inference most often gives up.
 */
const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /nodes:
    get:
      operationId: listNodes
      tags: [n]
      parameters:
        - { name: depth, in: query, schema: { type: integer } }
      responses: { '200': { content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Node' } } } } } }
    post:
      operationId: createNode
      tags: [n]
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/Node' } } } }
      responses: { '201': { content: { application/json: { schema: { $ref: '#/components/schemas/Node' } } } } }
  /nodes/{id}:
    get:
      operationId: getNode
      tags: [n]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Node' } } } } }
    delete:
      operationId: deleteNode
      tags: [n]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '204': { description: gone } }
components:
  schemas:
    Node:
      type: object
      required: [id, kind, children]
      properties:
        id: { type: string, format: uuid }
        kind: { type: string, enum: [leaf, branch] }
        label: { type: string, minLength: 1 }
        weight: { type: number }
        tags: { type: array, items: { type: string } }
        parent: { $ref: '#/components/schemas/Node' }
        children: { type: array, items: { $ref: '#/components/schemas/Node' } }
        meta: { $ref: '#/components/schemas/Meta' }
    Meta:
      type: object
      required: [at]
      properties:
        at: { type: string, format: date-time }
        by: { $ref: '#/components/schemas/Node' }
`

/**
 * Write the emitted files, then compile them with the real TypeScript compiler.
 *
 * On DISK, inside the package, rather than through an in-memory host: the
 * generated modules import each other extensionlessly (`'../client'`) and
 * import `zod` / `axios` / `ky` / `@pyreon/*` by bare specifier, so resolution
 * is most of what is being tested. A virtual host would need its own resolver,
 * and a bug in that resolver is indistinguishable from a bug in the output.
 */
function diagnose(client: ClientName, validator: ValidatorName): string[] {
  const cfg = resolveConfig({
    input: 'x',
    client,
    validator,
    // `faker` is in the matrix because its factories are the one emitter
    // whose output is typed against ANOTHER emitter's output -- the model types
    // from `schemas.ts` -- so a mismatch between the two shows up here and
    // nowhere else.
    plugins: ['schemas', 'client', 'queries', 'mocks', 'faker'],
  })
  const files = generate(SPEC, cfg).files.filter((f) => f.path.endsWith('.ts'))
  const root = join(TC_ROOT, `${client}-${validator}`)
  rmSync(root, { recursive: true, force: true })
  for (const f of files) {
    const abs = join(root, f.path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.contents)
  }

  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    // `bun` first: the workspace packages expose their source under that
    // condition, which is how everything else in this repo resolves them.
    customConditions: ['bun'],
  }
  const entries = files.map((f) => join(root, f.path))
  const program = ts.createProgram(entries, options)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName.startsWith(root) === true)
    .map(
      (d) =>
        `${d.file?.fileName.slice(root.length + 1) ?? '?'}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
    )
}

const CLIENTS = ['pyreon', 'fetch', 'axios', 'ky'] as const
const VALIDATORS = ['pyreon', 'zod'] as const

describe('generated output typechecks under strict TypeScript', () => {
  for (const client of CLIENTS) {
    for (const validator of VALIDATORS) {
      it(`client=${client} validator=${validator}`, () => {
        const errors = diagnose(client, validator)
        expect(errors, errors.join('\n')).toEqual([])
      })
    }
  }
})

afterAll(() => {
  rmSync(TC_ROOT, { recursive: true, force: true })
})
