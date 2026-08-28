/**
 * Shared fixture: generate a client for one adapter and write it where it can
 * be IMPORTED and run.
 *
 * The output goes inside the package (`src/tests/.generated/`) rather than into
 * `os.tmpdir()`, deliberately: the emitted `client.ts` imports `axios` / `ky`,
 * and Node resolves those by walking up from the importing file. A temp
 * directory outside the workspace resolves nothing, and the failure reads as a
 * generator bug rather than a test-harness one.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type ClientName } from '../../core/config'
import { generate } from '../../core/generate'

/** Every client that emits the generated endpoint runtime. `pyreon` does not. */
export const ADAPTER_CLIENTS = ['fetch', 'axios', 'ky'] as const satisfies readonly ClientName[]

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '.generated')

/**
 * Directories THIS worker created.
 *
 * Cleanup is scoped to them rather than removing `ROOT`, because vitest runs
 * test FILES in parallel workers that share a filesystem: a blanket
 * `rm -rf .generated` in one file's `afterAll` deleted another file's fixtures
 * mid-run, which surfaced as an order-dependent import failure rather than as
 * anything resembling its cause.
 */
const created = new Set<string>()

/**
 * A spec exercising the shapes the runtime has to get right.
 *
 * Not the bookshelf example: this one deliberately carries a no-content
 * response (204), a path parameter, a query parameter and a mutation, because
 * those are where the three libraries' defaults diverge.
 */
export const SPEC = `
openapi: 3.0.3
info: { title: Adapters, version: '1.0.0' }
servers: [{ url: 'http://127.0.0.1:PORT/v1' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      parameters:
        - { name: q, in: query, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
    post:
      operationId: createBook
      tags: [books]
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Book' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Book' }
  /books/{id}:
    get:
      operationId: getBook
      tags: [books]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Book' }
    delete:
      operationId: deleteBook
      tags: [books]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '204': { description: gone }
components:
  schemas:
    Book:
      type: object
      required: [id, title]
      properties:
        id: { type: string }
        title: { type: string }
        pages: { type: integer }
`

/**
 * Generate one adapter's output and write it to disk.
 *
 * Returns the directory. `port` substitutes into the spec's server URL so the
 * runtime test can point the generated client at a real server — the base URL
 * is baked into `client.ts` as a literal, which is the whole reason it reaches
 * PMTC on the pyreon path, so it cannot be injected afterwards.
 */
export function writeGenerated(client: ClientName, port = 0): string {
  const dir = join(ROOT, `${client}-${port}`)
  rmSync(dir, { recursive: true, force: true })
  created.add(dir)
  const cfg = resolveConfig({
    input: 'x',
    client,
    plugins: ['schemas', 'client', 'mocks'],
  })
  const { files } = generate(SPEC.replace('PORT', String(port)), cfg)
  for (const f of files) {
    const p = join(dir, f.path)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.contents)
  }
  return dir
}

/** Remove only the fixtures this worker created. */
export function cleanGenerated(): void {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
  created.clear()
}
