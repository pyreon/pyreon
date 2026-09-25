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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_PLUGINS, resolveConfig, type ClientName, type PluginName, type ValidatorName } from '../core/config'
import { generate } from '../core/generate'
import { emitSchemaAgreement } from '../emit/schema'
import { banner } from '../emit/writer'

const HERE = dirname(fileURLToPath(import.meta.url))
const TC_ROOT = join(HERE, '.generated', 'typecheck')
const CORE = join(HERE, '..', '..', '..', '..', 'core', 'core', 'src', 'index.ts')

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
      responses:
        '201': { content: { application/json: { schema: { $ref: '#/components/schemas/Node' } } } }
        # A typed error on a MUTATION: its hook's options carry the error type.
        '4XX': { content: { application/json: { schema: { type: object, properties: { field: { type: string } } } } } }
  /session/ping:
    get:
      # A CONTENT-LESS read: a 200 with only a description. Petstore 3's
      # \`logoutUser\` is this shape, and it emitted \`useQuery<void>\` over an
      # endpoint typed \`unknown\` -- the one hook in the file that did not compile.
      operationId: ping
      tags: [n]
      responses: { '200': { description: ok } }
  /nodes/{id}:
    get:
      operationId: getNode
      tags: [n]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Node' } } } }
        '404': { content: { application/json: { schema: { $ref: '#/components/schemas/Problem' } } } }
        default: { content: { application/json: { schema: { type: object, required: [code], properties: { code: { type: integer } } } } } }
    delete:
      operationId: deleteNode
      tags: [n]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: X-Dangerous, in: header, required: true, schema: { type: boolean } }
        - { name: X-Trace, in: header, schema: { type: string } }
        - { name: session, in: cookie, schema: { type: string } }
      responses: { '204': { description: gone } }
  /charges:
    post:
      operationId: createCharge
      tags: [n]
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              required: [amount]
              properties:
                amount: { type: integer, multipleOf: 1 }
                metadata: { type: object, additionalProperties: { type: string } }
                expand: { type: array, items: { type: string }, uniqueItems: true }
            encoding:
              metadata: { style: deepObject, explode: true }
              expand: { style: deepObject, explode: true }
      responses: { '2XX': { content: { application/json; charset=utf-8: { schema: { $ref: '#/components/schemas/Charge' } } } } }
  /files:
    post:
      operationId: uploadFile
      tags: [n]
      requestBody:
        content:
          multipart/form-data:
            schema: { $ref: '#/components/schemas/Upload' }
      responses: { '201': { content: { application/json: { schema: { $ref: '#/components/schemas/Meta' } } } } }
  /blobs:
    put:
      operationId: putBlob
      tags: [n]
      requestBody: { content: { application/octet-stream: { schema: { type: string, format: binary } } } }
      responses: { '204': { description: stored } }
components:
  schemas:
    Labels:
      type: object
      properties: { id: { type: string } }
      additionalProperties: { type: integer }
    Upload:
      type: object
      required: [file]
      properties:
        file: { type: string, format: binary }
        purpose: { type: string, enum: [a, b] }
    Charge:
      type: object
      required: [id, amount, status, kind]
      properties:
        id: { type: string }
        amount: { type: number, multipleOf: 0.01, exclusiveMinimum: 0 }
        status: { type: integer, enum: [1, 2, 3] }
        kind: { const: charge }
        refunded_by: { $ref: '#/components/schemas/NullableMeta' }
        tags: { type: array, items: { type: string, maxLength: 8 }, minItems: 1 }
    NullableMeta:
      type: [object, 'null']
      required: [at]
      properties:
        at: { type: string, format: date-time }
    Shape:
      oneOf: [{ $ref: '#/components/schemas/Circle' }, { $ref: '#/components/schemas/Square' }]
      discriminator: { propertyName: shape_type }
    Circle:
      type: object
      required: [shape_type, r]
      properties: { shape_type: { const: circle }, r: { type: number } }
    Square:
      type: object
      required: [shape_type, side]
      properties: { shape_type: { type: string, enum: [square] }, side: { type: number } }
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
    Problem:
      type: object
      required: [message]
      properties:
        message: { type: string }
`

/**
 * A CONSUMER of the typed errors, compiled with the output: `matched` must
 * narrow `body` to each declared schema through a hook's `error()` and a
 * direct call's rejection, for every client. The emitted types alone could
 * compile while this -- the reason they exist -- did not.
 */
const ERROR_USAGE = `
import type { EndpointError } from './client'
import { createNode, getNode } from './endpoints/n'
import { useCreateNode, useGetNode } from './queries/n'

export function describe(err: EndpointError<typeof getNode> | null): string {
  if (err?.matched === '404') return err.body.message
  if (err?.matched === 'default') return String(err.body.code)
  return err?.message ?? ''
}

export function fromHook(): string {
  return describe(useGetNode(() => ({ params: { id: '1' } })).error())
}

export function fromMutation(): string | undefined {
  const err = useCreateNode().error()
  return err?.matched === '4XX' ? err.body.field : undefined
}

export function fromCall(): Promise<string | undefined> {
  return getNode({ params: { id: '1' } }).then(
    (n) => n.id,
    (e: EndpointError<typeof getNode>) => describe(e),
  )
}

export const unused = createNode
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
function diagnose(
  client: ClientName,
  validator: ValidatorName,
  spec: string = SPEC,
  plugins: PluginName[] = ['schemas', 'client', 'queries', 'mocks', 'faker'],
  label = `${client}-${validator}`,
): string[] {
  const cfg = resolveConfig({
    input: 'x',
    client,
    validator,
    // `faker` is in the matrix because its factories are the one emitter
    // whose output is typed against ANOTHER emitter's output -- the model types
    // from `schemas.ts` -- so a mismatch between the two shows up here and
    // nowhere else.
    plugins,
  })
  const result = generate(spec, cfg)
  // `types.ts` is a SECOND rendering of every model (plain TS, no runtime);
  // it is typechecked too, standalone, because nothing imports it.
  const typesFile = plugins.includes('types')
    ? undefined
    : generate(spec, resolveConfig({ input: 'x', plugins: ['types'] })).files.find((f) => f.path === 'types.ts')
  const files = [...result.files, ...(typesFile ? [typesFile] : [])].filter((f) => /\.tsx?$/.test(f.path))
  // The interfaces in `schemas.ts` are written out, and the schema consts are
  // cast to them -- so nothing in the OUTPUT relates the two. This file does,
  // in both directions, for every model.
  if (plugins.includes('schemas')) {
    files.push(emitSchemaAgreement(result.doc, validator).build(banner(result.doc.title, result.doc.version)))
  }
  if (spec === SPEC && plugins.includes('queries')) files.push({ path: 'error-usage.ts', contents: ERROR_USAGE })
  const root = join(TC_ROOT, label)
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
    jsx: ts.JsxEmit.Preserve,
    jsxImportSource: '@pyreon/core',
    // `components.tsx` and the Atlas wrapper import `@pyreon/core`, which lathe
    // does not depend on -- mapped to the workspace source.
    paths: { '@pyreon/core': [CORE], '@pyreon/core/*': [join(dirname(CORE), '*')] },
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

/**
 * Shapes real specs are full of that lathe's own fixtures were not -- each one
 * produced output that did not compile, found by running every plugin over
 * GitHub's and Stripe's specs (`scripts/typecheck-real-specs.ts`):
 *
 * - `Shape`: a union whose first member is an inline object. `types.ts` emitted
 *   `export interface Shape { … } | { … }`.
 * - `Pet.labels` / `Pet.shape`: an inline object as an array item and as a
 *   union branch. The faker arrow returned a block, not an object.
 * - `Pets` / `Mark` / `Either`: models that are not objects. The faker factory
 *   declared `overrides: Partial<Pets> = {}`.
 * - `Customer` <-> `Source` <-> `Card`: a cycle closed THROUGH a nullable union
 *   (Stripe's expandable fields). Inferring through it ended in
 *   `Property 'nullable' does not exist on type 'UnionSchema<…>'`.
 * - `ListEnvelope`: an inline response carrying a string enum. The hook's
 *   declared data type said `'list'` where `@pyreon/validate` infers `string`.
 * - `Blank` / `Dict`: an object with no fields, and a dictionary. zod infers
 *   `Record<string, never>` for `z.object({})`, and the faker factory spread
 *   `Partial<Dict>` into a `Dict`, which does not typecheck.
 * - `postCustomer` / `deleteCustomer` / `uploadFile`: Stripe-shaped FORM and
 *   multipart bodies -- a model ref (an `interface`, with no implicit index
 *   signature), a free-form value (`unknown`), a dictionary-or-empty-string
 *   union, and an empty closed object. None of those fit
 *   `Record<string, FormValue>` as rendered; Stripe's hooks carried 250 errors.
 * - `Animal` / `getAnimal`: a discriminated union over NAMED models, as a
 *   model and as an inline response (GitHub's `GET /user`). A model const is
 *   typed `Schema<Cat>`, which the discriminated-union signature rejects.
 */
const SHAPES = `
openapi: 3.0.3
info: { title: Shapes, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /pets:
    get:
      operationId: listPets
      tags: [p]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Pets' } } } } }
  /customers:
    get:
      operationId: listCustomers
      tags: [c]
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                required: [object, data]
                properties:
                  object: { type: string, enum: [list] }
                  data: { type: array, items: { $ref: '#/components/schemas/Customer' } }
  /animals:
    get:
      operationId: getAnimal
      tags: [a]
      responses:
        '200':
          content:
            application/json:
              schema:
                oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ]
                discriminator: { propertyName: kind }
  /zoo:
    get:
      operationId: getZoo
      tags: [a]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Zoo' } } } } }
  /v1/customers/{customer}:
    post:
      operationId: postCustomer
      tags: [c]
      parameters: [{ name: customer, in: path, required: true, schema: { type: string } }]
      requestBody:
        content:
          application/x-www-form-urlencoded:
            encoding: { address: { style: deepObject, explode: true }, metadata: { style: deepObject, explode: true } }
            schema:
              type: object
              properties:
                address: { $ref: '#/components/schemas/Address' }
                metadata:
                  anyOf:
                    - { type: object, additionalProperties: { type: string } }
                    - { type: string, enum: [''] }
                expand: { type: array, items: { type: string } }
                invoice_settings: { type: object, properties: { custom: {}, footer: { type: string } } }
                anything: {}
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Customer' } } } } }
    delete:
      operationId: deleteCustomer
      tags: [c]
      parameters: [{ name: customer, in: path, required: true, schema: { type: string } }]
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema: { type: object, properties: {}, additionalProperties: false }
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Customer' } } } } }
  /v1/files:
    post:
      operationId: uploadFile
      tags: [c]
      requestBody:
        content:
          multipart/form-data:
            schema: { $ref: '#/components/schemas/Upload' }
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Customer' } } } } }
  /shapes:
    get:
      operationId: getShape
      tags: [s]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Shape' } } } } }
components:
  schemas:
    Shape:
      oneOf:
        - { type: object, required: [r], properties: { r: { type: number } } }
        - { type: object, required: [w], properties: { w: { type: number } } }
    Pet:
      type: object
      required: [id, labels, shape]
      properties:
        id: { type: integer }
        labels: { type: array, items: { type: object, required: [key], properties: { key: { type: string } } } }
        shape:
          oneOf:
            - { type: object, required: [r], properties: { r: { type: number } } }
            - { type: object, required: [w], properties: { w: { type: number } } }
    Pets: { type: array, items: { $ref: '#/components/schemas/Pet' } }
    Mark: { type: string, enum: [X, O] }
    Address: { type: object, properties: { city: { type: string }, line1: { type: string }, meta: {} } }
    Upload: { type: object, required: [file], properties: { file: { type: string, format: binary }, purpose: { type: string }, address: { $ref: '#/components/schemas/Address' } } }
    Blank: { type: object, properties: {} }
    Dict: { type: object, additionalProperties: { type: array, items: { type: string } } }
    Holder: { type: object, required: [blank, dict], properties: { blank: { $ref: '#/components/schemas/Blank' }, dict: { $ref: '#/components/schemas/Dict' } } }
    Cat: { type: object, required: [kind, meows], properties: { kind: { type: string, enum: [cat] }, meows: { type: boolean } } }
    Dog: { type: object, required: [kind], properties: { kind: { type: string, enum: [dog] }, barks: { type: boolean } } }
    Animal:
      oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ]
      discriminator: { propertyName: kind }
    Zoo:
      type: object
      required: [star]
      properties:
        star:
          oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ]
          discriminator: { propertyName: kind }
        runnerUp:
          oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ]
          discriminator: { propertyName: kind }
    Either: { oneOf: [ { type: string }, { $ref: '#/components/schemas/Pet' } ] }
    Customer:
      type: object
      properties:
        default_source: { nullable: true, anyOf: [ { type: string }, { $ref: '#/components/schemas/Source' } ] }
        sources: { type: array, items: { anyOf: [ { $ref: '#/components/schemas/Source' }, { $ref: '#/components/schemas/Card' } ] } }
    Source:
      type: object
      properties:
        customer: { anyOf: [ { type: string }, { $ref: '#/components/schemas/Customer' } ] }
    Card:
      type: object
      properties:
        customer: { anyOf: [ { type: string }, { $ref: '#/components/schemas/Customer' } ] }
`

describe('every plugin typechecks over the shapes that broke on real specs', () => {
  for (const validator of VALIDATORS) {
    it(`validator=${validator}`, () => {
      const errors = diagnose('pyreon', validator, SHAPES, [...ALL_PLUGINS], `shapes-${validator}`)
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
  // The form / multipart value type comes from the ADAPTER runtime here, not
  // `@pyreon/http` -- the import has to follow the client.
  it('client=fetch (schemas, client, queries)', () => {
    const errors = diagnose('fetch', 'pyreon', SHAPES, ['schemas', 'client', 'queries'], 'shapes-fetch')
    expect(errors, errors.join('\n')).toEqual([])
  })
})

/**
 * A REAL spec, not one written to exercise the emitter.
 *
 * Petstore 3 is the first spec nearly everyone points a generator at, and its
 * output did not compile: `logoutUser` is a GET whose 200 carries no content.
 * A hand-written fixture only contains the shapes its author thought of --
 * which is exactly why this one is here verbatim (swagger-api/swagger-petstore,
 * Apache-2.0).
 */
const PETSTORE3 = readFileSync(join(HERE, 'fixtures', 'petstore3.json'), 'utf8')

describe('Petstore 3 output typechecks under strict TypeScript', () => {
  for (const validator of VALIDATORS) {
    it(`client=pyreon validator=${validator}`, () => {
      const errors = diagnose('pyreon', validator, PETSTORE3, undefined, `petstore3-${validator}`)
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})

afterAll(() => {
  rmSync(TC_ROOT, { recursive: true, force: true })
})
