// `createEmitContext` is the seam every plugin emits through. A real emitter supplies every optional member; a context
// built WITHOUT one (a unit harness, a future emitter wired partially) must fail by NAMING the member it lacks, not with
// `undefined is not a function` somewhere inside a plugin. This locks that contract for each optional member, and the
// pass-through of the members a backend always supplies.

import { describe, expect, it } from 'vitest'
import { createEmitContext, type EmitContextBackend } from '../emit-context'

function backend(): EmitContextBackend {
  const scope = {
    decls: (plugin: string, type: string) => `decls:${plugin}:${type}`,
    state: (key: string, init: () => unknown) => ({ key, v: init() }),
    deferred: (key: string, fallback: string) => `deferred:${key}:${fallback}`,
    resolveDeferred: (key: string, value: string) => `resolved:${key}:${value}`,
  }
  return {
    emit: (_el, at) => `emit@${at}`,
    staticAttr: (_el, name) => ({ kind: 'string', value: name }) as never,
    stringLiteral: (v) => `"${v}"`,
    identifier: (n) => `id_${n}`,
    warn: () => {},
    expr: (_e, at) => `expr@${at}`,
    exprAs: (_t, _e, at) => `exprAs@${at}`,
    scope: () => scope as never,
    stringAttr: (_el, name, at) => `${name}@${at}`,
    layoutModifiers: () => '.mods',
    action: (_h, at) => `action@${at}`,
    constExpr: () => undefined,
    colorScope: () => ({ mode: 'dark' }),
  }
}

const el = {} as never
const e = {} as never

describe('a context built without an optional member names that member', () => {
  const ctx = createEmitContext('swift', backend(), 4)
  const cases: [string, () => unknown][] = [
    ['memberScope', () => ctx.memberScope({} as never, () => 1)],
    ['functionDeclaration', () => ctx.functionDeclaration({} as never)],
    ['observableIdent', () => ctx.observableIdent('x')],
    ['withBindings', () => ctx.withBindings({} as never, () => '')],
    ['fieldValidators', () => ctx.fieldValidators('x')],
    ['fieldValidatorsAdvice', () => ctx.fieldValidatorsAdvice()],
    ['argument', () => ctx.argument(e, undefined)],
    ['withColorScope', () => ctx.withColorScope(el, () => '')],
    ['component', () => ctx.component()],
    ['isFunctionName', () => ctx.isFunctionName('f')],
    ['child', () => ctx.child({} as never)],
    ['generic', () => ctx.generic(el)],
    ['typeText', () => ctx.typeText({} as never)],
    ['rowType', () => ctx.rowType(el)],
    ['rowFields', () => ctx.rowFields(el)],
    ['inferType', () => ctx.inferType(e)],
    ['structs', () => ctx.structs.forTypeFields({} as never)],
    ['structs', () => ctx.structs.forLiteralFields({} as never)],
    ['structs', () => ctx.structs.synthesize({} as never)],
    ['warnOnce', () => ctx.warnOnce('m')],
    ['webView', () => ctx.webView.dynamicAttr({} as never, {} as never)],
    ['webView', () => ctx.webView.dataArg({} as never)],
    ['webView', () => ctx.webView.messageHandler({} as never)],
    ['webView', () => ctx.webView.grow({} as never, {} as never)],
    ['fileState', () => ctx.fileState('k', () => 1)],
    ['layoutModifiersFor', () => ctx.layoutModifiersFor(el, new Set())],
    ['statements', () => ctx.statements([], 0, new Set() as never)],
  ]
  for (const [name, call] of cases) {
    it(name, () => {
      expect(call).toThrow(`[Pyreon] this EmitContext was built without \`${name}\``)
    })
  }
})

describe('members a backend always supplies pass through, with the context indent as the default', () => {
  const ctx = createEmitContext('kotlin', backend(), 6)

  it('indent-defaulted members use the context indent, and an explicit one wins', () => {
    expect(ctx.emit(el)).toBe('emit@6')
    expect(ctx.emit(el, 2)).toBe('emit@2')
    expect(ctx.expr(e)).toBe('expr@6')
    expect(ctx.exprAs(undefined, e)).toBe('exprAs@6')
    expect(ctx.stringAttr(el, 'title')).toBe('title@6')
    expect(ctx.action(e)).toBe('action@6')
    expect(ctx.pad()).toBe('      ')
    expect(ctx.pad(2)).toBe('  ')
  })

  it('the rest delegate verbatim', () => {
    expect(ctx.target).toBe('kotlin')
    expect(ctx.indent).toBe(6)
    expect(ctx.stringLiteral('a')).toBe('"a"')
    expect(ctx.ident('when')).toBe('id_when')
    expect(ctx.layoutModifiers(el)).toBe('.mods')
    expect(ctx.constExpr('X')).toBeUndefined()
    expect(ctx.colorScope<{ mode: string }>()).toEqual({ mode: 'dark' })
    expect(ctx.decls('p', 't')).toBe('decls:p:t')
    expect(ctx.state('k', () => 3)).toEqual({ key: 'k', v: 3 })
    expect(ctx.deferred('k', 'f')).toBe('deferred:k:f')
    expect(ctx.resolveDeferred('k', 'v')).toBe('resolved:k:v')
  })

  it('an optional member the backend DOES supply is used instead of the refusal', () => {
    const full = createEmitContext('swift', { ...backend(), observableIdent: (n: string) => `obs_${n}`, warnOnce: () => {} } as never, 0)
    expect(full.observableIdent('x')).toBe('obs_x')
    expect(() => full.warnOnce('m')).not.toThrow()
  })
})
