/**
 * `filters`, `naming` and `operations`: the refusals of each, asserted by
 * message. A config entry is the user's explicit instruction, so a wrong one
 * must FAIL with the reason and never be applied halfway.
 */
import type { LatheFilters } from '../core/config'
import { applyNaming, applyOperationSettings } from '../core/customize'
import { applyFilters } from '../core/select'
import { loadOpenApi } from '../input/openapi'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'

const doc = () => loadOpenApi(CUSTOMIZE_SPEC).doc
const filter = (f: unknown) => applyFilters(doc(), f as LatheFilters)

describe('filters', () => {
  it('refuses a malformed matcher and a bad `models`', () => {
    expect(() => filter({ include: 'pets' })).toThrow("`filters.include` must be an object like `{ tag: 'pets' }`")
    expect(() => filter({ include: [{ tags: 'pets' }] })).toThrow('`filters.include[0]` has an unknown key `tags`. Did you mean `tag`?')
    expect(() => filter({ exclude: { zzzzzz: 1 } })).toThrow(/`filters.exclude` has an unknown key `zzzzzz`\. Known/)
    expect(() => filter({ include: { tag: undefined } })).toThrow('is empty, so it would match every operation')
    expect(() => filter({ models: 'some' })).toThrow("`filters.models` must be 'reachable' or 'all'; got `some`")
  })

  it('no matcher at all leaves the document alone', () => {
    const d = doc()
    expect(applyFilters(d, { models: 'all' })).toBe(d)
  })

  it('a matcher that selects nothing is an error, with hints where it can give them', () => {
    expect(() => filter({ include: { tag: 'petz' } })).toThrow('`filters.include` matches no operation in the spec, so it filters nothing it was written for. Did you mean: tag `petz` -> `pets`?')
    expect(() => filter({ exclude: [{ operationId: 'listPetz' }] })).toThrow('`filters.exclude[0]` matches no operation in the spec, so it filters nothing it was written for. Did you mean: operationId `listPetz` -> `listPets`?')
    // A glob gets no did-you-mean; a far-off name gets the generic hint.
    expect(() => filter({ include: { operationId: 'zzz*' } })).toThrow('Check it against the spec (paths use `{param}` form)')
  })

  it('keeps models reachable from what is kept — through other models too — unless told otherwise', () => {
    const kept = filter({ include: { tag: 'pets' } })
    expect(kept.models.map((m) => m.name).sort()).toEqual(['Pet', 'PetPage'])
    expect(filter({ include: { tag: 'pets' }, models: 'all' }).models).toHaveLength(4)
  })
})

describe('naming', () => {
  it('attributes a throwing hook, including a non-Error throw', () => {
    expect(() =>
      applyNaming(doc(), {
        operation: () => {
          throw 'no' // eslint-disable-line no-throw-literal
        },
      }),
    ).toThrow('`naming.operation` threw for `getHealth`: no')
  })

  it('refuses a result that is not a string, or not a usable name', () => {
    expect(() => applyNaming(doc(), { operation: () => 3 as never })).toThrow('— it must return a string')
    expect(() => applyNaming(doc(), { model: () => 3 as never })).toThrow('which is not a usable model name — it must return a string')
    expect(() => applyNaming(doc(), { model: ({ default: d }) => d.toLowerCase() })).toThrow(/not a usable model name \(PascalCase/)
  })

  it('an untagged operation is offered its fallback tag and its generated path', () => {
    const seen: unknown[] = []
    applyNaming(doc(), { operation: (ctx) => (seen.push([ctx.default, ctx.tags, ctx.path]), ctx.default) })
    expect(seen[0]).toEqual(['getHealth', [], '/health'])
  })
})

describe('operations settings', () => {
  const settings = (s: unknown, hook?: Parameters<typeof applyOperationSettings>[2]) =>
    applyOperationSettings(doc(), s as never, hook)

  it('refuses a malformed entry, naming it', () => {
    expect(() => settings({ listPets: null })).toThrow("`operations.listPets` must be an object like `{ hook: 'usePets' }`")
    expect(() => settings({ listPets: { hok: 'x' } })).toThrow('`operations.listPets` has an unknown key `hok`. Did you mean `hook`?')
    expect(() => settings({ listPets: { zzzzzzzz: 1 } })).toThrow(/unknown key `zzzzzzzz`\. Known/)
    expect(() => settings({ listPets: { hook: 3 } })).toThrow('`operations.listPets.hook` must be a hook name or `false`')
    expect(() => settings({ listPets: { responseValidation: 'loose' } })).toThrow('must be strict, warn, off; got `loose`')
  })

  it('refuses one operation configured twice, by endpoint name and operationId', () => {
    expect(() => settings({ listPets: { hook: 'useA' }, 'list-pets': { hook: 'useB' } })).toThrow('configures `listPets` twice')
  })

  it('naming.hook must return a name or false; an explicit hook wins over it', () => {
    expect(() => settings({}, () => 3 as never)).toThrow('`naming.hook` returned `3` for `getHealth` — return a hook name or `false`')
    const out = settings({ listPets: { hook: 'usePetList' } }, ({ default: d, kind }) => (kind === 'mutation' ? false : d))
    expect(out.operations.find((o) => o.id === 'listPets')?.hook).toBe('usePetList')
    expect(out.operations.find((o) => o.id === 'createPet')?.hook).toBe(false)
    expect(out.operations.find((o) => o.id === 'getHealth')?.hook).toBe('useGetHealth')
  })
})
