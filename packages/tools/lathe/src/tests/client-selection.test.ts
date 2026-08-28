/**
 * Selecting the HTTP runtime.
 *
 * The seam is the whole design: every emitter other than `client.ts` reads an
 * endpoint's `.key` / `.query()` / callable shape and nothing else, so the
 * setting must be INVISIBLE to them. These tests pin that — the same spec under
 * four clients produces four `client.ts` files and otherwise byte-identical
 * output.
 */
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /books:
    get: { operationId: listBooks, tags: [b], responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } } } }
    post: { operationId: createBook, tags: [b], responses: { '201': { content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } } } }
components:
  schemas:
    Book:
      type: object
      required: [id]
      properties: { id: { type: string } }
`

const filesFor = (client: 'pyreon' | 'fetch' | 'axios' | 'ky'): Map<string, string> => {
  const cfg = resolveConfig({
    input: 'x',
    client,
    plugins: ['schemas', 'client', 'queries', 'mocks'],
  })
  return new Map(generate(SPEC, cfg).files.map((f) => [f.path, f.contents]))
}

describe('the client setting is invisible to every emitter but client.ts', () => {
  const pyreon = filesFor('pyreon')

  for (const client of ['fetch', 'axios', 'ky'] as const) {
    it(`${client} changes client.ts and mocks.ts, and nothing else`, () => {
      const other = filesFor(client)
      expect([...other.keys()].sort()).toEqual([...pyreon.keys()].sort())
      const differing = [...pyreon.keys()].filter((p) => pyreon.get(p) !== other.get(p))
      // `mocks.ts` differs because `@pyreon/http` ships a `mock()` middleware
      // and the adapters answer through their own seam. Everything the app
      // actually imports — endpoints, queries, keys, the barrel — is identical.
      expect(differing.sort()).toEqual(['client.ts', 'mocks.ts'])
    })
  }

  it('endpoint declarations are byte-identical across all four clients', () => {
    const target = 'endpoints/b.ts'
    const baseline = pyreon.get(target)
    expect(baseline).toBeDefined()
    for (const client of ['fetch', 'axios', 'ky'] as const) {
      expect(filesFor(client).get(target), client).toBe(baseline)
    }
  })
})

describe('client selection is validated', () => {
  it('rejects an unknown client by name', () => {
    expect(() =>
      resolveConfig({ input: 'x', client: 'superagent' as never }),
    ).toThrow(/unknown client `superagent`.*Known: pyreon, fetch, axios, ky/s)
  })

  it('REFUSES multiplatform on a client that cannot reach native', () => {
    // Refused, not silently downgraded. `multiplatform` exists to prove the
    // generated modules lower; emitting them over a transport PMTC has never
    // heard of produces exactly the silent regression to web-only the target
    // was built to catch.
    for (const client of ['fetch', 'axios', 'ky'] as const) {
      expect(() => resolveConfig({ input: 'x', target: 'multiplatform', client })).toThrow(
        /needs `client: 'pyreon'`/,
      )
    }
  })

  it('allows multiplatform on the default client', () => {
    expect(() => resolveConfig({ input: 'x', target: 'multiplatform' })).not.toThrow()
    expect(resolveConfig({ input: 'x' }).client).toBe('pyreon')
  })

  it('an adapter target emits no native module even when one is asked for', () => {
    // `target: 'web'` is the only legal pairing, so this is really a guard
    // against a future path that forgets the refusal above.
    const files = filesFor('axios')
    expect([...files.keys()].filter((p) => p.endsWith('.native.tsx'))).toEqual([])
  })
})

describe('the emitted adapter carries what it needs', () => {
  it('imports the library it was configured with, and only that one', () => {
    expect(filesFor('axios').get('client.ts')).toContain("from 'axios'")
    expect(filesFor('ky').get('client.ts')).toContain("from 'ky'")
    // The fetch adapter is dependency-free — that is the reason it exists.
    const f = filesFor('fetch').get('client.ts') ?? ''
    expect(f).not.toContain("from 'axios'")
    expect(f).not.toContain("from 'ky'")
    // An IMPORT, not any mention: the file's comments name `@pyreon/http`
    // repeatedly, because they explain which of its semantics are being
    // matched and why. A bare `toContain` would forbid saying so.
    expect(f).not.toContain("from '@pyreon/http'")
  })

  it('an adapter client does NOT import @pyreon/http anywhere it is avoidable', () => {
    // The point of choosing axios is not depending on `@pyreon/http`. The
    // schemas still come from `@pyreon/validate`, which is a separate choice.
    for (const client of ['fetch', 'axios', 'ky'] as const) {
      expect(filesFor(client).get('client.ts'), client).not.toContain("from '@pyreon/http'")
      expect(filesFor(client).get('mocks.ts'), client).not.toContain("from '@pyreon/http")
    }
  })
})

describe('emitted imports read like code a person would write', () => {
  it('binds a default export as a default import, not `{ default as x }`', () => {
    // `import { default as axios }` is valid ESM and behaves identically, so
    // this is a readability contract rather than a correctness one — and
    // generated code is read precisely when something already looks wrong.
    expect(filesFor('axios').get('client.ts')).toContain("import axios from 'axios'")
    expect(filesFor('ky').get('client.ts')).toContain("import ky from 'ky'")
    for (const client of ['axios', 'ky'] as const) {
      expect(filesFor(client).get('client.ts'), client).not.toContain('default as')
    }
  })
})
