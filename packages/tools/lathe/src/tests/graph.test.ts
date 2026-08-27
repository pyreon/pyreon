/**
 * Declaration ORDER is a correctness property of generated schemas.
 *
 * They are `const` declarations and `const` is not hoisted, so a model emitted
 * before one it references throws `ReferenceError: Cannot access 'X' before
 * initialization` when the module is imported. These specs EVALUATE the emitted
 * source rather than inspecting it, because the string looks perfectly fine
 * either way -- which is exactly how the bug shipped.
 */
import { s } from '@pyreon/validate'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { topoSortModels, reachableModels, edgeKey } from '../core/graph'
import { loadOpenApi } from '../input/openapi'

function spec(components: string, response = 'Alpha'): string {
  return `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /a:
    get:
      operationId: getA
      tags: [a]
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/${response}' } } }
components:
  schemas:
${components}
`
}

const FORWARD_REF = spec(`    Alpha:
      type: object
      required: [z]
      properties:
        z: { $ref: '#/components/schemas/Zulu' }
    Zulu:
      type: object
      required: [n]
      properties: { n: { type: string } }`)

const CYCLE = spec(`    Node:
      type: object
      required: [name]
      properties:
        name: { type: string }
        child: { $ref: '#/components/schemas/Node' }`, 'Node')

const CHAIN = spec(`    Order:
      type: object
      required: [id, customer]
      properties:
        id: { type: string }
        customer: { $ref: '#/components/schemas/Customer' }
    Customer:
      type: object
      required: [address]
      properties:
        address: { $ref: '#/components/schemas/Address' }
    Address:
      type: object
      required: [city]
      properties: { city: { type: string } }`, 'Order')

const web = resolveConfig({ input: 'x' })
const native = resolveConfig({ input: 'x', target: 'multiplatform' })

/** Evaluate an emitted schema module and hand back its exports. */
function evaluate(source: string): Record<string, unknown> {
  const body = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export type .*$/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/:\s*[A-Za-z<>[\]{}|\s,'"]+\s*=/g, ' =')
  const names = [...source.matchAll(/^export const (\w+)/gm)].map((m) => m[1] as string)
  // eslint-disable-next-line no-new-func
  const fn = new Function('s', `${body}\nreturn { ${names.join(', ')} }`)
  return fn(s) as Record<string, unknown>
}

function file(r: ReturnType<typeof generate>, path: string): string {
  const f = r.files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}`)
  return f.contents
}

describe('model dependency graph', () => {
  it('orders a forward reference so the module can be EVALUATED', () => {
    // Alphabetically `Alpha` comes first and references `Zulu` -- the exact
    // shape that threw at import time.
    const src = file(generate(FORWARD_REF, web), 'schemas.ts')
    expect(src.indexOf('const Zulu')).toBeLessThan(src.indexOf('const Alpha'))
    expect(() => evaluate(src)).not.toThrow()
  })

  it('breaks a `$ref` CYCLE with s.lazy rather than emitting an unorderable file', () => {
    // A self-referencing node cannot be ordered at all; `s.lazy` defers the
    // read to first use, which is what a cycle needs.
    const src = file(generate(CYCLE, web), 'schemas.ts')
    expect(src).toContain('s.lazy(() => Node)')
    const exports = evaluate(src) as {
      Node: { parse(v: unknown): { ok: boolean; value?: unknown } }
    }
    // Parses a RECURSIVE value, which is the whole point of deferring the edge.
    const flat = exports.Node.parse({ name: 'root' })
    expect(flat.ok).toBe(true)
    const nested = exports.Node.parse({ name: 'root', child: { name: 'leaf' } })
    expect(nested.ok).toBe(true)
    expect(nested.value).toEqual({ name: 'root', child: { name: 'leaf' } })
  })

  it('does NOT defer a reference that is merely forward', () => {
    // `s.lazy` only where a cycle demands it -- otherwise the common output
    // changes shape for no reason and stops being the plain literal PMTC wants.
    expect(file(generate(FORWARD_REF, web), 'schemas.ts')).not.toContain('s.lazy')
  })

  it('inlines the TRANSITIVE closure into a native module', () => {
    // A native module imports nothing. Inlining `Order` while leaving out the
    // `Customer` it names emits a module that does not typecheck.
    const src = file(generate(CHAIN, native), 'a.native.tsx')
    expect(src).toContain('export const Address')
    expect(src).toContain('export const Customer')
    expect(src).toContain('export const Order')
    // And in dependency order, for the same `const` reason.
    expect(src.indexOf('const Address')).toBeLessThan(src.indexOf('const Customer'))
    expect(src.indexOf('const Customer')).toBeLessThan(src.indexOf('const Order'))
  })

  it('topoSortModels reports back edges and stays deterministic', () => {
    const { doc } = loadOpenApi(CYCLE)
    const a = topoSortModels(doc)
    expect(a.hasCycle).toBe(true)
    expect(a.backEdges.has(edgeKey('Node', 'Node'))).toBe(true)
    // Same input, same order -- an unstable sort makes every regeneration a diff.
    expect(topoSortModels(doc).order).toEqual(a.order)
  })

  it('reachableModels follows the whole chain', () => {
    const { doc } = loadOpenApi(CHAIN)
    expect([...reachableModels(doc, ['Order'])].sort()).toEqual(['Address', 'Customer', 'Order'])
    expect([...reachableModels(doc, ['Address'])]).toEqual(['Address'])
  })

  it('survives a deep chain without blowing the stack', () => {
    // A spec is user input; a recursive sort would overflow on a long chain.
    const models: string[] = []
    for (let i = 0; i < 2000; i++) {
      const next = i + 1 < 2000 ? `        next: { $ref: '#/components/schemas/M${i + 1}' }` : ''
      models.push(`    M${i}:\n      type: object\n      required: [id]\n      properties:\n        id: { type: string }\n${next}`)
    }
    const { doc } = loadOpenApi(spec(models.join('\n'), 'M0'))
    const { order, hasCycle } = topoSortModels(doc)
    expect(hasCycle).toBe(false)
    expect(order).toHaveLength(2000)
    // Deepest dependency first.
    expect(order[0]).toBe('M1999')
  })
})
