/**
 * `Intl.DateTimeFormat` / `Intl.NumberFormat` and the `toLocale*String` shapes,
 * lowered to the native formatters both runtimes ship (#3980).
 *
 * The compiler's one BUILT-IN plugin. Every other lowering belongs to a library
 * and is discovered from the package that owns it; `Intl` is part of the
 * JavaScript language and has no package to be discovered from, which is what
 * the `builtIn` slot exists for.
 *
 * ## What lowers
 *
 * - `new Intl.DateTimeFormat(locale?, options?)` / `new Intl.NumberFormat(…)`
 *   (with or without `new`) anywhere an expression may appear → the runtime's
 *   `PyreonDateTimeFormat` / `PyreonNumberFormat`.
 * - `fmt.format(x)` on such a formatter — bound to a `const` or inline — where
 *   `x` is epoch milliseconds (`Date.now()`, a number signal) or
 *   `new Date(ms)` / `new Date()`.
 * - `n.toLocaleString(locale?, options?)` on a number.
 * - `new Date(ms).toLocaleDateString(…)` / `.toLocaleTimeString(…)` /
 *   `.toLocaleString(…)`, with ECMA-402's per-method defaults.
 *
 * Natively a date is its epoch milliseconds: PMTC lowers no `Date` object, so a
 * `Date` reaches a formatter only as a `new Date(ms)` written AT the call. Any
 * other `Date` use stays the parser's named "class construction" warning.
 *
 * The option subset and why it is a skeleton are documented in
 * `intl-options.ts`; every unsupported option, value, member and method is a
 * NAMED warning.
 */

import type { CompilerPlugin } from './plugin'
import type {
  CallExprRecognizer,
  ExprEmitter,
  ExtExprIR,
  MethodCallRecognizer,
  ModuleParseContext,
} from './module-items'
import type { ModuleScanner } from './module-scan'
import type { EmitContext, KotlinEmitContext } from './emit-context'
import type { ExprIR, ExtPayload, TypeIR } from './types'
import { hasDynamicKey, staticPropKey, unwrapTypeLayers } from './plugin-ast'
import {
  planArguments,
  planDateTime,
  planNumber,
  type DateTimeEntry,
  type IntlOptionInput,
} from './intl-options'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const INTL_PLUGIN_NAME = 'ecmascript-intl'

/** `new Intl.X(…)` — the formatter object. */
const FORMATTER = 'intl-formatter'
/** `fmt.format(x)` / `n.toLocaleString(…)` / `date.toLocale*String(…)` — the formatted string. */
const FORMAT = 'intl-format'

const BINDINGS_KEY = `${INTL_PLUGIN_NAME}:bindings`

/** The two constructors that lower, by `Intl` member. */
const CONSTRUCTORS: Readonly<Record<string, 'datetime' | 'number'>> = {
  DateTimeFormat: 'datetime',
  NumberFormat: 'number',
}
/** Every other `Intl` member, so a call to one is named rather than emitted verbatim. */
const OTHER_INTL = new Set([
  'Collator',
  'DisplayNames',
  'DurationFormat',
  'ListFormat',
  'Locale',
  'PluralRules',
  'RelativeTimeFormat',
  'Segmenter',
  'getCanonicalLocales',
  'supportedValuesOf',
])

/** One constructor argument: a literal, or the runtime value in the ext node's `args[arg]`. */
type FormatterParam =
  | readonly [name: string, value: { readonly literal: string | number | boolean }]
  | readonly [name: string, value: { readonly arg: number }]

/**
 * What the emitters need, JSON-shaped for the IR. `params` is in the runtime
 * initializer's DECLARATION order, which Swift requires of labelled arguments.
 */
interface FormatterPayload {
  readonly formatter: 'datetime' | 'number'
  readonly params: readonly FormatterParam[]
}

/** `fmt.format(x)`: `args[0]` is the formatter (an identifier or an inline formatter), `args[1]` the value. */
interface FormatPayload {
  readonly formatter: 'datetime' | 'number'
}

const formatterPayload = (e: ExtExprIR): FormatterPayload => e.payload as unknown as FormatterPayload

/** The names a file binds to a formatter (`const fmt = new Intl.DateTimeFormat(…)`), by kind. */
const formatterBindings = (s: { fileState<T>(key: string, init: () => T): T }): Map<string, 'datetime' | 'number'> =>
  s.fileState(BINDINGS_KEY, () => new Map<string, 'datetime' | 'number'>())

/** `Intl.<member>` as written, or `undefined`. A local binding named `Intl` shadows the global. */
function intlMember(node: AnyNode, ctx: { binding(name: string): unknown } | undefined): string | undefined {
  const n = unwrapTypeLayers(node)
  if (n?.type !== 'MemberExpression' || n.computed === true) return undefined
  if (n.object?.type !== 'Identifier' || n.object.name !== 'Intl') return undefined
  if (ctx !== undefined && ctx.binding('Intl') !== undefined) return undefined
  return n.property?.type === 'Identifier' ? (n.property.name as string) : undefined
}

/** `new Intl.DateTimeFormat(…)` (or the call form) → its kind, without consulting a parse context. */
function formatterKindOf(node: AnyNode): 'datetime' | 'number' | undefined {
  const n = unwrapTypeLayers(node)
  if (n?.type !== 'NewExpression' && n?.type !== 'CallExpression') return undefined
  const member = intlMember(n.callee, undefined)
  return member !== undefined ? CONSTRUCTORS[member] : undefined
}

/**
 * Record every `const <name> = new Intl.DateTimeFormat(…)` in the file, at any
 * depth, so `name.format(x)` is recognized as a formatter call. Recorded per
 * FILE, not per scope: a different binding of the same name in another
 * component that also calls `.format` would be claimed too — a known limit,
 * documented in `docs/multiplatform.md`.
 */
const scanIntl: ModuleScanner = (scan) => {
  const bindings = formatterBindings(scan)
  const walk = (node: AnyNode): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n)
      return
    }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const kind = formatterKindOf(node.init)
      if (kind !== undefined) bindings.set(node.id.name as string, kind)
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue
      const v = node[key]
      if (v !== null && typeof v === 'object') walk(v)
    }
  }
  walk(scan.body)
}

/** `new Date(ms)` → `ms`; `new Date()` → the current time; anything else → `undefined`. */
function dateArgument(node: AnyNode, ctx: ModuleParseContext): ExprIR | 'invalid' | undefined {
  const n = unwrapTypeLayers(node)
  if (n?.type !== 'NewExpression' || n.callee?.type !== 'Identifier' || n.callee.name !== 'Date') {
    return undefined
  }
  if (ctx.binding('Date') !== undefined) return undefined
  const args = (n.arguments as AnyNode[] | undefined) ?? []
  if (args.length === 0) {
    return {
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'Date' }, property: 'now' },
      args: [],
    }
  }
  if (args.length === 1) return ctx.expr(args[0])
  return 'invalid'
}

/**
 * Read `(locale, options)` into the formatter's IR: the static arguments, the
 * runtime ones (`args`), and the plan. `null` when the call cannot lower (the
 * reason was reported).
 */
function readFormatter(
  kind: 'datetime' | 'number',
  entry: DateTimeEntry,
  argNodes: readonly AnyNode[],
  node: AnyNode,
  ctx: ModuleParseContext,
  where: string,
): { payload: FormatterPayload; args: ExprIR[] } | null {
  // Every runtime value the call wrote, by index; only the ones a kept
  // parameter refers to survive into the node (see the remap at the end).
  const args: ExprIR[] = []
  let locale: IntlOptionInput | undefined

  // Locale: a string literal, a runtime string, `undefined` (the device locale)
  // or a one-element array. A list of several is a negotiation the native
  // formatters do not perform — the first entry is used, and said so.
  const localeNode = unwrapTypeLayers(argNodes[0])
  if (localeNode !== undefined && !(localeNode.type === 'Identifier' && localeNode.name === 'undefined')) {
    let chosen: AnyNode = localeNode
    if (localeNode.type === 'ArrayExpression') {
      const els = ((localeNode.elements as AnyNode[] | undefined) ?? []).filter((x) => x != null)
      if (els.length === 0) {
        chosen = undefined
      } else {
        if (els.length > 1) {
          ctx.report(
            `${where}: a locale LIST has no native lowering — the platforms do not negotiate between candidates, so the FIRST entry is used on iOS and Android, where the web picks the best supported one.`,
          )
        }
        chosen = els[0]
      }
    }
    if (chosen !== undefined) {
      const lit = ctx.staticString(chosen)
      if (lit !== null) locale = { kind: 'static', value: lit }
      else {
        locale = { kind: 'dynamic', index: args.length }
        args.push(ctx.expr(chosen))
      }
    }
  }

  // Options: an object literal. Anything else is a runtime object whose keys
  // cannot be read, so it is named rather than guessed at.
  const options = new Map<string, IntlOptionInput>()
  const optNode = unwrapTypeLayers(argNodes[1])
  if (optNode !== undefined && !(optNode.type === 'Identifier' && optNode.name === 'undefined')) {
    if (optNode.type !== 'ObjectExpression') {
      ctx.unsupported(
        node,
        `${where} with a non-literal options object`,
        'the options select the native formatter at compile time — write them as an object literal at the call.',
      )
      return null
    }
    for (const prop of (optNode.properties as AnyNode[] | undefined) ?? []) {
      if (prop?.type === 'SpreadElement') {
        ctx.report(`${where}: a spread in the options object cannot be read at compile time — its options are IGNORED on iOS and Android.`)
        continue
      }
      if (hasDynamicKey(prop)) {
        ctx.warnDynamicKey(prop, `${where} options`)
        continue
      }
      const key = staticPropKey(prop)
      if (key === undefined) continue
      const value = unwrapTypeLayers(prop.value as AnyNode)
      const lit = staticLiteral(value, ctx)
      if (lit !== undefined) options.set(key, { kind: 'static', value: lit })
      else {
        options.set(key, { kind: 'dynamic', index: args.length })
        args.push(ctx.expr(value))
      }
    }
  }
  if (argNodes.length > 2) {
    ctx.report(`${where}: arguments after (locales, options) are IGNORED, as in JavaScript.`)
  }

  const result =
    kind === 'datetime' ? planDateTime(entry, options) : planNumber(`\`${where.replace(/`/g, '')}\` option`, options)
  for (const w of result.warnings) ctx.report(w)
  if (result.plan === null) return null

  const ordered = [
    ...(locale !== undefined ? [['locale', locale] as const] : []),
    ...planArguments(result.plan),
  ]
  // Only the runtime values the plan kept are arguments; an ignored dynamic
  // option must not leave a dangling expression behind, so re-index.
  const kept: ExprIR[] = []
  const params: FormatterParam[] = ordered.map(([name, v]) => {
    if (v.kind === 'static') return [name, { literal: v.value }] as const
    kept.push(args[v.index]!)
    return [name, { arg: kept.length - 1 }] as const
  })
  return { payload: { formatter: kind, params }, args: kept }
}

/** A literal option value: a string / number / boolean literal, or a module `const` holding a string. */
function staticLiteral(node: AnyNode, ctx: ModuleParseContext): string | number | boolean | undefined {
  if (node === undefined) return undefined
  if (node.type === 'Literal' || node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') {
    const v = node.value
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' && typeof node.argument?.value === 'number') {
    return -node.argument.value
  }
  const s = ctx.staticString(node)
  return s !== null ? s : undefined
}

const asPayload = (p: FormatterPayload | FormatPayload): ExtPayload => p as unknown as ExtPayload

/** `new Intl.DateTimeFormat(…)` / `Intl.NumberFormat(…)` — and every other `Intl` member, named. */
const recognizeIntlCall: CallExprRecognizer = (site, ctx) => {
  const member = intlMember(site.callee, ctx)
  if (member === undefined) return undefined
  const kind = CONSTRUCTORS[member]
  if (kind === undefined) {
    return ctx.unsupported(
      site.node,
      `\`Intl.${member}\``,
      OTHER_INTL.has(member)
        ? 'only `Intl.DateTimeFormat` and `Intl.NumberFormat` lower to native formatters; format this value on the web side, or branch with `<NativeIOS>` / `<NativeAndroid>`.'
        : 'it is not an `Intl` member the native lowering knows.',
    )
  }
  const read = readFormatter(kind, 'DateTimeFormat', site.args, site.node, ctx, `\`Intl.${member}\``)
  if (read === null) return null
  return { type: FORMATTER, payload: asPayload(read.payload), args: read.args }
}

/** The formatter a `.format(…)` receiver denotes, or `undefined`. */
function receiverFormatter(receiver: AnyNode, ctx: ModuleParseContext): 'datetime' | 'number' | undefined {
  const r = unwrapTypeLayers(receiver)
  if (r?.type === 'Identifier') return formatterBindings(ctx).get(r.name as string)
  return formatterKindOf(r)
}

/** `fmt.format(x)` — and every other method on a formatter, named. */
const recognizeFormatterMethod: MethodCallRecognizer = (site, ctx) => {
  const kind = receiverFormatter(site.receiver, ctx)
  if (kind === undefined) return undefined
  const ctor = kind === 'datetime' ? 'DateTimeFormat' : 'NumberFormat'
  if (site.method !== 'format') {
    return ctx.unsupported(
      site.node,
      `\`Intl.${ctor}#${site.method}\``,
      site.method === 'formatToParts' || site.method === 'formatRange' || site.method === 'formatRangeToParts' || site.method === 'resolvedOptions'
        ? 'only `format(value)` lowers to the native formatter.'
        : `\`Intl.${ctor}\` has no \`${site.method}\` method.`,
    )
  }
  if (site.args.length !== 1) {
    return ctx.unsupported(site.node, `\`format()\` with ${site.args.length} arguments`, 'pass exactly the value to format.')
  }
  const date = dateArgument(site.args[0], ctx)
  if (date === 'invalid') {
    return ctx.unsupported(site.args[0] as AnyNode, '`new Date(y, m, …)`', 'only `new Date(ms)` and `new Date()` lower — natively a date is its epoch milliseconds.')
  }
  const value = date ?? ctx.expr(site.args[0] as AnyNode)
  return {
    type: FORMAT,
    payload: asPayload({ formatter: kind }),
    args: [ctx.expr(site.receiver as AnyNode), value],
  }
}

/** `n.toLocaleString(…)`, `new Date(ms).toLocale{,Date,Time}String(…)`. */
function recognizeToLocale(entry: DateTimeEntry): MethodCallRecognizer {
  return (site, ctx) => {
    const date = dateArgument(site.receiver, ctx)
    if (date === 'invalid') {
      return ctx.unsupported(site.receiver as AnyNode, '`new Date(y, m, …)`', 'only `new Date(ms)` and `new Date()` lower — natively a date is its epoch milliseconds.')
    }
    const where = date !== undefined ? `\`Date#${site.method}\`` : `\`Number#${site.method}\``
    if (date === undefined && entry !== 'toLocaleString') {
      return ctx.unsupported(
        site.node,
        `\`${site.method}\` on a value that is not written \`new Date(ms)\``,
        'natively a date is its epoch milliseconds, so the receiver must be the `new Date(ms)` construction itself — or use `new Intl.DateTimeFormat(locale, options).format(ms)`.',
      )
    }
    const kind = date !== undefined ? 'datetime' : 'number'
    const read = readFormatter(kind, entry, site.args, site.node, ctx, where)
    if (read === null) return null
    const formatter: ExprIR = {
      kind: 'ext-expr',
      plugin: INTL_PLUGIN_NAME,
      type: FORMATTER,
      payload: asPayload(read.payload),
      args: read.args,
    }
    return {
      type: FORMAT,
      payload: asPayload({ formatter: kind }),
      args: [formatter, date ?? ctx.expr(site.receiver as AnyNode)],
    }
  }
}

/** The constructor call, per target: `name: value` (Swift) / `name = value` (Kotlin). */
function emitFormatter(
  e: ExtExprIR,
  ctx: EmitContext,
  target: 'swift' | 'kotlin',
  intArg: (arg: ExprIR) => string,
): string {
  const p = formatterPayload(e)
  const sep = target === 'swift' ? ': ' : ' = '
  const lit = (v: string | number | boolean): string =>
    typeof v === 'string' ? ctx.stringLiteral(v) : String(v)
  const intParams = new Set(['minimumFractionDigits', 'maximumFractionDigits', 'minimumIntegerDigits'])
  const parts = p.params.map(([name, v]) => {
    if ('literal' in v) return `${name}${sep}${lit(v.literal)}`
    const arg = e.args[v.arg]!
    return `${name}${sep}${intParams.has(name) ? intArg(arg) : ctx.expr(arg)}`
  })
  const ctor = p.formatter === 'datetime' ? 'PyreonDateTimeFormat' : 'PyreonNumberFormat'
  return `${ctor}(${parts.join(', ')})`
}

const DOUBLE: TypeIR = { kind: 'number', float: true }

const formatterExpr: ExprEmitter = {
  // A runtime digit count may be a Double-typed expression; the parameter is an Int.
  swift: (e, ctx) => emitFormatter(e, ctx, 'swift', (arg) => `Int(${ctx.expr(arg)})`),
  kotlin: (e, ctx: KotlinEmitContext) => emitFormatter(e, ctx, 'kotlin', (arg) => ctx.intArg(arg)),
  typing: {
    type: (e) => ({
      kind: 'typeRef',
      name: formatterPayload(e).formatter === 'datetime' ? 'PyreonDateTimeFormat' : 'PyreonNumberFormat',
      args: [],
    }),
  },
}

const formatExpr: ExprEmitter = {
  swift: (e, ctx) => `${ctx.expr(e.args[0]!)}.format(${ctx.argument(e.args[1]!, DOUBLE)})`,
  kotlin: (e, ctx) => `${ctx.expr(e.args[0]!)}.format(${ctx.argument(e.args[1]!, DOUBLE)})`,
  typing: { type: () => ({ kind: 'string' }) },
}

export const intlPlugin: CompilerPlugin = {
  name: INTL_PLUGIN_NAME,
  apiVersion: 2,
  builtIn: true,
  scanModule: scanIntl,
  callExprs: recognizeIntlCall,
  methodCalls: {
    '*': recognizeFormatterMethod,
    toLocaleString: recognizeToLocale('toLocaleString'),
    toLocaleDateString: recognizeToLocale('toLocaleDateString'),
    toLocaleTimeString: recognizeToLocale('toLocaleTimeString'),
  },
  exprs: { [FORMATTER]: formatterExpr, [FORMAT]: formatExpr },
}
