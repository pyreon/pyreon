import type { ExtDecl, EmitContext, DeclEmitter } from '@pyreon/native-compiler/plugin-api'
import { formOf, arrayOf, FORM_PLUGIN, VALUES_TYPE, ROW_TYPE } from './types'

export function emitFormSwift(decl: ExtDecl, ctx: EmitContext): string {
  const d = { ...formOf(decl), name: decl.name }
  const parts: string[] = []
  if (d.initialValues.length) {
    parts.push(
      `initialValues: [${d.initialValues
        .map((p) => `${ctx.stringLiteral(p.key)}: ${ctx.stringLiteral(p.value)}`)
        .join(', ')}]`,
    )
  }
  // v2 (form-binding arc) — validators emit as Swift closures in the
  // init dictionary; "" = valid, anything else is the error message.
  if (d.validators !== undefined && d.validators.length > 0) {
    const entries = d.validators
      .map(
        (v) => `${ctx.stringLiteral(v.key)}: { ${ctx.ident(v.param)} in ${ctx.expr(v.body, 0)} }`,
      )
      .join(', ')
    parts.push(`validators: [${entries}]`)
  }
  // `schema: SomeSchema` — synthesize a validator per STRING field, each
  // delegating to the schema's own `validateField`. One source of truth for
  // what a constraint means, and it makes the option do on native what it
  // does on the web instead of being dropped in silence.
  //
  // Explicit `validators` win: they are per-field and more specific, so a
  // field carrying both keeps the hand-written one.
  if (d.schemaName !== undefined) {
    const provided = ctx.fieldValidators(d.schemaName)
    const fields = provided?.fields
    if (fields === undefined) {
      ctx.warn(
        `useForm({ schema: ${d.schemaName} }): no top-level ${ctx.fieldValidatorsAdvice() ?? 'schema'} declaration by that name is visible in this file, so NO native validators are synthesized and the form will accept input the web rejects. Declare the schema at module scope in the same file.`,
      )
    } else {
      const explicit = new Set((d.validators ?? []).map((v) => v.key))
      const entries = fields
        .filter((f) => !explicit.has(f))
        .map((f) => `${ctx.stringLiteral(f)}: { v in ${provided!.body(f, 'v')} }`)
      if (entries.length > 0) {
        const existing = parts.findIndex((p) => p.startsWith('validators: ['))
        if (existing >= 0) {
          parts[existing] = `${parts[existing]!.slice(0, -1)}, ${entries.join(', ')}]`
        } else {
          parts.push(`validators: [${entries.join(', ')}]`)
        }
      }
    }
  }
  // onSubmit is NOT an init argument on Swift: @State property
  // initializers run before `self` exists, and the callback's body
  // almost always captures instance members (`navigate`, store
  // writes). It attaches via `.onAppear { form.onSubmit = { … } }`
  // on the component body instead — see the post-body loop in
  // emitSwiftComponent (mirrors the useFetch `.task` harness).
  return `@State private var ${ctx.ident(d.name)} = PyreonForm(${parts.join(', ')})`
}

export function emitFormKotlin(decl: ExtDecl, ctx: EmitContext): string {
  const d = { ...formOf(decl), name: decl.name }
  const parts: string[] = []
  if (d.initialValues.length) {
    parts.push(
      `initialValues = mapOf(${d.initialValues
        .map((p) => `${ctx.stringLiteral(p.key)} to ${ctx.stringLiteral(p.value)}`)
        .join(', ')})`,
    )
  }
  // v2 (form-binding arc) — validators as Kotlin lambdas; "" = valid.
  if (d.validators !== undefined && d.validators.length > 0) {
    const entries = d.validators
      .map((v) => {
        // The lambda's parameter is declared `String`, so a `.length` in the
        // body is Kotlin's Int and must widen like any other string length
        // — bind the type for the body's inference, then release it.
        return ctx.withBindings(
          [{ name: v.param, type: { kind: 'string' } }],
          () =>
            `${ctx.stringLiteral(v.key)} to { ${ctx.ident(v.param)}: String -> ${ctx.expr(v.body, 0)} }`,
        )
      })
      .join(', ')
    parts.push(`validators = mapOf(${entries})`)
  }
  // `schema: SomeSchema` — mirror of the Swift wiring: one validator per
  // STRING field, delegating to the schema's own `validateField`. Explicit
  // `validators` win, being per-field and more specific.
  if (d.schemaName !== undefined) {
    const provided = ctx.fieldValidators(d.schemaName)
    const fields = provided?.fields
    if (fields === undefined) {
      ctx.warn(
        `useForm({ schema: ${d.schemaName} }): no top-level ${ctx.fieldValidatorsAdvice() ?? 'schema'} declaration by that name is visible in this file, so NO native validators are synthesized and the form will accept input the web rejects. Declare the schema at module scope in the same file.`,
      )
    } else {
      const explicit = new Set((d.validators ?? []).map((v) => v.key))
      const entries = fields
        .filter((f) => !explicit.has(f))
        .map((f) => `${ctx.stringLiteral(f)} to { v: String -> ${provided!.body(f, 'v')} }`)
      if (entries.length > 0) {
        const existing = parts.findIndex((p) => p.startsWith('validators = mapOf('))
        if (existing >= 0) {
          parts[existing] = `${parts[existing]!.slice(0, -1)}, ${entries.join(', ')})`
        } else {
          parts.push(`validators = mapOf(${entries.join(', ')})`)
        }
      }
    }
  }
  // onSubmit is deliberately NOT a constructor arg here — it is assigned
  // post-decl in the composable body (see the emit loop after declTexts).
  // Keeping both paths would let a self-referencing handler take the
  // constructor route and fail to compile again.
  return `val ${ctx.ident(d.name)} = remember { PyreonForm(${parts.join(', ')}) }`
}

const submit = (decl: ExtDecl, ctx: EmitContext): readonly string[] => {
  const callback = formOf(decl).onSubmit
  if (callback === undefined) return []
  const name = ctx.ident(decl.name)
  const binding: ExtDecl = {
    kind: 'ext',
    name: callback.param,
    plugin: FORM_PLUGIN,
    type: VALUES_TYPE,
    payload: {},
  }
  const at = ctx.target === 'swift' ? 10 : 4
  const body = ctx.withBindings([{ name: callback.param, declaration: binding }], () =>
    ctx.statements(callback.body, at),
  )
  return ctx.target === 'swift'
    ? [
        '.onAppear {',
        `  ${name}.onSubmit = { ${ctx.ident(callback.param)} in`,
        ...(body.length === 0 ? [''] : body.map((line) => `    ${line}`)),
        '  }',
        '}',
      ]
    : [
        `${name}.onSubmit = { ${ctx.ident(callback.param)} ->`,
        ...(body.length === 0 ? [''] : body.map((line) => `  ${line}`)),
        '}',
      ]
}

export const formDecl: DeclEmitter = {
  legacyKind: 'form',
  rename(decl, renames) {
    const d = formOf(decl)
    if (d.schemaName !== undefined) d.schemaName = renames.get(d.schemaName) ?? d.schemaName
  },
  lifecycle: { stableHost: true, earlyOrder: 0, swift: submit, kotlin: submit },
  swift: emitFormSwift,
  kotlin: emitFormKotlin,
}
export const fieldArrayDecl: DeclEmitter = {
  legacyKind: 'fieldArray',
  swift(decl, ctx) {
    const d = arrayOf(decl)
    const initial =
      d.initial.length === 0 ? '' : `[${d.initial.map((v) => ctx.stringLiteral(v)).join(', ')}]`
    return `@State private var ${ctx.ident(decl.name)} = PyreonFieldArray(${initial})`
  },
  kotlin(decl, ctx) {
    const d = arrayOf(decl)
    const initial =
      d.initial.length === 0
        ? ''
        : `listOf(${d.initial.map((v) => ctx.stringLiteral(v)).join(', ')})`
    return `val ${ctx.ident(decl.name)} = remember { PyreonFieldArray(${initial}) }`
  },
  iteration(source) {
    const e = source.kind === 'call' && source.args.length === 0 ? source.callee : source
    return e.kind === 'member' && e.object.kind === 'identifier' && e.property === 'items'
      ? { type: ROW_TYPE }
      : undefined
  },
}
