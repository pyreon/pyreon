/**
 * What a generated schema ACCEPTS and REJECTS, for the spec shapes a real
 * document uses and the input layer used to get wrong.
 *
 * Every case here was found on a real spec (GitHub, OpenAI, DigitalOcean,
 * Stripe) and every one was invisible to an emit-level string assertion: the
 * emitted text looked plausible and the module either threw at IMPORT or
 * validated the wrong set of values. So each case imports the generated
 * `schemas.ts` and runs values through it, under both validators.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ValidatorName } from '../core/config'
import { cleanupGenerated, issuesOf, loadGeneratedSchemas, type LoadedSchemas } from './helpers/generated-schemas'

const SPEC = `
openapi: 3.1.0
info: { title: T, version: '1' }
paths: {}
components:
  schemas:
    # 3.0 spelling: nullable on the COMPONENT, not on the property (GitHub's
    # 63 \`nullable-*\` models; 414 uses rejected null before).
    NullableUser:
      type: object
      nullable: true
      required: [login]
      properties: { login: { type: string } }
    Issue:
      type: object
      required: [assignee, auto_merge]
      properties:
        assignee: { $ref: '#/components/schemas/NullableUser' }
        # 3.1 spelling on a model root, reached through a ref.
        auto_merge: { $ref: '#/components/schemas/AutoMerge' }
        # 3.1 canonical nullable union: was s.union([User, s.unknown()]).
        closed_by:
          anyOf: [{ $ref: '#/components/schemas/NullableUser' }, { type: 'null' }]
        # 3.1 multi-type: kept only the first type before.
        id_or_name: { type: [string, integer] }
    AutoMerge:
      type: [object, 'null']
      required: [method]
      properties: { method: { type: string } }
    # DigitalOcean: enum + minLength emitted s.enum([...]).min(3) -> TypeError.
    TlsVersion: { type: string, enum: ['1.2', '1.3'], minLength: 3 }
    Priority: { type: integer, enum: [1, 2, 3] }
    Mixed: { enum: [a, 1, null] }
    Dog: { const: dog }
    # OpenAI: IMPLICIT discriminator, plain-string tags -> threw at import.
    Annotation:
      oneOf: [{ $ref: '#/components/schemas/FileCitation' }, { $ref: '#/components/schemas/FilePath' }]
      discriminator: { propertyName: type }
    FileCitation:
      type: object
      required: [type, file_id]
      properties: { type: { type: string }, file_id: { type: string } }
    FilePath:
      type: object
      required: [type, path]
      properties: { type: { type: string }, path: { type: string } }
    # snake_case discriminator was ident()-ed to \`petType\`.
    Pet:
      oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Hound' }]
      discriminator: { propertyName: pet_type }
    Cat:
      type: object
      required: [pet_type, meows]
      properties: { pet_type: { type: string, enum: [cat] }, meows: { type: boolean } }
    Hound:
      type: object
      required: [pet_type, barks]
      properties: { pet_type: { const: hound }, barks: { type: boolean } }
    Repo:
      type: object
      required: [mirror_url]
      properties:
        # GitHub's mirror_url is \`git:git.example.com/…\`; .url() rejected it.
        mirror_url: { type: string, format: uri }
    Bounds:
      type: object
      properties:
        strict30: { type: integer, minimum: 5, exclusiveMinimum: true }
        strict31: { type: number, exclusiveMaximum: 10 }
        price: { type: number, multipleOf: 0.01 }
        tags: { type: array, items: { type: string }, minItems: 1, maxItems: 2, uniqueItems: true }
    ShortCodes:
      type: array
      items: { type: string, maxLength: 2 }
`

const VALIDATORS: readonly ValidatorName[] = ['pyreon', 'zod']
const loaded = new Map<ValidatorName, LoadedSchemas>()

beforeAll(async () => {
  for (const v of VALIDATORS) loaded.set(v, await loadGeneratedSchemas(SPEC, v, 'schema-semantics'))
}, 120_000)

afterAll(() => cleanupGenerated())

for (const v of VALIDATORS) {
  describe(`${v}: the module IMPORTS, and each shape validates the right values`, () => {
    const ok = (name: string, value: unknown): void => {
      expect(issuesOf(loaded.get(v)?.schemas[name], value), `${name} should accept ${JSON.stringify(value)}`).toEqual([])
    }
    const no = (name: string, value: unknown): void => {
      expect(issuesOf(loaded.get(v)?.schemas[name], value).length, `${name} should reject ${JSON.stringify(value)}`).toBeGreaterThan(0)
    }

    it('a 3.0 `nullable` component model accepts null wherever it is referenced', () => {
      ok('Issue', { assignee: null, auto_merge: null })
      ok('NullableUser', null)
    })

    it('a 3.1 `type: [object, null]` model accepts null', () => {
      ok('AutoMerge', null)
      ok('Issue', { assignee: { login: 'a' }, auto_merge: { method: 'squash' } })
    })

    it('`anyOf: [X, {type: null}]` is X-or-null, NOT anything', () => {
      ok('Issue', { assignee: null, auto_merge: null, closed_by: null })
      no('Issue', { assignee: null, auto_merge: null, closed_by: 42 })
    })

    it('a 3.1 multi-type keeps every type', () => {
      ok('Issue', { assignee: null, auto_merge: null, id_or_name: 'x' })
      ok('Issue', { assignee: null, auto_merge: null, id_or_name: 7 })
      no('Issue', { assignee: null, auto_merge: null, id_or_name: true })
    })

    it('an enum with a stray string constraint validates its members', () => {
      ok('TlsVersion', '1.3')
      no('TlsVersion', '1.4')
    })

    it('a NUMERIC enum rejects values outside it', () => {
      ok('Priority', 2)
      no('Priority', 99)
    })

    it('a MIXED enum accepts each member, including null', () => {
      ok('Mixed', 'a')
      ok('Mixed', 1)
      ok('Mixed', null)
      no('Mixed', 'b')
    })

    it('a `const` is that one value', () => {
      ok('Dog', 'dog')
      no('Dog', 123)
    })

    it('an IMPLICIT discriminator degrades to a union that still validates', () => {
      ok('Annotation', { type: 'file_citation', file_id: 'f' })
      ok('Annotation', { type: 'file_path', path: 'p' })
      no('Annotation', { type: 'file_path' })
    })

    it('a snake_case discriminator keeps its WIRE name', () => {
      ok('Pet', { pet_type: 'cat', meows: true })
      ok('Pet', { pet_type: 'hound', barks: false })
      no('Pet', { pet_type: 'cat', barks: true })
    })

    it('`format: uri` accepts a URI that is not an http URL', () => {
      ok('Repo', { mirror_url: 'git:git.example.com/octocat/Hello-World' })
    })

    it('numeric bounds: 3.0 boolean and 3.1 number exclusive forms, and a fractional multipleOf', () => {
      ok('Bounds', { strict30: 6 })
      no('Bounds', { strict30: 5 })
      ok('Bounds', { strict31: 9.5 })
      no('Bounds', { strict31: 10 })
      // `19.99 % 0.01` is not 0 in floating point; a naive `.multipleOf`
      // rejects every valid price.
      ok('Bounds', { price: 19.99 })
      no('Bounds', { price: 19.995 })
    })

    it('array constraints: minItems, maxItems, uniqueItems', () => {
      ok('Bounds', { tags: ['a', 'b'] })
      no('Bounds', { tags: [] })
      no('Bounds', { tags: ['a', 'b', 'c'] })
      no('Bounds', { tags: ['a', 'a'] })
    })

    it('a constraint on array ITEMS applies (constraints live on the type, not the field)', () => {
      ok('ShortCodes', ['ab'])
      no('ShortCodes', ['abc'])
    })
  })
}

describe('the degradation is REPORTED', () => {
  it('names the implicit discriminator in a note', async () => {
    const r = loaded.get('pyreon')
    expect(r?.doc.notes.some((n) => /discriminator `type`.*implicit/.test(n.message))).toBe(true)
    expect(r?.source).not.toContain("discriminatedUnion('type'")
    expect(r?.source).toContain("discriminatedUnion('pet_type'")
  })
})
