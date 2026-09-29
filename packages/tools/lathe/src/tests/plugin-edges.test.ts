/**
 * The plugin runner's refusals, one by one: each is a promise the plugin API
 * makes (attribution, a well-formed document, output that stays inside the
 * output directory), and each needs a plugin that breaks it to prove it holds.
 */
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import type { IrDocument } from '../core/ir'
import { definePlugin, type LathePlugin } from '../core/plugin'
import { SourceFile } from '../emit/writer'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'

const gen = (...plugins: LathePlugin[]) =>
  generate(CUSTOMIZE_SPEC, resolveConfig({ input: 'spec.json', plugins: ['schemas', ...plugins] }))

const transform = (name: string, fn: (doc: IrDocument) => unknown) =>
  definePlugin({ name, transformDocument: (doc) => fn(doc) as IrDocument })
const emitting = (name: string, fn: () => unknown) => definePlugin({ name, emit: () => fn() as never })

describe('definePlugin', () => {
  it('refuses a non-object', () => {
    expect(() => definePlugin(null as unknown as LathePlugin)).toThrow('definePlugin() takes an object')
    expect(() => definePlugin('x' as unknown as LathePlugin)).toThrow('definePlugin() takes an object')
  })
})

describe('attribution', () => {
  it('a thrown NON-Error is still attributed, with its text', () => {
    const p = definePlugin({
      name: 'throws-string',
      setup() {
        throw 'nope' // eslint-disable-line no-throw-literal
      },
    })
    expect(() => gen(p)).toThrow('plugin `throws-string` failed in `setup`: nope')
  })
})

describe('transformDocument must return a document or nothing', () => {
  it.each([
    ['null', null, 'got null'],
    ['a number', 3, 'got number'],
    ['a string', 'doc', 'got string'],
  ])('refuses %s', (_label, value, message) => {
    expect(() => gen(transform('bad-return', () => value))).toThrow(message)
  })

  it('returning nothing keeps the document', () => {
    const r = gen(transform('noop', () => undefined))
    expect(r.doc.title).toBe('Shop')
  })
})

describe('a returned document is checked for what every emitter assumes', () => {
  const pet = (doc: IrDocument) => doc.models.find((m) => m.name === 'Pet') as IrDocument['models'][number]
  const op0 = (doc: IrDocument) => doc.operations[0] as IrDocument['operations'][number]
  it.each<[string, (doc: IrDocument) => unknown, string | RegExp]>([
    ['non-array notes', (d) => ({ ...d, notes: 'x' }), '`operations`, `models` and `notes` must be arrays'],
    ['an invalid model name', (d) => ({ ...d, models: [...d.models, { ...pet(d), name: 'bad name' }] }), /model `bad name` is not a valid model name \(try `BadName`\)/],
    ['a duplicate model', (d) => ({ ...d, models: [...d.models, pet(d)] }), 'two models are named `Pet`'],
    ['models differing in case', (d) => ({ ...d, models: [...d.models, { ...pet(d), name: 'PeT' }] }), 'models `Pet` and `PeT` differ only in case'],
    ['an invalid operation id', (d) => ({ ...d, operations: [{ ...op0(d), id: 'bad id' }, ...d.operations.slice(1)] }), /operation `bad id` is not a valid operation name/],
    ['a duplicate operation', (d) => ({ ...d, operations: [...d.operations, op0(d)] }), /two operations are named/],
  ])('refuses %s', (_label, fn, message) => {
    expect(() => gen(transform('breaks', fn))).toThrow(message)
  })
})

describe('emit', () => {
  it('returning nothing adds no files', () => {
    const before = gen().files.map((f) => f.path)
    expect(gen(emitting('silent', () => undefined)).files.map((f) => f.path)).toEqual(before)
  })

  it('refuses a non-array and an invalid entry, naming its index', () => {
    expect(() => gen(emitting('object', () => ({ path: 'x.ts', contents: '' })))).toThrow('`emit` must return an array of files or nothing')
    expect(() => gen(emitting('entry', () => [new SourceFile('ok.ts'), { path: 3, contents: '' }]))).toThrow(
      'returned an invalid file at index 1',
    )
    expect(() => gen(emitting('null-entry', () => [null]))).toThrow('returned an invalid file at index 0')
  })

  it.each(['/abs.ts', 'a\\b.ts', 'C:x.ts', 'a//b.ts', './a.ts', ''])('refuses the unsafe path %j', (path) => {
    expect(() => gen(emitting('unsafe', () => [{ path, contents: '' }]))).toThrow('is not a relative path inside the output directory')
  })

  it('writes its files sorted by path, whatever order it returned them in', () => {
    const r = gen(emitting('order', () => [{ path: 'x/b.ts', contents: 'b' }, { path: 'x/a.ts', contents: 'a' }, { path: 'x/c.ts', contents: 'c' }]))
    expect(r.files.filter((f) => f.path.startsWith('x/')).map((f) => f.path)).toEqual(['x/a.ts', 'x/b.ts', 'x/c.ts'])
  })

  it('a path another PLUGIN emitted is a collision too, named as a plugin', () => {
    const a = emitting('first', () => [{ path: 'shared/x.ts', contents: '' }])
    const b = emitting('second', () => [{ path: 'Shared/X.ts', contents: '' }])
    expect(() => gen(a, b)).toThrow("plugin `second` emitted `Shared/X.ts`, which plugin `first` already emits")
  })
})
