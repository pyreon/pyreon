/**
 * A discriminated union whose tag cannot be proven must not throw at IMPORT.
 *
 * `s.discriminatedUnion` (and zod's) build the tag -> member map when the
 * schema is CONSTRUCTED, and throw when a member's tag field is not a literal
 * or enum. The generated `schemas.ts` constructs every model at module scope,
 * so one such union took every model in the file down with it -- the first
 * thing a user of a 3.1 spec with `const` tags saw was a crash on import.
 *
 * This EXECUTES the output for both validators, because the failure only
 * exists at module evaluation: the emitted text reads perfectly.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'discriminator')

const spec = (a: string, b: string): string => `
openapi: 3.1.0
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths: {}
components:
  schemas:
    Shape:
      oneOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }]
      discriminator: { propertyName: type }
    A:
      type: object
${a}
    B:
      type: object
${b}
`

const CASES: Record<string, string> = {
  // 3.1 `const` tags -- the audited repro.
  'const tags': spec(
    '      properties: { type: { const: a }, a: { type: string } }',
    '      properties: { type: { const: b }, b: { type: integer } }',
  ),
  // An enum tag that is NOT in `required` becomes `.optional()`.
  'optional enum tags': spec(
    '      properties: { type: { type: string, enum: [a] } }',
    '      properties: { type: { type: string, enum: [b] } }',
  ),
  // Two members claiming the same value -- the second would be unreachable.
  'duplicate tag values': spec(
    '      required: [type]\n      properties: { type: { type: string, enum: [a] } }',
    '      required: [type]\n      properties: { type: { type: string, enum: [a] } }',
  ),
  'a member without the tag field': spec(
    '      required: [type]\n      properties: { type: { type: string, enum: [a] } }',
    '      properties: { other: { type: string } }',
  ),
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('an unprovable discriminator falls back to a plain union', () => {
  for (const [label, src] of Object.entries(CASES)) {
    for (const validator of ['pyreon', 'zod'] as const) {
      it(`${label} (${validator}) — imports cleanly, validates, and says why`, async () => {
        const out = generate(src, resolveConfig({ input: 'x', validator, plugins: ['schemas'] }))
        const file = out.files.find((f) => f.path === 'schemas.ts')
        // Imported FIRST: the load-bearing failure is the throw at module
        // evaluation, and asserting the text first would hide it behind a
        // string mismatch.
        const dir = join(ROOT, `${label.replace(/\W+/g, '-')}-${validator}`)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'schemas.ts'), file?.contents ?? '')
        const mod = (await import(join(dir, 'schemas.ts'))) as Record<
          string,
          { '~standard': { validate: (v: unknown) => { issues?: readonly unknown[] } } }
        >
        expect(mod.Shape?.['~standard'].validate({ type: 'a' }).issues ?? []).toEqual([])
        expect(file?.contents).not.toMatch(/discriminatedUnion/)
        expect(
          out.doc.notes.some((n) => n.message.includes('cannot be proven from the members')),
        ).toBe(true)
      }, 60_000)
    }
  }

  it('keeps the discriminated union when every tag IS provable', () => {
    const src = spec(
      '      required: [type]\n      properties: { type: { type: string, enum: [a] } }',
      '      required: [type]\n      properties: { type: { type: string, enum: [b] } }',
    )
    const out = generate(src, resolveConfig({ input: 'x', plugins: ['schemas'] }))
    expect(out.files.find((f) => f.path === 'schemas.ts')?.contents).toContain(
      "s.discriminatedUnion('type'",
    )
  })
})
