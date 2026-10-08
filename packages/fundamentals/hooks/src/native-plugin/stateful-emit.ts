import type {
  DeclEmitter,
  EmitContext,
  ExtDecl,
  ExprIR,
  ReceiverLowering,
  ReceiverSite,
  CompilerModule,
  CompilerContext,
  DeclIR,
} from '@pyreon/native-compiler/plugin-api'
import type { PureStateData, DebouncedData, RateData, TimerData } from './stateful-types'

const PURE = 'pure-state'
const DEBOUNCED = 'debounced-value'
const RATE = 'rate-limited'
const TIMER = 'tick'
const OWNER = '@pyreon/hooks'
const SEEDS = `${OWNER}:debounced-seeds`
const data = <T>(decl: ExtDecl): T => decl.payload as unknown as T
const literal = (value: number | boolean, floating?: boolean): string => {
  const text = String(value)
  if (typeof value !== 'number' || !Number.isInteger(value)) return text
  return floating === true ? (/e/i.test(text) ? text : `${text}.0`) : `${text}L`
}
const clamp = (
  expr: string,
  bounds: PureStateData['bounds'],
  ctx: EmitContext,
  floating?: boolean,
): string => {
  const lit = (value: number) => (ctx.target === 'swift' ? String(value) : literal(value, floating))
  const min = ctx.target === 'swift' ? 'min' : 'minOf'
  const max = ctx.target === 'swift' ? 'max' : 'maxOf'
  let out = expr
  if (bounds?.min !== undefined) out = `${max}(${out}, ${lit(bounds.min)})`
  if (bounds?.max !== undefined) out = `${min}(${out}, ${lit(bounds.max)})`
  return out
}

export const pureStateDecl: DeclEmitter = {
  legacyKind: PURE,
  swift: (decl, ctx) => {
    const payload = data<PureStateData>(decl)
    const type =
      payload.hook === 'useToggle' ? 'Bool' : payload.floating === true ? 'Double' : 'Int'
    return `@State private var ${ctx.ident(decl.name)}: ${type} = ${String(payload.initial)}`
  },
  kotlin: (decl, ctx) => {
    const payload = data<PureStateData>(decl)
    return `var ${ctx.ident(decl.name)} by remember { mutableStateOf(${literal(payload.initial, payload.floating)}) }`
  },
}
function mutation(site: ReceiverSite, ctx: EmitContext): string | undefined {
  if (
    site.kind !== 'call' ||
    site.expr.callee.kind !== 'member' ||
    site.expr.callee.object.kind !== 'identifier'
  )
    return undefined
  const payload = data<PureStateData>(site.receiver)
  const field = ctx.ident(site.receiver.name)
  const method = site.expr.callee.property
  const value = site.expr.args[0]
  const arg =
    value === undefined
      ? undefined
      : ctx.argument(value, payload.floating === true ? { kind: 'number', float: true } : undefined)
  if (payload.hook === 'useToggle') {
    if (method === 'value') return field
    if (method === 'toggle')
      return ctx.target === 'swift' ? `${field}.toggle()` : `${field} = !${field}`
    if (method === 'setTrue') return `${field} = true`
    if (method === 'setFalse') return `${field} = false`
  } else {
    const one = ctx.target === 'swift' ? '1' : payload.floating === true ? '1.0' : '1L'
    const zero = ctx.target === 'swift' ? '0' : payload.floating === true ? '0.0' : '0L'
    const bound = (expr: string) => clamp(expr, payload.bounds, ctx, payload.floating)
    if (method === 'count') return field
    if (method === 'inc') return `${field} = ${bound(`${field} + ${arg ?? one}`)}`
    if (method === 'dec') return `${field} = ${bound(`${field} - ${arg ?? one}`)}`
    if (method === 'set') return `${field} = ${bound(arg ?? zero)}`
    if (method === 'reset')
      return `${field} = ${bound(ctx.target === 'swift' ? String(payload.initial) : literal(payload.initial, payload.floating))}`
  }
  return undefined
}
export const pureStateReceiver: ReceiverLowering = {
  swift: { expr: mutation },
  kotlin: { expr: mutation },
}

export const debouncedDecl: DeclEmitter = {
  legacyKind: DEBOUNCED,
  swift: (decl, ctx) => {
    const payload = data<DebouncedData>(decl)
    const inferred = ctx.inferType(payload.source)
    const type = ctx.typeText(inferred.kind === 'unknown' ? payload.type : inferred)
    const seed =
      ctx
        .fileState<Map<string, Map<string, ExprIR>>>(SEEDS, () => new Map())
        .get(ctx.component().name)
        ?.get(decl.name) ?? payload.source
    return `@State private var ${ctx.ident(decl.name)}: ${type} = ${ctx.expr(seed, 2)}`
  },
  kotlin: (decl, ctx) =>
    `var ${ctx.ident(decl.name)} by remember { mutableStateOf(${ctx.expr(data<DebouncedData>(decl).source, 2)}) }`,
  lifecycle: {
    stableHost: true,
    earlyOrder: 20,
    swift: (decl, ctx) => {
      const payload = data<DebouncedData>(decl)
      const source = ctx.expr(payload.source, 8)
      return [
        `.task(id: ${source}) {`,
        `  try? await _Concurrency.Task.sleep(nanoseconds: ${payload.delayMs}_000_000)`,
        `  if _Concurrency.Task.isCancelled { return }`,
        `  ${ctx.ident(decl.name)} = ${source}`,
        '}',
      ]
    },
    kotlin: (decl, ctx) => {
      const payload = data<DebouncedData>(decl)
      const source = ctx.expr(payload.source, 4)
      return [
        `LaunchedEffect(${source}) {`,
        `  delay(${payload.delayMs}L)`,
        `  ${ctx.ident(decl.name)} = ${source}`,
        '}',
      ]
    },
  },
}
export const rateDecl: DeclEmitter = {
  legacyKind: RATE,
  swift: (decl, ctx) => {
    const payload = data<RateData>(decl)
    const parameter = payload.fn.params[0]
    const cls = payload.mode === 'debounce' ? 'PyreonDebounced' : 'PyreonThrottled'
    const label = payload.mode === 'debounce' ? 'delayMs' : 'waitMs'
    return `@State private var ${ctx.ident(decl.name)} = ${cls}<${parameter === undefined ? 'Void' : ctx.typeText(parameter.type)}>(${label}: ${payload.delayMs})`
  },
  kotlin: (decl, ctx) => {
    const payload = data<RateData>(decl)
    const parameter = payload.fn.params[0]
    const cls = payload.mode === 'debounce' ? 'PyreonDebounced' : 'PyreonThrottled'
    const hasReturn = JSON.stringify(payload.fn.body).includes('"kind":"return"')
    const body = ctx.statements(payload.fn.body, 4, new Map(payload.fn.params.map(p => [p.name, p.type])), hasReturn ? { kotlin: { returnLabel: '__pyreonRateAction', discardReturnValue: true } } : undefined).join('; ')
    return `val ${ctx.ident(decl.name)} = remember { ${cls}<${parameter === undefined ? 'Unit' : ctx.typeText(parameter.type)}>(${payload.delayMs}L, PyreonTaskScheduler()) ${hasReturn ? '__pyreonRateAction@ ' : ''}{ ${parameter === undefined ? '_' : ctx.ident(parameter.name)} -> ${body} } }`
  },
  lifecycle: {
    stableHost: true,
    earlyOrder: -10,
    swift: (decl, ctx) => {
      const payload = data<RateData>(decl)
      const parameter = payload.fn.params[0]
      const body = ctx.statements(payload.fn.body, 8).join('; ')
      return [
        '.onAppear {',
        `  ${ctx.ident(decl.name)}.action = { ${parameter === undefined ? '_' : ctx.ident(parameter.name)} in ${body} }`,
        '}',
      ]
    },
  },
}
export const timerDecl: DeclEmitter = {
  legacyKind: TIMER,
  legacyName: false,
  lifecycleOnly: true,
  swift: () => '',
  kotlin: () => '',
  lifecycle: {
    stableHost: true,
    earlyOrder: 10,
    swift: (decl, ctx) => {
      const payload = data<TimerData>(decl)
      const body = ctx.statements(payload.body, 10)
      const sleep = `try? await _Concurrency.Task.sleep(nanoseconds: ${payload.delayMs}_000_000)`
      return payload.mode === 'interval'
        ? [
            '.task {',
            '  while !_Concurrency.Task.isCancelled {',
            `    ${sleep}`,
            '    if _Concurrency.Task.isCancelled { break }',
            ...body.map((line) => `    ${line}`),
            '  }',
            '}',
          ]
        : [
            '.task {',
            `  ${sleep}`,
            '  if _Concurrency.Task.isCancelled { return }',
            ...body.map((line) => `    ${line}`),
            '}',
          ]
    },
    kotlin: (decl, ctx) => {
      const payload = data<TimerData>(decl)
      const body = ctx.statements(payload.body, 6)
      return payload.mode === 'interval'
        ? [
            'LaunchedEffect(Unit) {',
            '  while (true) {',
            `    delay(${payload.delayMs}L)`,
            ...body.map((line) => `    ${line}`),
            '  }',
            '}',
          ]
        : [
            'LaunchedEffect(Unit) {',
            `  delay(${payload.delayMs}L)`,
            ...body.map((line) => `    ${line}`),
            '}',
          ]
    },
  },
}

/** Retain source seeds without capturing an emitter context or another component's bindings. */
export function prepareStateful(
  input: import('@pyreon/native-compiler/plugin-api').EmitPreparationInput,
  ctx: EmitContext,
): void {
  const components = ctx.fileState<Map<string, Map<string, ExprIR>>>(SEEDS, () => new Map())
  for (const component of input.components) {
    const seeds = new Map<string, ExprIR>()
    for (const decl of component.decls) {
      if (decl.kind !== 'ext' || decl.plugin !== OWNER || decl.type !== DEBOUNCED) continue
      const source = data<DebouncedData>(decl).source
      if (source.kind !== 'call' || source.callee.kind !== 'identifier') continue
      const sourceName = source.callee.name
      const signal = component.decls.find((d) => d.kind === 'signal' && d.name === sourceName)
      if (signal?.kind === 'signal') seeds.set(decl.name, signal.initial)
    }
    components.set(component.name, seeds)
  }
}

/** The corrected-parent counter policy, now evaluated through public pass inference. */
export function refineCounters(module: CompilerModule, ctx: CompilerContext): void {
  for (const component of module.components) {
    const counters = new Map(
      component.decls
        .filter(
          (d): d is ExtDecl =>
            d.kind === 'ext' &&
            d.plugin === OWNER &&
            d.type === PURE &&
            typeof data<PureStateData>(d).initial === 'number',
        )
        .map((decl) => [decl.name, data<PureStateData>(decl)]),
    )
    if (counters.size === 0) continue
    for (const counter of counters.values()) {
      if (
        (typeof counter.initial === 'number' && !Number.isSafeInteger(counter.initial)) ||
        (counter.bounds?.min !== undefined && !Number.isSafeInteger(counter.bounds.min)) ||
        (counter.bounds?.max !== undefined && !Number.isSafeInteger(counter.bounds.max))
      )
        counter.floating = true
    }
    const visit = (
      value: unknown,
      locals: ReadonlyMap<string, import('@pyreon/native-compiler/plugin-api').TypeIR>,
    ): void => {
      if (Array.isArray(value)) {
        for (const child of value) visit(child, locals)
        return
      }
      if (value === null || typeof value !== 'object') return
      const node = value as Record<string, unknown>
      if (node.kind === 'function') {
        const fn = value as Extract<DeclIR, { kind: 'function' }>
        locals = new Map([...locals, ...fn.params.map((p) => [p.name, p.type] as const)])
      }
      if (node.kind === 'call') {
        const call = value as Extract<ExprIR, { kind: 'call' }>
        if (
          call.callee.kind === 'member' &&
          call.callee.object.kind === 'identifier' &&
          ['inc', 'dec', 'set'].includes(call.callee.property)
        ) {
          const counter = counters.get(call.callee.object.name)
          const arg = call.args[0]
          if (counter !== undefined && arg !== undefined) {
            const type = ctx.inferType(module, arg, component, locals)
            if (
              (type.kind === 'number' && type.float === true) ||
              (arg.kind === 'literal' &&
                typeof arg.value === 'number' &&
                !Number.isSafeInteger(arg.value))
            )
              counter.floating = true
          }
        }
      }
      for (const child of Object.values(node)) visit(child, locals)
    }
    visit(component, new Map())
  }
}
