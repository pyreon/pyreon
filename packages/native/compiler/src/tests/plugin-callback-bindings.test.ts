import { assertPluginShape } from '../plugin-shape'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { DeclEmitter } from '../call-lowering'
import type { EmitContext } from '../emit-context'
import type { ReceiverSite } from '../expr-lowering'
import { createPluginScope } from '../plugin-scope'
import type { ExprIR, ExtDecl } from '../types'

const member = (name: string, property: string): ExprIR => ({
  kind: 'member',
  object: { kind: 'identifier', name },
  property,
})
const scoped = (name: string): ExtDecl => ({
  kind: 'ext',
  name,
  plugin: '@acme/box',
  type: 'row',
  payload: {},
})
const readRow = (site: ReceiverSite, ctx: EmitContext): string | undefined => {
  const e = site.expr
  if (
    e.kind === 'call' &&
    e.args.length === 0 &&
    e.callee.kind === 'member' &&
    e.callee.property === 'value'
  )
    return `${ctx.ident(site.receiver.name)}.value`
  if (e.kind === 'member' && e.object.kind === 'identifier')
    return `owned_${ctx.ident(site.receiver.name)}_${e.property}`
  return undefined
}
const box: DeclEmitter = {
  swift: (d) => `private let ${d.name} = Box()`,
  kotlin: (d) => `val ${d.name} = Box()`,
  valueBinding: {
    swift: (value, d) =>
      value.kind === 'member' && value.property === 'text' ? `${d.name}.textBinding` : undefined,
    kotlin: (value, d) =>
      value.kind === 'member' && value.property === 'text'
        ? { value: `${d.name}.text`, onChange: `{ ${d.name}.write(it) }` }
        : undefined,
  },
  iteration(source) {
    const e = source.kind === 'call' && source.args.length === 0 ? source.callee : source
    return e.kind === 'member' && e.property === 'rows' ? { type: 'row' } : undefined
  },
}
const plugin: CompilerPlugin = {
  name: '@acme/box',
  apiVersion: 1,
  modules: ['@acme/box'],
  calls: { useBox: () => ({ type: 'box' }) },
  decls: { box, row: { swift: () => '', kotlin: () => '' } },
  receivers: { row: { swift: { expr: readRow }, kotlin: { expr: readRow } } },
}
const compiler = createCompiler({ plugins: [plugin] })
const source = (body: string) => `import { useBox } from '@acme/box'
import { Stack, Text, Field, For } from '@pyreon/primitives'
export function App() { const box = useBox(); return ${body} }`

describe('plugin callback and native field bindings', () => {
  it('dispatches a native field binding only through the value owner', () => {
    const src = source('<Field value={box.text} />')
    expect(compiler.transform(src, { target: 'swift' }).code).toContain('text: box.textBinding')
    const kotlin = compiler.transform(src, { target: 'kotlin' }).code
    expect(kotlin).toContain('value = box.text')
    expect(kotlin).toContain('onValueChange = { box.write(it) }')
    for (const target of ['swift', 'kotlin'] as const) {
      const foreign = compiler.transform(source('<Field value={other.text} />'), { target }).code
      expect(foreign).not.toContain('textBinding')
      expect(foreign).not.toContain('box.write')
    }
  })

  it('owns rows for both accessor spellings and restores an enclosing row after a nested unrelated For', () => {
    for (const each of ['box.rows', 'box.rows()'])
      for (const target of ['swift', 'kotlin'] as const) {
        const out = compiler.transform(
          source(`<For each={${each}} by={(i) => i.key}>{(row) => <Stack>
        <Text>{row.value()}</Text>
        <For each={other} by={(i) => i.key}>{(row) => <Text>{row.value()}</Text>}</For>
        <Text>{row.value()}</Text>
      </Stack>}</For>`),
          { target },
        ).code
        expect(out.match(/row\.value(?!\()/g)).toHaveLength(2)
        expect(out).toContain('row.value()')
      }
  })

  it('restores receiver identities after nested bindings and throws, including duplicate names', () => {
    const outer = scoped('row')
    const scope = createPluginScope([outer])
    expect(() =>
      scope.withBindings([{ name: 'row', declaration: scoped('row') }, { name: 'row' }], () => {
        expect(scope.declByName('row')).toBeUndefined()
        scope.withBindings([{ name: 'row', declaration: scoped('row') }], () =>
          expect(scope.declByName('row')).toBeDefined(),
        )
        expect(scope.declByName('row')).toBeUndefined()
        throw new Error('intentional callback failure')
      }),
    ).toThrow('intentional callback failure')
    expect(scope.declByName('row')).toBe(outer)
    expect(() => scope.withBindings([{ name: 'other', declaration: outer }], () => '')).toThrow(
      'must match',
    )
    expect(scope.declByName('other')).toBeUndefined()
  })

  it('scopes receiver and type evidence through the real emit facade, restoring both on throw', () => {
    const observed: string[] = []
    const declaration: DeclEmitter = {
      ...box,
      swift(d, ctx) {
        return check(d, ctx)
      },
      kotlin(d, ctx) {
        return check(d, ctx)
      },
    }
    function check(d: ExtDecl, ctx: EmitContext): string {
      expect(ctx.inferType({ kind: 'identifier', name: 'temp' }).kind).toBe('unknown')
      expect(() =>
        ctx.withBindings(
          [{ name: 'temp', type: { kind: 'string' }, declaration: scoped('temp') }],
          () => {
            observed.push(ctx.expr(member('temp', 'test')))
            expect(ctx.inferType({ kind: 'identifier', name: 'temp' }).kind).toBe('string')
            ctx.withBindings([{ name: 'temp' }], () => {
              expect(ctx.inferType({ kind: 'identifier', name: 'temp' }).kind).toBe('unknown')
              observed.push(ctx.expr(member('temp', 'test')))
            })
            observed.push(ctx.expr(member('temp', 'test')))
            throw new Error('scope failed')
          },
        ),
      ).toThrow('scope failed')
      observed.push(ctx.expr(member('temp', 'test')))
      expect(ctx.inferType({ kind: 'identifier', name: 'temp' }).kind).toBe('unknown')
      return ctx.target === 'swift' ? box.swift(d, ctx) : (box.kotlin(d, ctx) as string)
    }
    const c = createCompiler({
      plugins: [{ ...plugin, decls: { ...plugin.decls, box: declaration } }],
    })
    for (const target of ['swift', 'kotlin'] as const)
      c.transform(source('<Text>x</Text>'), { target })
    expect(observed).toEqual([
      'owned_temp_test',
      'temp.test',
      'owned_temp_test',
      'temp.test',
      'owned_temp_test',
      'temp.test',
      'owned_temp_test',
      'temp.test',
    ])
  })

  it('parses callback destructuring through the shared function builder', () => {
    const parsed: unknown[] = []
    const c = createCompiler({
      plugins: [
        {
          ...plugin,
          calls: {
            useBox(_call, ctx) {
              parsed.push(ctx.functionDeclaration('callback', ctx.args[0]!))
              return { type: 'box' }
            },
          },
        },
      ],
    })
    c.transform(
      source('<Text>x</Text>').replace('useBox()', 'useBox(({ text }) => console.log(text))'),
      { target: 'swift' },
    )
    expect(parsed[0]).toMatchObject({
      params: [{ name: '__p0' }],
      body: expect.arrayContaining([
        {
          kind: 'let',
          name: 'text',
          expr: { kind: 'member', object: { kind: 'identifier', name: '__p0' }, property: 'text' },
        },
      ]),
    })
  })
})

describe('callback binding extension contracts', () => {
  it('emits early lifecycle contributions exactly once, in order before mount hooks', () => {
    const c = createCompiler({
      plugins: [
        {
          ...plugin,
          calls: {
            useBox: (_call, ctx) => ({
              type: ctx.stringLiteralArg(0) === 'first' ? 'early' : 'box',
            }),
          },
          decls: {
            box: {
              ...box,
              lifecycle: {
                earlyOrder: 2,
                swift: (d) => [`.onAppear { ${d.name}.early() }`],
                kotlin: (d) => [`${d.name}.early()`],
              },
            },
            early: {
              ...box,
              lifecycle: {
                earlyOrder: -1,
                swift: (d) => [`.onAppear { ${d.name}.early() }`],
                kotlin: (d) => [`${d.name}.early()`],
              },
            },
          },
        },
      ],
    })
    const src = source('<Text>x</Text>').replace(
      'const box = useBox();',
      'const first = useBox(); const second = useBox("first"); const third = useBox(); onMount(() => console.log("mount"));',
    )
    for (const target of ['swift', 'kotlin'] as const) {
      const out = c.transform(src, { target }).code
      expect(out.match(/first\.early\(\)/g)).toHaveLength(1)
      expect(out.match(/second\.early\(\)/g)).toHaveLength(1)
      expect(out.indexOf('second.early()')).toBeLessThan(out.indexOf('first.early()'))
      expect(out.indexOf('first.early()')).toBeLessThan(out.indexOf('third.early()'))
      expect(out.indexOf('third.early()')).toBeLessThan(
        out.indexOf(target === 'swift' ? 'print("mount")' : 'println("mount")'),
      )
    }
  })

  it('exposes module-item validators and follows renamed payload links without naming a library', () => {
    const seen: string[] = []
    const c = createCompiler({
      plugins: [
        {
          ...plugin,
          topLevel(node) {
            const d = (
              node as unknown as {
                declarations?: { id?: { name?: string }; init?: { callee?: { name?: string } } }[]
              }
            ).declarations?.[0]
            return d?.id?.name && d.init?.callee?.name === 'defineUnit'
              ? { type: 'unit', name: d.id.name, payload: {} }
              : undefined
          },
          items: {
            unit: {
              bindings: {
                names: (item) => [item.name],
                reserved: () => [],
                rename: (item, renames) => {
                  item.name = renames.get(item.name) ?? item.name
                },
              },
              fieldValidators: {
                declaredBy: 'defineUnit',
                fields: () => ['label'],
                swift: (item, field, value) => `${item.name}.swiftCheck(${field}, ${value})`,
                kotlin: (item, field, value) => `${item.name}.kotlinCheck(${field}, ${value})`,
              },
              swift: () => [],
              kotlin: () => [],
            },
          },
          calls: { useBox: () => ({ type: 'box', payload: { unit: 'Unit' } }) },
          decls: {
            box: {
              ...box,
              rename(d, renames) {
                const payload = d.payload as unknown as { unit: string }
                payload.unit = renames.get(payload.unit) ?? payload.unit
              },
              swift(d, ctx) {
                return inspect(d, ctx)
              },
              kotlin(d, ctx) {
                return inspect(d, ctx)
              },
            },
          },
        },
      ],
    })
    function inspect(d: ExtDecl, ctx: EmitContext): string {
      const provider = ctx.fieldValidators(d.payload.unit as string)
      expect(provider?.fields).toEqual(['label'])
      expect(ctx.fieldValidators('missing')).toBeUndefined()
      expect(ctx.fieldValidatorsAdvice()).toBe('defineUnit')
      seen.push(provider!.body('label', 'v'))
      expect(d.payload.unit).not.toBe('Unit')
      return ctx.target === 'swift' ? box.swift(d, ctx) : (box.kotlin(d, ctx) as string)
    }
    const src =
      `type Unit = { label: string }; const Unit = defineUnit(); ` + source('<Text>x</Text>')
    for (const target of ['swift', 'kotlin'] as const) c.transform(src, { target })
    expect(seen[0]).toContain('.swiftCheck(label, v)')
    expect(seen[1]).toContain('.kotlinCheck(label, v)')
  })

  it('rejects malformed binding hooks and ambiguous lifecycle placement at load time', () => {
    for (const [field, value] of [
      ['iteration', 1],
      ['rename', true],
      ['valueBinding', {}],
      ['lifecycle', { earlyOrder: NaN }],
      ['lifecycle', { earlyOrder: 0, tailOrder: 2 }],
    ] as const) {
      expect(() =>
        assertPluginShape({ ...plugin, decls: { box: { ...box, [field]: value } } }),
      ).toThrow(/iteration|rename|valueBinding|earlyOrder/)
    }
    expect(() => assertPluginShape(plugin)).not.toThrow()
  })
})

describe('iteration declaration validation', () => {
  it('uses the owning declaration namespace and rejects non-JSON row payloads', () => {
    const src = source(
      '<For each={box.rows} by={(r) => r.key}>{(row) => <Text>{row.value()}</Text>}</For>',
    )
    for (const iteration of [
      () => ({ type: 'missing' }),
      () => ({ type: 'row', payload: { value: NaN } }),
    ]) {
      const c = createCompiler({
        plugins: [{ ...plugin, decls: { ...plugin.decls, box: { ...box, iteration } } }],
      })
      expect(() => c.transform(src, { target: 'swift' })).toThrow(
        /decls.missing|payload that is not JSON/,
      )
    }
  })
})
