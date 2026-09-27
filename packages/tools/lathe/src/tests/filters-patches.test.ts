/**
 * `filters` (generate a subset) and `patches` (correct the spec first).
 *
 * Both are the author telling Lathe something about a spec they do not own,
 * so both must fail LOUDLY when what they target is not there: a typo'd tag
 * in `include` would otherwise produce an empty client, and a patch whose
 * target the vendor moved would silently stop correcting anything.
 */
import { resolveConfig, type LatheSection } from '../core/config'
import { generate } from '../core/generate'
import { applyPatches, parsePointer } from '../core/patch'
import { globToRegExp } from '../core/select'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'
import { typecheckSpec } from './helpers/typecheck'

const gen = (section: Omit<LatheSection, 'input'> = {}) =>
  generate(CUSTOMIZE_SPEC, resolveConfig({ input: 'spec.json', plugins: ['schemas', 'client', 'queries'], ...section }))
const ids = (r: ReturnType<typeof gen>) => r.doc.operations.map((o) => o.id).sort()
const models = (r: ReturnType<typeof gen>) => r.doc.models.map((m) => m.name).sort()

describe('globToRegExp', () => {
  it('* stays in a segment, ** crosses them, ? is one character, braces are literal', () => {
    expect(globToRegExp('/pets/*').test('/pets/{petId}')).toBe(true)
    expect(globToRegExp('/pets/*').test('/pets/{petId}/owner')).toBe(false)
    expect(globToRegExp('/pets/**').test('/pets/{petId}/owner')).toBe(true)
    expect(globToRegExp('/pet?').test('/pets')).toBe(true)
    expect(globToRegExp('/pets/{petId}').test('/pets/{petId}')).toBe(true)
    expect(globToRegExp('/a.b').test('/aXb')).toBe(false)
  })
})

describe('filters', () => {
  it('include by tag keeps that tag — and matches EVERY tag, not just the first', () => {
    expect(ids(gen({ filters: { include: { tag: 'admin' } } }))).toEqual(['createPet'])
    expect(ids(gen({ filters: { include: { tag: ['store', 'users'] } } }))).toEqual(['deleteUser', 'listOrders'])
  })

  it('a matcher ANDs its fields; a list of matchers ORs', () => {
    expect(ids(gen({ filters: { include: { path: '/pets/**', method: 'get' } } }))).toEqual(['getPetById'])
    expect(ids(gen({ filters: { include: { path: '/pets', method: ['GET', 'post'] } } }))).toEqual(['createPet', 'listPets'])
    expect(ids(gen({ filters: { include: [{ tag: 'store' }, { method: 'delete' }] } }))).toEqual(['deleteUser', 'listOrders'])
  })

  it('operationId matches the spec\'s own id OR the generated name, with globs', () => {
    expect(ids(gen({ filters: { include: { operationId: 'list-pets' } } }))).toEqual(['listPets'])
    expect(ids(gen({ filters: { include: { operationId: 'listPets' } } }))).toEqual(['listPets'])
    expect(ids(gen({ filters: { include: { operationId: 'list*' } } }))).toEqual(['listOrders', 'listPets'])
  })

  it('exclude drops after include', () => {
    expect(ids(gen({ filters: { include: { tag: 'pets' }, exclude: { method: 'post' } } }))).toEqual(['getPetById', 'listPets'])
  })

  it('drops models no kept operation reaches — and the notes about them', () => {
    const r = gen({ filters: { include: { tag: 'store' } } })
    // Order -> Pet stays (transitively reached); PetPage and Unused go.
    expect(models(r)).toEqual(['Order', 'Pet'])
    expect(r.doc.notes.map((n) => n.code)).not.toContain('int64-precision')
    // The excluded untagged operation's missing-operation-id note goes too.
    expect(r.doc.notes.map((n) => n.code)).not.toContain('missing-operation-id')
    expect(r.files.map((f) => f.path)).not.toContain('schemas/PetPage.ts')
  })

  it("`models: 'all'` keeps every model", () => {
    expect(models(gen({ filters: { include: { tag: 'store' }, models: 'all' } }))).toEqual(['Order', 'Pet', 'PetPage', 'Unused'])
  })

  it('a matcher that selects NOTHING is an error with a suggestion — include and exclude alike', () => {
    expect(() => gen({ filters: { include: { tag: 'pet' } } })).toThrow(
      /`filters.include` matches no operation .*tag `pet` -> `pets`\?/,
    )
    expect(() => gen({ filters: { exclude: [{ tag: 'store' }, { operationId: 'deleteUsr' }] } })).toThrow(
      /`filters.exclude\[1\]` matches no operation .*operationId `deleteUsr` -> `deleteUser`\?/,
    )
  })

  it('refuses an empty matcher and an unknown key', () => {
    expect(() => gen({ filters: { include: {} } })).toThrow(/is empty, so it would match every operation/)
    expect(() => gen({ filters: { include: { tags: 'pets' } as never } })).toThrow(/unknown key `tags`\. Did you mean `tag`\?/)
  })

  it('the filtered client TYPECHECKS as a consumer uses it', () => {
    const { errors } = typecheckSpec(
      'filters-store',
      CUSTOMIZE_SPEC,
      { plugins: ['schemas', 'client', 'queries'], filters: { include: { tag: 'store' } } },
      { extra: { 'use.ts': "import { useListOrders } from './queries/store'\nexport const q = useListOrders()\n" } },
    )
    expect(errors).toEqual([])
  })
})

describe('patches', () => {
  it('parses RFC 6901 pointers, with or without `#`', () => {
    expect(parsePointer('/paths/~1pets~1{id}/get')).toEqual(['paths', '/pets/{id}', 'get'])
    expect(parsePointer('#/components/schemas/a~0b')).toEqual(['components', 'schemas', 'a~b'])
    expect(parsePointer('')).toEqual([])
    expect(() => parsePointer('paths')).toThrow(/starts with `\//)
  })

  it('add / replace / remove correct the spec before it is read', () => {
    const r = gen({
      patches: [
        // A note's own `at` pasted in: the untagged health check gets an id.
        { op: 'add', path: '#/paths/~1health/get/operationId', value: 'checkHealth' },
        { op: 'replace', path: '/paths/~1pets/get/operationId', value: 'browsePets' },
        { op: 'remove', path: '/paths/~1users~1{id}' },
      ],
    })
    expect(ids(r)).toEqual(['browsePets', 'checkHealth', 'createPet', 'getPetById', 'listOrders'])
    expect(r.doc.notes.map((n) => n.code)).not.toContain('missing-operation-id')
  })

  it('arrays: `-` appends and an index inserts', () => {
    const spec: Record<string, unknown> = { a: [1, 3] }
    applyPatches(spec, [
      { op: 'add', path: '/a/1', value: 2 },
      { op: 'add', path: '/a/-', value: 4 },
    ])
    expect(spec).toEqual({ a: [1, 2, 3, 4] })
  })

  it('FAILS when the target moved, naming the patch and the nearest key', () => {
    expect(() => gen({ patches: [{ op: 'replace', path: '/paths/~1petz/get/operationId', value: 'x' }] })).toThrow(
      /`patches\[0\]` \(replace `\/paths\/~1petz\/get\/operationId`\): `\/paths\/\/petz` does not exist .*did you mean `\/pets`\?/,
    )
    expect(() => gen({ patches: [{ op: 'remove', path: '/info/summary' }] })).toThrow(/there is no `summary` to remove/)
    expect(() => gen({ patches: [{ op: 'add', path: '/info/x' } as never] })).toThrow(/needs a `value`/)
  })

  it('cannot reach Object.prototype through `__proto__`', () => {
    const spec: Record<string, unknown> = {}
    expect(() => applyPatches(spec, [{ op: 'add', path: '/__proto__/polluted', value: true }])).toThrow(/does not exist/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    applyPatches(spec, [{ op: 'add', path: '/__proto__', value: { own: true } }])
    expect(Object.getPrototypeOf(spec)).toBe(Object.prototype)
    expect(Object.hasOwn(spec, '__proto__')).toBe(true)
  })

  it('copies the value — a config object shared by two projects is never aliased', () => {
    const value = { type: 'string' }
    const a: Record<string, unknown> = { x: {} }
    applyPatches(a, [{ op: 'replace', path: '/x', value }])
    ;(a.x as { type: string }).type = 'number'
    expect(value.type).toBe('string')
  })
})
