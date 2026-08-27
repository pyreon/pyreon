/**
 * Shapes a REAL spec produces that a spec you wrote yourself does not.
 *
 * Every case here came from running GitHub's OpenAPI document (12.9 MB, 973
 * models, 1222 operations) through the generator and TYPECHECKING the output.
 * All four emitted code that read perfectly and did not compile -- the reason a
 * hand-written fixture cannot substitute for a hostile one is that you do not
 * think to write the shapes that break you.
 */
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

function spec(components: string, extra = ''): string {
  return `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /x:
    get:
      operationId: getX
      tags: [x]
${extra}
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Target' } } }
components:
  schemas:
${components}
`
}

const web = resolveConfig({ input: 'x', plugins: ['schemas', 'client', 'queries'] })
const file = (src: string, path: string): string => {
  const f = generate(src, web).files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}`)
  return f.contents
}

describe('shapes only a real spec produces', () => {
  it('collapses a ONE-member oneOf instead of emitting an invalid union', () => {
    // `s.union` requires at least two members, and a one-member union is just
    // that member. GitHub has several.
    const src = spec(`    Target:
      oneOf:
        - { $ref: '#/components/schemas/Only' }
    Only:
      type: object
      required: [a]
      properties: { a: { type: string } }`)
    // `Target` collapses to the member itself, so the alias is `= Only` and
    // nothing emits a one-member union anywhere.
    expect(file(src, 'schemas.ts')).toContain('export const Target = Only')
    for (const f of generate(src, web).files) expect(f.contents).not.toContain('s.union([Only])')
  })

  it('degrades a discriminator whose members are not all objects', () => {
    // `GET /repos/{}/contents/{}` discriminates over a set including an ARRAY
    // branch. `s.discriminatedUnion` takes object schemas only.
    const src = spec(`    Target:
      oneOf:
        - { $ref: '#/components/schemas/Dir' }
        - { $ref: '#/components/schemas/File_' }
      discriminator: { propertyName: type }
    Dir:
      type: array
      items: { type: string }
    File_:
      type: object
      required: [type]
      properties: { type: { type: string } }`)
    const r = generate(src, web)
    // The union is the MODEL's shape, so it lives in `schemas.ts`.
    const out = r.files.find((f) => f.path === 'schemas.ts')?.contents ?? ''
    expect(out).not.toContain('s.discriminatedUnion')
    expect(out).toContain('s.union(')
    // Reported, not silently downgraded.
    expect(r.doc.notes.some((n) => n.message.includes('non-object member'))).toBe(true)
  })

  it('keeps a discriminated union when every member IS an object', () => {
    // The degradation must not fire on the shape it exists to preserve.
    const src = spec(`    Target:
      oneOf:
        - { $ref: '#/components/schemas/A_' }
        - { $ref: '#/components/schemas/B_' }
      discriminator: { propertyName: kind }
    A_:
      type: object
      required: [kind]
      properties: { kind: { type: string } }
    B_:
      type: object
      required: [kind]
      properties: { kind: { type: string } }`)
    expect(file(src, 'schemas.ts')).toContain("s.discriminatedUnion('kind'")
  })

  it('imports a model a PARAMETER references', () => {
    // A parameter's schema can be a `$ref` too. Collecting only the response
    // and body left the name used in the args type and never imported, so the
    // module did not compile -- GitHub does this heavily (`AlertNumber`).
    const src = spec(`    Target:
      type: object
      required: [a]
      properties: { a: { type: string } }
    AlertNumber:
      type: object
      required: [n]
      properties: { n: { type: number } }`,
      `      parameters:
        - name: alert
          in: query
          schema: { $ref: '#/components/schemas/AlertNumber' }`)
    const out = file(src, 'queries/x.ts')
    expect(out).toContain('AlertNumber')
    expect(out).toMatch(/import type \{[^}]*AlertNumber[^}]*\} from '\.\.\/schemas'/)
  })

  it('types an empty oneOf as unknown and says so', () => {
    const src = spec(`    Target:
      oneOf: []`)
    const r = generate(src, web)
    for (const f of r.files) expect(f.contents).not.toContain('s.union([])')
    expect(r.doc.notes.some((n) => n.message.includes('empty oneOf'))).toBe(true)
  })
})
