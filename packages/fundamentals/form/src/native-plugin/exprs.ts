import type { ExprEmitter } from '@pyreon/native-compiler/plugin-api'

/**
 * The computed bodies `useWatch` / `useFormState` declare. Each carries its lowered read as its one argument (built by
 * the recognizer from the form's own reads), so the emit is that read; the form receiver spells it per target.
 */
const passThrough = (type: 'string' | 'boolean'): ExprEmitter => ({
  swift: (e, ctx) => ctx.expr(e.args[0]!),
  kotlin: (e, ctx) => ctx.expr(e.args[0]!),
  typing: { type: () => ({ kind: type }) },
})

/** `useWatch(form, 'field')`: the native form is string-valued. */
export const watchExpr = passThrough('string')
/** `useFormState(form, selector)`: a selector over boolean flags. */
export const formStateExpr = passThrough('boolean')
