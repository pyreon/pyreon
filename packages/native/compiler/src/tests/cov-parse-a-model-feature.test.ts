// The three remaining top-level recognizers that read a LITERAL config object:
// `model({ state }).views().actions().create()`, `withField(schema, meta)` and
// `defineFeature({ name, schema })` — plus the `.regex()` portability gate the
// validate-schema path shares with them.
//
// They have the same failure mode as `defineStore`: a config the recognizer
// cannot read used to fall through to a verbatim emit naming `model` /
// `defineFeature`, neither of which exists on either target. So every spec
// below pairs the diagnostic with the ABSENCE of the emitted singleton, and
// the accepting shape proves the recognizer still reads what it should —
// including the quoted-key spelling (`{ 'state': { 'count': 1 } }`), which is
// the same object as the bare one and has to read identically.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

const mod = (decls: string): string => `import { Stack, Text } from '${P}'
${decls}
export function S() { return (<Stack><Text>hi</Text></Stack>) }`

const run = (src: string) => transform(src, { target: 'swift' })
const warnings = (src: string): string[] => run(src).warnings
const has = (src: string, needle: string): boolean => warnings(src).some((w) => w.includes(needle))

// ---------------------------------------------------------------------------
// model()
// ---------------------------------------------------------------------------

const model = (chain: string): string => mod(`const m = ${chain}`)
const emitsModel = (src: string): boolean => run(src).code.includes('PyreonModel_m')

describe('model() — the shapes that lower', () => {
  it('a bare `model({ state }).create()` emits the singleton on both targets', () => {
    const src = model(`model({ state: { count: 1, label: 'a', on: true } }).create()`)
    expect(warnings(src)).toEqual([])
    expect(run(src).code).toContain('PyreonModel_m')
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonModel_m')
  })

  it('QUOTED config and field keys read exactly like bare ones', () => {
    const src = model(`model({ 'state': { 'count': 1 } }).create()`)
    expect(warnings(src)).toEqual([])
    expect(emitsModel(src)).toBe(true)
  })

  it('the field TYPE comes from the seed — a fractional seed is not an Int', () => {
    const code = run(model(`model({ state: { total: 2.5 } }).create()`)).code
    expect(code).toContain('Double')
  })

  it('`.views()` and `.actions()` both lower, and `self` may be named anything', () => {
    const src = model(
      `model({ state: { c: 1 } }).views((me) => ({ d: () => me.c() * 2 })).actions((me) => ({ inc: () => { me.c.set(1) } })).create()`,
    )
    expect(warnings(src)).toEqual([])
    expect(run(src).code).toContain('PyreonModel_m')
  })

  it('an omitted `self` parameter is allowed', () => {
    const src = model(`model({ state: { c: 1 } }).views(() => ({ d: () => 2 })).create()`)
    expect(warnings(src)).toEqual([])
    expect(emitsModel(src)).toBe(true)
  })

  it('a parenthesised factory body is unwrapped rather than declined', () => {
    const src = model(`model({ state: { c: 1 } }).views((self) => (({ d: () => self.c() }))).create()`)
    expect(warnings(src)).toEqual([])
    expect(emitsModel(src)).toBe(true)
  })

  it('a QUOTED member name reads like a bare one', () => {
    const src = model(`model({ state: { c: 1 } }).views((self) => ({ 'd': () => self.c() })).create()`)
    expect(warnings(src)).toEqual([])
    expect(emitsModel(src)).toBe(true)
  })
})

describe('model() — declined configs', () => {
  it('an unsupported builder STEP is named', () => {
    const src = model(`model({ state: { c: 1 } }).extras((self) => ({})).create()`)
    expect(has(src, 'builder step `.extras()` is not supported')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a non-literal config argument is declined', () => {
    const src = mod(`const CFG = { state: { c: 1 } }\nconst m = model(CFG).create()`)
    expect(has(src, 'config argument is not an object literal')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a MISSING `state` key is declined', () => {
    const src = model(`model({ views: {} }).create()`)
    expect(has(src, '`state` field is missing or not an object literal')).toBe(true)
  })

  it('a non-literal `state` is declined the same way', () => {
    const src = model(`model({ state: SEED }).create()`)
    expect(has(src, '`state` field is missing or not an object literal')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a non-literal FIELD is dropped by name while its siblings survive', () => {
    const src = model(`model({ state: { count: 1, bad: runtime } }).create()`)
    expect(has(src, 'state field `bad` is not a literal value')).toBe(true)
    expect(emitsModel(src)).toBe(true)
  })

  it('a `null` field is a literal but not a supported one — dropped by name', () => {
    const src = model(`model({ state: { count: 1, bad: null } }).create()`)
    expect(has(src, 'state field `bad` is not a string / number / boolean literal')).toBe(true)
    expect(emitsModel(src)).toBe(true)
  })

  it('a state object with NO readable field is declined outright', () => {
    const src = model(`model({ state: {} }).create()`)
    expect(has(src, 'no recognizable state fields')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a non-factory `.views()` argument is declined', () => {
    const src = model(`model({ state: { c: 1 } }).views(VIEWS).create()`)
    expect(has(src, '`.views()` argument must be a `(self) => ({ … })` factory')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a DESTRUCTURED `self` is refused rather than silently snapshotted', () => {
    const src = model(`model({ state: { c: 1 } }).views(({ c }) => ({ d: () => 1 })).create()`)
    expect(has(src, 'must bind `self` as a plain parameter, not a destructure')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a BLOCK-body factory is declined and names the object-literal form', () => {
    const src = model(`model({ state: { c: 1 } }).views((self) => { return { d: () => 1 } }).create()`)
    expect(has(src, 'must return an object literal directly')).toBe(true)
  })

  it('a non-function MEMBER is declined by name', () => {
    const src = model(`model({ state: { c: 1 } }).views((self) => ({ d: 5 })).create()`)
    expect(has(src, 'member `d` must be a function')).toBe(true)
    expect(emitsModel(src)).toBe(false)
  })

  it('a BLOCK-body view is declined — a view is a zero-arg reader expression', () => {
    const src = model(`model({ state: { c: 1 } }).views((self) => ({ d: () => { return 1 } })).create()`)
    expect(has(src, 'view `d` must be an expression-body arrow')).toBe(true)
  })

  it('a chain whose root is not `model(...)` is not our shape at all', () => {
    const src = model(`builder({ state: { c: 1 } }).create()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(false)
  })

  it('a `.create()` on a bare identifier is not our shape either', () => {
    const src = model(`registry.create()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// withField()
// ---------------------------------------------------------------------------

const wf = (decl: string): string =>
  `import { withField, s } from '@pyreon/validate'
import { Stack, Text } from '${P}'
${decl}
export function S() { return (<Stack><Text>hi</Text></Stack>) }`

const emitsMeta = (src: string): boolean => run(src).code.includes('PyreonFieldMeta_F')

describe('withField(schema, meta)', () => {
  it('a literal meta object emits the field-meta struct', () => {
    expect(emitsMeta(wf(`const F = withField(s.string(), { label: 'Label' })`))).toBe(true)
  })

  it('a QUOTED meta key reads like a bare one', () => {
    expect(emitsMeta(wf(`const F = withField(s.string(), { 'label': 'Label' })`))).toBe(true)
  })

  it('a non-string meta value is dropped while a string sibling survives', () => {
    expect(emitsMeta(wf(`const F = withField(s.string(), { n: 1, label: 'L' })`))).toBe(true)
  })

  it('a non-literal meta argument is declined by name', () => {
    const src = wf(`const F = withField(s.string(), META)`)
    expect(has(src, 'second argument must be a literal meta object')).toBe(true)
    expect(emitsMeta(src)).toBe(false)
  })

  it('a MISSING meta argument is declined the same way', () => {
    const src = wf(`const F = withField(s.string())`)
    expect(has(src, 'second argument must be a literal meta object')).toBe(true)
  })

  it('a meta object with no STRING-valued entry is declined', () => {
    const src = wf(`const F = withField(s.string(), { n: 1 })`)
    expect(has(src, 'no recognized meta fields')).toBe(true)
    expect(emitsMeta(src)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// defineFeature()
// ---------------------------------------------------------------------------

const feat = (cfg: string): string => mod(`const F = defineFeature(${cfg})`)
const emitsFeature = (src: string): boolean => run(src).code.includes('PyreonFeature_F')

describe('defineFeature({ name, schema })', () => {
  it('a literal name + field-type map emits the feature struct', () => {
    const src = feat(`{ name: 'todo', schema: { id: 'string', n: 'number', done: 'boolean' } }`)
    expect(warnings(src)).toEqual([])
    expect(run(src).code).toContain('PyreonFeature_F')
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonFeature_F')
  })

  it('QUOTED config and schema keys read like bare ones', () => {
    const src = feat(`{ 'name': 'todo', 'schema': { 'a': 'string' } }`)
    expect(warnings(src)).toEqual([])
    expect(emitsFeature(src)).toBe(true)
  })

  it('unrelated config keys are dropped without comment', () => {
    const src = feat(`{ name: 'todo', schema: { a: 'string' }, api: client, initialValues: v }`)
    expect(warnings(src)).toEqual([])
    expect(emitsFeature(src)).toBe(true)
  })

  it('a MISSING `name` is declined by name', () => {
    const src = feat(`{ schema: { a: 'string' } }`)
    expect(has(src, '`name` field is missing or not a string literal')).toBe(true)
    expect(emitsFeature(src)).toBe(false)
  })

  it('a non-literal `name` is declined the same way', () => {
    expect(has(feat(`{ name: NAME, schema: { a: 'string' } }`), '`name` field is missing')).toBe(true)
  })

  it('a non-literal `schema` is declined, and names the literal map shape', () => {
    const src = feat(`{ name: 'todo', schema: z.object({}) }`)
    expect(has(src, '`schema` is not a literal object')).toBe(true)
    expect(emitsFeature(src)).toBe(false)
  })

  it('a non-string field type is dropped BY NAME while its siblings survive', () => {
    const src = feat(`{ name: 'todo', schema: { a: 'string', b: runtime } }`)
    expect(has(src, "schema field `b` is not a type-name string literal")).toBe(true)
    expect(emitsFeature(src)).toBe(true)
  })

  it('an UNSUPPORTED type name is dropped and quoted back', () => {
    const src = feat(`{ name: 'todo', schema: { a: 'string', b: 'date' } }`)
    expect(has(src, "unsupported type 'date'")).toBe(true)
    expect(emitsFeature(src)).toBe(true)
  })

  it('a schema with no recognizable field is declined outright', () => {
    const src = feat(`{ name: 'todo', schema: {} }`)
    expect(has(src, 'no recognized schema fields')).toBe(true)
    expect(emitsFeature(src)).toBe(false)
  })

  it('a non-literal config argument is not our shape — silent tier2 drop', () => {
    const src = mod(`const CFG = { name: 'todo' }\nconst F = defineFeature(CFG)`)
    expect(warnings(src).some((w) => w.startsWith('defineFeature declaration'))).toBe(false)
    expect(emitsFeature(src)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// .regex() portability
// ---------------------------------------------------------------------------

const schemaWith = (chain: string): string =>
  `import { s } from '@pyreon/validate'
import { Stack, Text } from '${P}'
export const Sch = s.object({ a: s.string()${chain} })
export function S() { return (<Stack><Text>hi</Text></Stack>) }`

describe('.regex() — only patterns that port identically lower', () => {
  it('a plain pattern with the `i` flag lowers silently', () => {
    const src = schemaWith(`.regex(/^ab$/i)`)
    expect(warnings(src)).toEqual([])
    expect(run(src).code).toContain('^ab$')
  })

  it('a NON-literal argument is declined by name', () => {
    expect(has(schemaWith(`.regex(RE)`), 'needs an inline regular-expression literal')).toBe(true)
  })

  it('a stateful-iteration flag is declined, and the flag is quoted back', () => {
    expect(has(schemaWith(`.regex(/ab/g)`), 'flag(s) `g` do not port')).toBe(true)
  })

  it('LOOKBEHIND is declined', () => {
    expect(has(schemaWith(`.regex(/(?<=x)y/)`), 'uses lookbehind, a named group')).toBe(true)
  })

  it('a NAMED GROUP is declined', () => {
    expect(has(schemaWith(`.regex(/(?<n>a)/)`), 'uses lookbehind, a named group')).toBe(true)
  })

  it('a pattern carrying the Swift raw-string terminator is declined', () => {
    // `"#` closes the `#"…"#` literal the emitter writes, so the pattern cannot
    // be embedded at all.
    expect(has(schemaWith(`.regex(/a"#b/)`), 'contains `"#`')).toBe(true)
  })
})

describe('COMPUTED keys name nothing the literal readers can use', () => {
  it('model(): a computed `state` key means there is no state to read', () => {
    const src = model('model({ [`state`]: { c: 1 } }).create()')
    expect(has(src, '`state` field is missing or not an object literal')).toBe(true)
  })

  it('model(): a computed FIELD key is skipped, leaving no recognizable fields', () => {
    const src = model('model({ state: { [`c`]: 1 } }).create()')
    expect(has(src, 'no recognizable state fields')).toBe(true)
  })

  it('model(): a computed MEMBER key in `.views()` is skipped silently', () => {
    const src = model('model({ state: { c: 1 } }).views((self) => ({ [`d`]: () => self.c() })).create()')
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(true)
  })

  it('defineFeature(): a computed `name` key means the name is missing', () => {
    const src = feat('{ [`name`]: "todo", schema: { a: "string" } }')
    expect(has(src, '`name` field is missing or not a string literal')).toBe(true)
  })

  it('defineFeature(): a computed SCHEMA-FIELD key is skipped, leaving no fields', () => {
    const src = feat('{ name: "todo", schema: { [`a`]: "string" } }')
    expect(has(src, 'no recognized schema fields')).toBe(true)
  })

  it('withField(): a computed META key is skipped, leaving no meta', () => {
    const src = wf('const F = withField(s.string(), { [`label`]: "L" })')
    expect(has(src, 'no recognized meta fields')).toBe(true)
  })
})

describe('a SPREAD in a literal config is walked past, not mistaken for a property', () => {
  it('model(): a spread beside `state` leaves the rest readable', () => {
    const src = model(`model({ ...base, state: { c: 1 } }).create()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(true)
  })

  it('model(): a spread inside `state` leaves the literal fields readable', () => {
    const src = model(`model({ state: { ...seed, c: 1 } }).create()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(true)
  })

  it('model(): a spread inside a `.views()` factory body leaves the members readable', () => {
    const src = model(`model({ state: { c: 1 } }).views((self) => ({ ...extra, d: () => self.c() })).create()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(true)
  })

  it('defineFeature(): spreads in the config and in the schema are walked past', () => {
    expect(emitsFeature(feat(`{ ...base, name: 'todo', schema: { a: 'string' } }`))).toBe(true)
    expect(emitsFeature(feat(`{ name: 'todo', schema: { ...more, a: 'string' } }`))).toBe(true)
  })

  it('withField(): a spread in the meta object is walked past', () => {
    expect(run(wf(`const F = withField(s.string(), { ...base, label: 'L' })`)).code)
      .toContain('PyreonFieldMeta_F')
  })
})

describe('model() — chain shapes that are not ours at all', () => {
  it('a COMPUTED-literal `.create` is not the create call', () => {
    // `obj['create']()` has a Literal property, not an Identifier one, so the
    // recognizer never claims it — silently, because it is someone else's code.
    const src = model(`obj['create']()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(false)
  })

  it('a chain root whose callee is itself a CALL is not `model(...)`', () => {
    const src = model(`(f())({ state: { c: 1 } }).create()`)
    expect(warnings(src).some((w) => w.startsWith('model declaration'))).toBe(false)
    expect(emitsModel(src)).toBe(false)
  })
})
