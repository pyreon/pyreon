// How `@pyreon/i18n` crosses to native: `const i18n = createI18n({ locale, messages, fallbackLocale? })`
// (from `@pyreon/i18n/core`) becomes the `PyreonI18n` reactive container both runtimes ship — an `@State` on
// SwiftUI, a `remember {}` on Compose — seeded with the literal locale and message table. `i18n.t(key)` and
// `i18n.locale` flow through unchanged because the runtime container defines them; only the interpolating
// two-argument `t(key, { count })` needs a lowering, because the generic object-literal emit builds a struct
// (or a one-field labelled tuple, a Swift PARSE error) where the runtime takes a dictionary.
//
// v1 scope: string keys and string values. Async loaders, nested message objects, plural suffixes and
// namespaces are out of scope; top-level dotted keys are kept verbatim (`{ 'section.title': 'Report' }`).

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  staticPropKey,
  unwrapTypeLayers,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type ExprIR,
  type ExtDecl,
  type ReceiverLowering,
  type ReceiverSite,
} from '@pyreon/native-compiler/plugin-api'
import { i18nStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const I18N_TYPE = 'i18n'
export const I18N_PLUGIN_NAME = '@pyreon/i18n'

interface I18nPayload {
  readonly locale: string
  readonly messages: Readonly<Record<string, Readonly<Record<string, string>>>>
  readonly fallbackLocale?: string
}

const payloadOf = (decl: ExtDecl): I18nPayload => decl.payload as unknown as I18nPayload

/**
 * Reads the literal `locale`, the literal `messages` map (locale → key → value) and the optional
 * `fallbackLocale`. A module-scope `const` naming the locale resolves (a default named once and shared is
 * ordinary). A config that is not a literal reports why and DECLINES, so the declaration falls through to the
 * parser's remaining chain exactly as it did when this lived in the compiler.
 */
const recognizeI18n: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const configArg = ctx.args[0] as AnyNode | undefined
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `createI18n declaration \`${name}\`: config argument is not an object literal — emit needs the literal { locale, messages, fallbackLocale? } shape. Falling back to silent-drop.`,
    )
    return undefined
  }

  let locale: string | undefined
  let fallbackLocale: string | undefined
  let messagesNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `createI18n declaration \`${name}\`: config`)
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'locale') {
      locale = ctx.staticString(valueNode) ?? undefined
    } else if (keyName === 'fallbackLocale') {
      fallbackLocale = ctx.staticString(valueNode) ?? undefined
    } else if (keyName === 'messages') {
      messagesNode = valueNode
    }
  }

  if (!locale) {
    ctx.report(
      `createI18n declaration \`${name}\`: \`locale\` field is missing or not a string literal — required to seed PyreonI18n. Falling back to silent-drop.`,
    )
    return undefined
  }
  if (!messagesNode || messagesNode.type !== 'ObjectExpression') {
    ctx.report(
      `createI18n declaration \`${name}\`: \`messages\` field is missing or not an object literal — required to bake the translation table. Falling back to silent-drop.`,
    )
    return undefined
  }

  // `messages: { en: { hello: 'Hi' } }` into the nested record. Nested objects and interpolation tokens are
  // v1-out-of-scope: dropped at the per-key level (the locale entry stays).
  const messages: Record<string, Record<string, string>> = {}
  for (const localeProp of (messagesNode.properties as AnyNode[] | undefined) ?? []) {
    if (localeProp?.type !== 'Property' && localeProp?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(localeProp)) {
      ctx.warnDynamicKey(localeProp, `createI18n declaration \`${name}\`: messages`)
      continue
    }
    const locName = staticPropKey(localeProp)
    if (!locName) continue
    const dict = unwrapTypeLayers(localeProp.value as AnyNode | undefined)
    messages[locName] = {}
    if (dict?.type !== 'ObjectExpression') continue
    for (const entry of (dict.properties as AnyNode[] | undefined) ?? []) {
      if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
      if (ctx.hasDynamicKey(entry)) {
        ctx.warnDynamicKey(entry, `createI18n declaration \`${name}\`: messages \`${locName}\``)
        continue
      }
      const key = staticPropKey(entry)
      const value = unwrapTypeLayers(entry.value as AnyNode | undefined)
      if (key && value?.type === 'Literal' && typeof value.value === 'string') messages[locName]![key] = value.value
    }
  }

  return { type: I18N_TYPE, payload: fallbackLocale === undefined ? { locale, messages } : { locale, messages, fallbackLocale } }
}

const i18nDecl: DeclEmitter = {
  // The declaration was a closed `i18n` compiler kind before it moved here; the struct names the compiler
  // derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: I18N_TYPE,
  swift(decl, ctx) {
    const { locale, messages, fallbackLocale } = payloadOf(decl)
    const lit = ctx.stringLiteral
    const entries = Object.entries(messages)
      .map(([loc, kv]) => {
        const inner = Object.entries(kv)
          .map(([k, v]) => `${lit(k)}: ${lit(v)}`)
          .join(', ')
        return `${lit(loc)}: ${inner === '' ? '[:]' : `[${inner}]`}`
      })
      .join(', ')
    const fallback = fallbackLocale !== undefined ? `, fallbackLocale: ${lit(fallbackLocale)}` : ''
    return `@State private var ${ctx.ident(decl.name)} = PyreonI18n(locale: ${lit(locale)}, messages: ${entries === '' ? '[:]' : `[${entries}]`}${fallback})`
  },
  kotlin(decl, ctx) {
    const { locale, messages, fallbackLocale } = payloadOf(decl)
    const lit = ctx.stringLiteral
    const entries = Object.entries(messages)
      .map(([loc, kv]) => {
        const inner = Object.entries(kv)
          .map(([k, v]) => `${lit(k)} to ${lit(v)}`)
          .join(', ')
        return `${lit(loc)} to ${inner === '' ? 'mapOf()' : `mapOf(${inner})`}`
      })
      .join(', ')
    const fallback = fallbackLocale !== undefined ? `, fallbackLocale = ${lit(fallbackLocale)}` : ''
    return `val ${ctx.ident(decl.name)} = remember { PyreonI18n(initialLocale = ${lit(locale)}, messages = ${entries === '' ? 'mapOf()' : `mapOf(${entries})`}${fallback}) }`
  },
}

type ObjectExpr = Extract<ExprIR, { kind: 'object' }>

/**
 * `i18n.t('items', { count: n() })` — the VALUES argument is an object literal the runtime takes as a
 * dictionary (`t(_:_:[String: …])` / `t(key, Map<String, Any?>)`). The general object-literal emit would
 * build a struct, or a labelled tuple (a single-field one is a Swift PARSE error), in this call position.
 * Every other call on the binding (`t(key)`, `locale`, `setLocale`) flows through unchanged.
 */
function interpolatedT(
  site: ReceiverSite,
  ctx: { ident(name: string): string; expr(e: ExprIR): string; stringLiteral(value: string): string },
  entry: (name: string, value: string) => string,
  wrap: (entries: string) => string,
): string | undefined {
  if (site.kind !== 'call') return undefined
  const { callee, args } = site.expr
  if (
    callee.kind !== 'member' ||
    callee.property !== 't' ||
    callee.object.kind !== 'identifier' ||
    callee.object.name !== site.receiver.name ||
    args.length !== 2 ||
    args[1]!.kind !== 'object' ||
    (args[1]! as ObjectExpr).spreads !== undefined
  ) {
    return undefined
  }
  const keyArg = ctx.expr(args[0]!)
  const entries = (args[1]! as ObjectExpr).fields.map((f) => entry(ctx.stringLiteral(f.name), ctx.expr(f.value))).join(', ')
  return `${ctx.ident(callee.object.name)}.t(${keyArg}, ${wrap(entries)})`
}

const i18nReceiver: ReceiverLowering = {
  swift: { expr: (site, ctx) => interpolatedT(site, ctx, (k, v) => `${k}: ${v}`, (entries) => `[${entries}]`) },
  kotlin: { expr: (site, ctx) => interpolatedT(site, ctx, (k, v) => `${k} to ${v}`, (entries) => `mapOf(${entries})`) },
}

/**
 * The `@pyreon/i18n` native plugin. Shipped by `@pyreon/i18n` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const i18nPlugin: CompilerPlugin = {
  name: I18N_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/i18n'],
  calls: { createI18n: recognizeI18n },
  componentOnlyCalls: ['createI18n'],
  decls: { [I18N_TYPE]: i18nDecl },
  receivers: { [I18N_TYPE]: i18nReceiver },
  stubs: i18nStubs,
}
