import { createCompiler } from '../compiler'
import type { EmitContext } from '../emit-context'
import type { JsxElementIR } from '../types'
import type { CompilerPlugin } from '../plugin'

describe.each(['swift', 'kotlin'] as const)('custom provider scope on %s', (target) => {
  function fixture(visits: string[]): CompilerPlugin {
    const read = (ctx: EmitContext) => ctx.colorScope<{ label: string }>()?.label ?? 'none'
    const render = (el: JsxElementIR, ctx: EmitContext): string =>
      ctx.withColorScope(el, () => {
        const wrapper = target === 'swift' ? 'Group' : 'Column'
        return `${wrapper} {\n${el.children.map((child) => ctx.pad(ctx.indent + 2) + ctx.child(child, ctx.indent + 2)).join('\n')}\n${ctx.pad()}}`
      })
    const probe = (_el: JsxElementIR, ctx: EmitContext): string => {
      visits.push(read(ctx))
      return `Text(${ctx.stringLiteral(read(ctx))})`
    }
    const recover = (el: JsxElementIR, ctx: EmitContext): string => {
      visits.push(read(ctx))
      try {
        ctx.withColorScope({ ...el, tag: 'Bomb' }, () => {
          visits.push(read(ctx))
          throw new Error('scope control')
        })
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'scope control') throw error
      }
      visits.push(read(ctx))
      return probe(el, ctx)
    }
    return {
      name: '@acme/scope',
      apiVersion: 2,
      modules: ['@acme/scope'],
      scopes: [
        {
          module: '@acme/scope',
          tags: ['Outer', 'Inner', 'Bomb'],
          enter: (el) => ({ label: el.tag }),
        },
      ],
      elements: [
        {
          module: '@acme/scope',
          tags: ['Outer', 'Inner'],
          aliasable: true,
          emit: { swift: render, kotlin: render },
        },
        { module: '@acme/scope', tags: ['Probe'], emit: { swift: probe, kotlin: probe } },
        { module: '@acme/scope', tags: ['Recover'], emit: { swift: recover, kotlin: recover } },
      ],
    }
  }

  it('enters nested scopes and restores outer and sibling reads', () => {
    const visits: string[] = []
    createCompiler({ discovered: [fixture(visits)] }).transform(
      `
      import { Outer, Inner, Probe } from '@acme/scope'
      export function App() { return <><Outer><Probe/><Inner><Probe/></Inner><Probe/></Outer><Probe/></> }
    `,
      { target },
    )
    expect(visits).toEqual(['Outer', 'Inner', 'Outer', 'none'])
  })

  it('restores the enclosing scope when custom emission throws', () => {
    const visits: string[] = []
    createCompiler({ discovered: [fixture(visits)] }).transform(
      `
      import { Outer, Probe, Recover } from '@acme/scope'
      export function App() { return <><Outer><Recover/><Probe/></Outer><Probe/></> }
    `,
      { target },
    )
    expect(visits).toEqual(['Outer', 'Bomb', 'Outer', 'Outer', 'Outer', 'none'])
  })
  it('enters an aliased owner scope and leaves a foreign alias unclaimed', () => {
    for (const from of ['@acme/scope', '@other/scope']) {
      const visits: string[] = []
      createCompiler({ plugins: [fixture(visits)] }).transform(
        `import { Outer as Alias } from '${from}'; import { Probe } from '@acme/scope'; export function App() { return <><Alias><Probe/></Alias><Probe/></> }`,
        { target },
      )
      expect(visits).toEqual(from === '@acme/scope' ? ['Alias', 'none'] : ['none', 'none'])
    }
  })
})
