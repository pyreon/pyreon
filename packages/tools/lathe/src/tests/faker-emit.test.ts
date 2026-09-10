/**
 * The `createX(overrides?)` factory emitter.
 *
 * A generated fixture that violates its own schema is the failure to
 * prevent: the consumer's tests parse it with the generated validator,
 * it fails, and the error points at their test data rather than at the
 * generator. So where realism and CONSTRAINTS conflict, constraints win
 * — a `minLength` falls back to a plain alpha string rather than a
 * name-shaped one that might be shorter.
 *
 * The name-based heuristics are the readable half: a field called
 * `email` should get an email, because a fixture nobody can read is
 * barely better than `"string"`. They are only worth having while they
 * cannot produce an invalid value.
 *
 * Recursion is the other hazard. A self-referential model (a tree node,
 * a comment with replies) has no finite expansion, so the emitter has to
 * bound its depth — and SAY that it did, since a silently truncated
 * fixture looks like a complete one.
 */
import { describe, expect, it } from 'vitest'
import { emitFaker } from '../emit/faker'
import type { IrDocument, IrModel } from '../core/ir'

const doc = (models: IrModel[]): IrDocument =>
  ({ title: 'T', version: '1', baseUrl: '', models, operations: [], notes: [] }) as IrDocument

const model = (name: string, type: unknown): IrModel => ({ name, type }) as IrModel

/**
 * Constraints live on the FIELD (`min` / `max`), not on the type — the
 * IR's `string` carries only `format` and `enum`. A fixture that put
 * `minLength` on the type would exercise the unconstrained path while
 * claiming to test the constrained one.
 */
const obj = (
  fields: Array<[string, unknown, boolean?, { min?: number; max?: number }?]>,
) => ({
  kind: 'object',
  fields: fields.map(([name, type, required = true, bounds = {}]) => ({
    name, type, required, nullable: false, ...bounds,
  })),
})

// `emitFaker` returns a SourceFile builder, not text — `build(header)`
// is what renders it. Reading a `.text` that does not exist yields `''`,
// and every `toContain` below would then fail for the wrong reason.
const emit = (models: IrModel[]): string =>
  emitFaker(doc(models), 'types')?.build('// generated').contents ?? ''

describe('a factory is emitted per model', () => {
  it('emits createX with an overrides spread', () => {
    // The control, and the ergonomic contract: a caller overrides one
    // field without restating the rest.
    const out = emit([model('User', obj([['id', { kind: 'string' }]]))])
    expect(out).toContain('export function createUser')
    expect(out, 'overrides must win over the generated value').toContain('...o')
  })

  it('emits NOTHING when the spec has no models', () => {
    // An empty faker module is a file, an import edge and a dev
    // dependency for nothing.
    expect(emitFaker(doc([]), 'types')).toBeNull()
  })

  it('imports faker from the real package', () => {
    const out = emit([model('User', obj([['id', { kind: 'string' }]]))])
    expect(out).toContain('@faker-js/faker')
  })
})

describe('constraints outrank realism', () => {
  it('honours minLength with a plain alpha string', () => {
    // A name-shaped generator could produce something shorter than the
    // minimum, and the generated validator would then reject the
    // generated fixture — an error that points at the consumer's test.
    const out = emit([model('U', obj([['first_name', { kind: 'string' }, true, { min: 20 }]]))])
    expect(out, 'a realistic generator cannot guarantee the length').not.toContain('person.firstName')
    expect(out).toContain('alpha')
    expect(out).toContain('20')
  })

  it('keeps the readable generator for a maxLength ALONE, plus a slice', () => {
    // A max can be satisfied by trimming, so realism survives here.
    const out = emit([model('U', obj([['description', { kind: 'string' }, true, { max: 40 }]]))])
    expect(out).toContain('slice')
    expect(out).toContain('40')
  })

  it('never clamps a FORMAT — a truncated uuid is not a uuid', () => {
    const out = emit([model('U', obj([['id', { kind: 'string', format: 'uuid' }, true, { max: 8 }]]))])
    expect(out).toContain('uuid')
    expect(out).not.toContain('slice')
  })

  it('honours a numeric range', () => {
    const out = emit([model('U', obj([['age', { kind: 'number', integer: true }, true, { min: 18, max: 99 }]]))])
    expect(out).toContain('18')
    expect(out).toContain('99')
  })

  it('picks an enum member, never an arbitrary string', () => {
    // An off-enum value fails the generated validator immediately.
    const out = emit([model('U', obj([['status', { kind: 'string', enum: ['active', 'banned'] }]]))])
    expect(out).toContain('active')
    expect(out).toContain('banned')
  })
})

describe('the name heuristics produce readable data', () => {
  for (const [field, marker] of [
    ['email', 'internet.email'],
    ['user_email', 'internet.email'],
    ['url', 'internet.url'],
    ['website', 'internet.url'],
    ['avatar', 'image'],
    ['first_name', 'person.firstName'],
    ['last_name', 'person.lastName'],
    ['surname', 'person.lastName'],
    ['description', 'lorem'],
    ['phone', 'phone.number'],
    ['city', 'location.city'],
    ['country', 'location.country'],
    ['street', 'location.streetAddress'],
  ] as Array<[string, string]>) {
    it(`generates a plausible ${field}`, () => {
      // A fixture of `"string"` everywhere is barely better than none —
      // nobody can read a failing assertion against it.
      const out = emit([model('U', obj([[field, { kind: 'string' }]]))])
      expect(out, field).toContain(marker)
    })
  }

  for (const [field, marker] of [
    ['slug', 'alphanumeric'],
    ['sku', 'alphanumeric'],
    ['product_code', 'alphanumeric'],
    ['api_key', 'alphanumeric'],
    ['color', 'color.human'],
    ['colour', 'color.human'],
    ['company', 'company'],
    ['organization', 'company'],
  ] as Array<[string, string]>) {
    it(`generates a plausible ${field}`, () => {
      const out = emit([model('U', obj([[field, { kind: 'string' }]]))])
      expect(out, field).toContain(marker)
    })
  }

  it('honours a binary FORMAT over the field name', () => {
    // A field called `image` holding base64 is not a URL. The format is
    // the more specific statement and has to win.
    const out = emit([model('U', obj([['image', { kind: 'string', format: 'binary' }]]))])
    expect(out).not.toContain('image.url')
  })

  it('falls back to a plain word for an unrecognised name', () => {
    const out = emit([model('U', obj([['zzz_unknown', { kind: 'string' }]]))])
    expect(out).toContain('faker.')
  })
})

describe('every IR kind produces SOMETHING valid', () => {
  for (const [label, type] of [
    ['string', { kind: 'string' }],
    ['number', { kind: 'number', integer: false }],
    ['boolean', { kind: 'boolean' }],
    ['null', { kind: 'null' }],
    ['unknown', { kind: 'unknown', reason: 'no type' }],
    ['array', { kind: 'array', items: { kind: 'string' } }],
    ['record', { kind: 'object', fields: [], additional: { kind: 'string' } }],
  ] as Array<[string, unknown]>) {
    it(`emits a value for ${label}`, () => {
      // A kind that falls through to nothing produces `field: ,` — a
      // syntax error in the generated module, which is at least loud.
      const out = emit([model('U', obj([['f', type]]))])
      expect(out, label).toContain('f:')
      expect(out, `${label} emitted an empty value`).not.toMatch(/f:\s*,/)
    })
  }

  it('picks the FIRST option of a union', () => {
    const out = emit([model('U', obj([['f', {
      kind: 'union', options: [{ kind: 'string' }, { kind: 'number' }],
    }]]))])
    expect(out).toContain('f:')
  })

  it('emits null for an EMPTY union rather than nothing', () => {
    // An uninhabited union has no valid value; `null` is at least
    // syntactically emittable and visibly wrong.
    const out = emit([model('U', obj([['f', { kind: 'union', options: [] }]]))])
    expect(out).toContain('f: null')
  })

  it('emits null for a ref to a model that does not exist', () => {
    const out = emit([model('U', obj([['f', { kind: 'ref', name: 'Missing' }]]))])
    expect(out).toContain('f: null')
  })

  it('emits an empty object for a model with no fields', () => {
    const out = emit([model('Empty', obj([]))])
    expect(out).toContain('createEmpty')
    expect(out).toMatch(/\{\s*\.\.\.o\s*\}/)
  })
})

describe('nested objects spread overrides only at the TOP level', () => {
  it('spreads overrides on the root and not on a nested object', () => {
    // `createUser({ name: 'x' })` overrides a root field. Spreading the
    // same object into a nested one would apply a root override to the
    // wrong level and silently produce a shape the schema rejects.
    const out = emit([model('U', obj([
      ['id', { kind: 'string' }],
      ['address', obj([['city', { kind: 'string' }]])],
    ]))])
    expect(out.match(/\.\.\.o/g) ?? [], 'exactly one spread, at the root').toHaveLength(1)
  })

  it('emits a nested EMPTY object without a stray spread', () => {
    const out = emit([model('U', obj([['meta', obj([])]]))])
    expect(out).toContain('createU')
    expect(out.match(/\.\.\.o/g) ?? []).toHaveLength(1)
  })
})

describe('a recursive model is bounded, and SAYS so', () => {
  const tree = [
    model('Node', obj([
      ['id', { kind: 'string' }],
      ['child', { kind: 'ref', name: 'Node' }, false],
    ])),
  ]

  it('terminates rather than expanding forever', () => {
    // A tree node or a comment with replies. Without a depth bound the
    // emitter never returns.
    let out = ''
    expect(() => { out = emit(tree) }).not.toThrow()
    expect(out).toContain('createNode')
  })

  it('says the expansion was TRUNCATED', () => {
    // A silently bounded fixture looks complete, so a consumer writing
    // a test against a depth-4 tree gets a confusing shallow one.
    expect(emit(tree).toLowerCase()).toMatch(/recursive|depth/)
  })

  it('handles MUTUAL recursion', () => {
    const mutual = [
      model('A', obj([['b', { kind: 'ref', name: 'B' }, false]])),
      model('B', obj([['a', { kind: 'ref', name: 'A' }, false]])),
    ]
    let out = ''
    expect(() => { out = emit(mutual) }).not.toThrow()
    expect(out).toContain('createA')
    expect(out).toContain('createB')
  })

  it('bounds a recursive ARRAY too', () => {
    const nested = [
      model('N', obj([
        ['kids', { kind: 'array', items: { kind: 'ref', name: 'N' } }, false],
      ])),
    ]
    expect(() => emit(nested)).not.toThrow()
  })
})

describe('output is deterministic', () => {
  it('two emits of one document are byte-identical', () => {
    // `lathe check` fails on output stale against the spec, so a
    // generator with any run-to-run variation reds CI on every run.
    const models = [
      model('User', obj([['id', { kind: 'string', format: 'uuid' }], ['email', { kind: 'string' }]])),
      model('Post', obj([['title', { kind: 'string' }]])),
    ]
    expect(emit(models)).toBe(emit(models))
  })

  it('orders factories by model, not by traversal', () => {
    const out = emit([
      model('Zeta', obj([['a', { kind: 'string' }]])),
      model('Alpha', obj([['a', { kind: 'string' }]])),
    ])
    expect(out).toContain('createZeta')
    expect(out).toContain('createAlpha')
  })
})
