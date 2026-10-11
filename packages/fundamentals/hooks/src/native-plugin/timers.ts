import type { CallRecognizer } from '@pyreon/native-compiler/plugin-api'
import { spec, type AnyNode } from './stateful-types'

export const recognizeTimer: CallRecognizer = (call, ctx) => {
  const cb = ctx.args[0] as AnyNode | undefined
  const delay = ctx.unwrap(ctx.args[1])
  if (cb?.type !== 'ArrowFunctionExpression' && cb?.type !== 'FunctionExpression') {
    ctx.report(
      `Component ${ctx.declName}: ${call.callee}() needs an inline callback to lower natively — this one is not, so it was DROPPED and will not run on device.`,
    )
    return null
  }
  if (delay?.type !== 'Literal' || typeof delay.value !== 'number') {
    ctx.report(
      `Component ${ctx.declName}: ${call.callee}() needs a literal millisecond delay to lower natively (a null/paused delay or a reactive getter cannot be baked into the native schedule), so it was DROPPED and will not run on device.`,
    )
    return null
  }
  const body = cb.body!
  return spec('tick', {
    mode: call.callee === 'useInterval' ? 'interval' : 'timeout',
    delayMs: delay.value,
    body:
      body.type === 'BlockStatement'
        ? ctx.statements(body)
        : [{ kind: 'expr', expr: ctx.expr(body) }],
  })
}
