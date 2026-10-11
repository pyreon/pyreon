import type { CallRecognizer } from '@pyreon/native-compiler/plugin-api'
import { spec, type AnyNode, type PureStateData } from './stateful-types'

export const recognizeStateful: CallRecognizer = (call, ctx) => {
  const name = ctx.declName
  const calleeName = call.callee
  const init = { arguments: ctx.args as readonly AnyNode[] }
  const unwrapTypeLayers = (node: AnyNode | undefined): AnyNode | undefined =>
    ctx.unwrap(node) as AnyNode | undefined
  if (calleeName === 'useToggle' || calleeName === 'useCounter') {
    const firstArg = init.arguments?.[0] as AnyNode | undefined
    const initialNode = firstArg ? unwrapTypeLayers(firstArg) : undefined
    if (calleeName === 'useToggle') {
      // Default `false`, per the web signature.
      let initial = false
      if (initialNode !== undefined) {
        if (initialNode.type !== 'Literal' || typeof initialNode.value !== 'boolean') {
          ctx.report(
            `useToggle() \`${name}\`: the initial value must be a boolean literal to bake into the native state — this one is not, so the declaration is NOT lowered.`,
          )
          return null
        }
        initial = initialNode.value as boolean
      }
      return spec('pure-state', { hook: 'useToggle', initial })
    }
    let initial = 0
    if (initialNode !== undefined) {
      if (initialNode.type !== 'Literal' || typeof initialNode.value !== 'number') {
        ctx.report(
          `useCounter() \`${name}\`: the initial value must be a numeric literal to bake into the native state — this one is not, so the declaration is NOT lowered.`,
        )
        return null
      }
      initial = initialNode.value as number
    }
    // The clamp is baked into every mutator at the use site, so it has to be
    // literal. A computed bound would silently stop clamping on device.
    const bounds: { min?: number; max?: number } = {}
    const optsNode = init.arguments?.[1] as AnyNode | undefined
    const opts = optsNode ? unwrapTypeLayers(optsNode) : undefined
    if (opts !== undefined) {
      if (opts.type !== 'ObjectExpression') {
        ctx.report(
          `useCounter() \`${name}\`: the options argument must be a literal { min, max } object — this one is not, so the declaration is NOT lowered.`,
        )
        return null
      }
      for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
        if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
        const key = ctx.propKey(prop)
        const val = unwrapTypeLayers(prop.value as AnyNode | undefined)
        if (
          (key !== 'min' && key !== 'max') ||
          val?.type !== 'Literal' ||
          typeof val.value !== 'number'
        ) {
          ctx.report(
            `useCounter() \`${name}\`: option \`${key ?? (ctx.hasDynamicKey(prop) ? ctx.dynamicKeyText(prop) : '?')}\` is not a numeric literal, so the clamp cannot be baked into the native mutators and the declaration is NOT lowered.`,
          )
          return null
        }
        bounds[key] = val.value as number
      }
    }
    const decl: PureStateData = { hook: 'useCounter', initial }
    if (bounds.min !== undefined || bounds.max !== undefined) decl.bounds = bounds
    return spec('pure-state', decl)
  }
  // `useDebouncedValue(() => expr, ms)` — see the DeclIR comment for the
  // measured contract this reproduces.
  if (calleeName === 'useDebouncedValue') {
    const getter = unwrapTypeLayers(init.arguments?.[0] as AnyNode | undefined)
    const delayNode = unwrapTypeLayers(init.arguments?.[1] as AnyNode | undefined)
    if (
      (getter?.type !== 'ArrowFunctionExpression' && getter?.type !== 'FunctionExpression') ||
      getter.body?.type === 'BlockStatement'
    ) {
      ctx.report(
        `useDebouncedValue() \`${name}\`: the source must be an expression-body getter (\`() => expr\`) to lower natively — this one is not, so the declaration is NOT lowered.`,
      )
      return null
    }
    if (delayNode?.type !== 'Literal' || typeof delayNode.value !== 'number') {
      ctx.report(
        `useDebouncedValue() \`${name}\`: the delay must be a numeric literal to bake into the native schedule — this one is not, so the declaration is NOT lowered.`,
      )
      return null
    }
    const source = ctx.expr(getter.body as AnyNode)
    return spec('debounced-value', {
      source,
      type: ctx.initialType(source),
      delayMs: delayNode.value as number,
    })
  }
  // `useDebouncedCallback(fn, ms)` / `useThrottledCallback(fn, ms)` — see
  // the DeclIR comment for why these need a runtime.
  if (calleeName === 'useDebouncedCallback' || calleeName === 'useThrottledCallback') {
    const mode = calleeName === 'useDebouncedCallback' ? 'debounce' : 'throttle'
    const cb = unwrapTypeLayers(init.arguments?.[0] as AnyNode | undefined)
    const delayNode = unwrapTypeLayers(init.arguments?.[1] as AnyNode | undefined)
    if (cb?.type !== 'ArrowFunctionExpression' && cb?.type !== 'FunctionExpression') {
      ctx.report(
        `${calleeName}() \`${name}\`: the callback must be an inline function to lower natively — this one is not, so the declaration is NOT lowered.`,
      )
      return null
    }
    if (delayNode?.type !== 'Literal' || typeof delayNode.value !== 'number') {
      ctx.report(
        `${calleeName}() \`${name}\`: the delay must be a numeric literal to bake into the native schedule — this one is not, so the declaration is NOT lowered.`,
      )
      return null
    }
    const params = (cb.params as AnyNode[] | undefined) ?? []
    if (params.length > 1) {
      // Silently dropping the extra arguments would produce a callback that
      // runs with the wrong data rather than one that visibly does not run.
      ctx.report(
        `${calleeName}() \`${name}\`: the native runtime carries ONE argument and this callback takes ${params.length}, so the declaration is NOT lowered. Pass a single value (an object literal if you need several).`,
      )
      return null
    }
    const fn = ctx.functionDeclaration(name, cb)
    return spec('rate-limited', { mode, delayMs: delayNode.value as number, fn })
  }
  return undefined
}
