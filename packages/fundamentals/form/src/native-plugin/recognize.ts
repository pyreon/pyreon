import type {
  AstNode,
  CallRecognizer,
  ParseContext,
  ExtPayload,
  ExprIR,
} from '@pyreon/native-compiler/plugin-api'
import { FORM_TYPE, ARRAY_TYPE, type FormPayload } from './types'
type AnyNode = AstNode & Record<string, any>

export const recognizeForm: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const cfg = ctx.args[0] as AnyNode | undefined
  const decl: FormPayload = {
    initialValues: initialValues(cfg, ctx, {
      where: `useForm \`${name}\`: initialValues`,
    }),
  }
  // v2 (form-binding arc) — validators + onSubmit. Conservative:
  // unparseable members are skipped with a warning (the form still
  // works; that validator just doesn't run natively).
  if (cfg?.type === 'ObjectExpression') {
    for (const prop of (cfg.properties as AnyNode[] | undefined) ?? []) {
      if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
      if (ctx.hasDynamicKey(prop)) {
        ctx.warnDynamicKey(prop, `useForm \`${name}\`: config`)
        continue
      }
      const key = ctx.propKey(prop)
      // `schema: SomeSchema` — an identifier naming a top-level schema
      // declaration. Captured here; the emitters resolve it against the
      // module's plugin items and synthesize validators from its constraints.
      if (key === 'schema' && prop.value?.type === 'Identifier') {
        decl.schemaName = prop.value.name as string
      }
      if (key === 'validators' && prop.value?.type === 'ObjectExpression') {
        const validators: { key: string; param: string; body: ExprIR }[] = []
        for (const v of (prop.value.properties as AnyNode[] | undefined) ?? []) {
          if (v?.type !== 'Property' && v?.type !== 'ObjectProperty') continue
          const fieldName = ctx.propKey(v)
          const fn = v.value as AnyNode | undefined
          if (
            fieldName === undefined ||
            fn?.type !== 'ArrowFunctionExpression' ||
            (fn.params as AnyNode[] | undefined)?.length !== 1 ||
            fn.body?.type === 'BlockStatement'
          ) {
            ctx.report(
              `useForm \`${name}\`: validator \`${fieldName ?? ctx.dynamicKeyText(v)}\` must be a single-param expression-body arrow returning '' (valid) or a message — skipped natively.`,
            )
            continue
          }
          const param = ((fn.params as AnyNode[])[0] as AnyNode | undefined)?.name as
            | string
            | undefined
          if (param === undefined) continue
          validators.push({ key: fieldName, param, body: ctx.expr(fn.body) })
        }
        if (validators.length > 0) decl.validators = validators
      } else if (key === 'onSubmit' && prop.value?.type === 'ArrowFunctionExpression') {
        const fn = ctx.functionDeclaration('__onSubmit', prop.value)
        decl.onSubmit = { param: fn.params[0]?.name ?? 'values', body: fn.body }
      }
    }
  }
  return { type: FORM_TYPE, payload: decl as unknown as ExtPayload }
}

function initialValues(
  arg: AnyNode | undefined,
  ctx: ParseContext,
  report: { where: string },
): { key: string; value: string }[] {
  if (!arg || arg.type !== 'ObjectExpression') return []
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return []
  const ivProp = props.find((p) => p?.type === 'Property' && ctx.propKey(p) === 'initialValues')
  if (!ivProp || ivProp.value?.type !== 'ObjectExpression') return []
  const out: { key: string; value: string }[] = []
  for (const p of (ivProp.value.properties as AnyNode[] | undefined) ?? []) {
    if (p?.type !== 'Property') continue
    if (ctx.hasDynamicKey(p)) {
      ctx.warnDynamicKey(p, report.where)
      continue
    }
    // Object keys are Identifiers (`email:`) or string literals (`'email':`).
    const key = ctx.propKey(p)
    const v = p.value
    if (
      key !== undefined &&
      (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
      typeof v.value === 'string'
    ) {
      out.push({ key, value: v.value })
    }
  }
  return out
}

export const recognizeFieldArray: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const arg = ctx.args[0]
  const initial: string[] = []
  if (arg !== undefined) {
    if (arg.type !== 'ArrayExpression') {
      ctx.report(
        `Declaration ${name}: useFieldArray initial must be an array literal of strings (or omitted); got ${arg.type}.`,
      )
      return null
    }
    for (const el of (arg.elements as AnyNode[] | undefined) ?? []) {
      if (
        (el?.type === 'Literal' || el?.type === 'StringLiteral') &&
        typeof el.value === 'string'
      ) {
        initial.push(el.value as string)
      } else {
        ctx.report(
          `Declaration ${name}: useFieldArray initial elements must be string literals; got ${el?.type ?? 'nothing'}.`,
        )
        return null
      }
    }
  }
  return { type: ARRAY_TYPE, payload: { initial } }
}
