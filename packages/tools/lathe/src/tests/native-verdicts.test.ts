/**
 * The native verdict is HONEST (audit G1/G2/G4/G5/G6).
 *
 *  - G1: a warning is classified by what it SAYS happened, so a verbatim
 *    reproduction is fatal — only `does NOT compile` used to be.
 *  - G2: a dropped field is `partial`, per declaration, not `lowers`.
 *  - G4: identical warnings give identical verdicts on both targets.
 *  - G5: non-object models are inlined, so an array model no longer reaches
 *    PMTC as a verbatim `s.array(...)` / `zodSchema(z.array(...))`.
 *  - G6: the schema binding no longer shares its type's name, which Swift and
 *    Kotlin (one namespace) rejected as a redeclaration.
 *  - a real compile, when a toolchain is present, outranks every heuristic.
 */
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  transform,
  validateKotlin,
  validateSwiftWithStubs,
} from '@pyreon/native-compiler'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { classifyWarning, verifyNative, worstVerdict } from '../verify/lower'

const file = { path: 'x.native.tsx', contents: 'const a = s.object({})\nuseQuery' }
const fake = (warnings: string[], code = 'PyreonZodSchema_a PyreonQuery<') => () => ({ code, warnings })

describe('warning classes', () => {
  it('classify by what PMTC says happened', () => {
    expect(classifyWarning('`zodSchema` declaration `Pets`: … is reproduced VERBATIM — the native build then fails on a symbol')).toBe('fatal')
    expect(classifyWarning('Declaration q: useQuery without a response type … which does NOT compile')).toBe('fatal')
    expect(classifyWarning('null declaration `Pet`: field `category` has unsupported shape — dropping.')).toBe('dropped')
    expect(classifyWarning('null declaration `Status`: no recognized fields. Falling back to silent-drop.')).toBe('unlowered')
    expect(classifyWarning('something informational')).toBe('info')
  })

  it('a verbatim reproduction is broken, not lowers (G1)', () => {
    const r = verifyNative([file], fake(['`zodSchema` declaration `Pets`: the schema argument is not an inline literal, so … reproduced VERBATIM']))
    expect(r.files.map((f) => f.verdict)).toEqual(['broken', 'broken'])
    expect(r.files[0]?.declarations).toEqual([expect.objectContaining({ name: 'Pets', verdict: 'broken' })])
  })

  it('a dropped field is partial, named per declaration (G2)', () => {
    const r = verifyNative([file], fake(['null declaration `Pet`: field `tags` is z.array() with an unsupported inner type … Dropping field.']))
    expect(r.files.map((f) => f.verdict)).toEqual(['partial', 'partial'])
    expect(r.files[0]?.declarations[0]).toMatchObject({ name: 'Pet', verdict: 'partial' })
    expect(worstVerdict(r)).toBe('partial')
  })

  it('identical warnings give identical verdicts on both targets (G4)', () => {
    const r = verifyNative([file], fake(['null declaration `Status`: no recognized fields. Falling back to silent-drop.']))
    expect(new Set(r.files.map((f) => f.verdict)).size).toBe(1)
  })

  it('a failed compile outranks the heuristics; a skipped one is reported as such', () => {
    const failing = () => ({ ok: false, error: 'Input.swift:1:1: error: invalid redeclaration of \'Pet\'' })
    const skipped = () => ({ ok: true, skipped: true, skipReason: 'kotlinc not found' })
    const r = verifyNative([file], fake([]), { swift: failing, kotlin: skipped })
    expect(r.files.find((f) => f.target === 'swift')).toMatchObject({ verdict: 'broken', compiled: { ok: false, errors: ["invalid redeclaration of 'Pet'"] } })
    expect(r.files.find((f) => f.target === 'kotlin')).toMatchObject({ verdict: 'lowers', compiled: { skipped: 'kotlinc not found' } })
  })
})

const PETSTORE = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1' },
  servers: [{ url: 'https://petstore.test/v1' }],
  paths: {
    '/pets': { get: { operationId: 'listPets', tags: ['pets'], responses: { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pets' } } } } } } },
    '/pets/{petId}': { get: { operationId: 'showPetById', tags: ['pets'], parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
  },
  components: {
    schemas: {
      Pet: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer' }, name: { type: 'string' }, tag: { type: 'string' } } },
      // An ARRAY model — the OAI petstore's own shape (G5).
      Pets: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
    },
  },
})

describe('the OAI petstore shape, through the real compiler', () => {
  for (const validator of ['pyreon', 'zod'] as const) {
    const mod = generate(PETSTORE, resolveConfig({ input: 'x', target: 'multiplatform', validator })).files.find(
      (f) => f.path === 'pets.native.tsx',
    )

    it(`${validator}: no verbatim reproduction, no shared value/type name`, () => {
      expect(mod).toBeDefined()
      const src = mod?.contents ?? ''
      // G5: the array model is inlined, never declared as a schema const.
      expect(src).not.toMatch(/export const pets_schema/)
      // G6: the schema binding is not the type's name.
      expect(src).toContain('export const pet_schema')
      expect(src).toContain('export type Pet =')
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(out.warnings.filter((w) => classifyWarning(w) === 'fatal'), target).toEqual([])
      }
    })

    describe.skipIf(!isKotlincAvailable())('kotlinc', () => {
      it(`${validator}: the Kotlin module compiles`, () => {
        const r = validateKotlin(transform(mod?.contents ?? '', { target: 'kotlin' }).code)
        expect(r.ok, String((r as { error?: string }).error ?? '')).toBe(true)
      })
    })

    describe.skipIf(!isSwiftcAvailable())('swiftc', () => {
      it(`${validator}: Swift no longer fails on the schema or the model name`, () => {
        const r = validateSwiftWithStubs(transform(mod?.contents ?? '', { target: 'swift' }).code)
        const errors = String((r as { error?: string }).error ?? '')
        expect(errors).not.toMatch(/invalid redeclaration|cannot find 'zodSchema'|cannot find 's' in scope|cannot find type 'Pets'/)
      })
    })
  }
})
