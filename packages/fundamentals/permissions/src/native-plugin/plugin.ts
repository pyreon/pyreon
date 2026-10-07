// How `@pyreon/permissions` crosses to native: the grant container and the provider that seeds it.
//
//   `const can = usePermissions(['posts.edit', 'posts.*'])`   → a self-contained `PyreonPermissions` seeded with the keys
//   `const can = usePermissions()`                            → the container the nearest provider injects (the web call)
//   `usePermissions([])`                                      → a deny-all container (an array literal selects the
//                                                               self-contained form BY PRESENCE, as the web runtime does)
//   `<PermissionsProvider permissions={{ … }}>`               → the grants injected into the SwiftUI environment /
//                                                               Compose CompositionLocal a bare `usePermissions()` reads
//
// Reads are method calls (`can("x")`, `can.cannot("x")`), so the declaration is the only thing the emitters need.
//
// The native container is GRANT-ONLY: an explicit `false` has nowhere to live. That is exact without wildcards (an
// unlisted key is denied either way) and a silent authorization FAILURE under one, so the provider reports it.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  kotlinStr,
  swiftStr,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type ElementLowering,
  type EmitContext,
  type ExprIR,
  type ExtDecl,
  type JsxElementIR,
  type ModuleScanner,
} from '@pyreon/native-compiler/plugin-api'
import { permissionsStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const PERMISSIONS_PLUGIN_NAME = '@pyreon/permissions'
const DECL_TYPE = 'permissions'

interface PermissionsPayload {
  readonly grants: readonly string[]
  /** The call passed an ARRAY LITERAL — even an empty one — which selects the self-contained mode. */
  readonly seeded: boolean
}

const permissionsOf = (decl: ExtDecl): PermissionsPayload => decl.payload as unknown as PermissionsPayload

/** The string-literal entries of an array argument; a missing / non-array / non-literal argument yields none, so the call never bails. */
function stringArray(arg: AnyNode | undefined): string[] {
  if (!arg || arg.type !== 'ArrayExpression') return []
  const out: string[] = []
  for (const el of (arg.elements as AnyNode[] | undefined) ?? []) {
    if (el && (el.type === 'Literal' || el.type === 'StringLiteral') && typeof el.value === 'string') out.push(el.value)
  }
  return out
}

/**
 * `usePermissions(['a', 'b'])`. Always succeeds: a bare call or a non-literal argument yields an empty grant set
 * and the emit reads the provider's. A bare `usePermissions()` is the CORRECT web call (the grants come from the
 * nearest `<PermissionsProvider>`), so it is not warned about — the provider usually lives in another file.
 */
const recognizePermissions: CallRecognizer = (_call, ctx) => {
  const grantsArg = ctx.args[0] as AnyNode | undefined
  return { type: DECL_TYPE, payload: { grants: stringArray(grantsArg), seeded: grantsArg?.type === 'ArrayExpression' } }
}

const permissionsDecl: DeclEmitter = {
  // The declaration was a closed `permissions` compiler kind before it moved here; the struct names the compiler
  // derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: DECL_TYPE,
  swift(decl, ctx) {
    const { grants, seeded } = permissionsOf(decl)
    const name = ctx.ident(decl.name)
    // A BARE `usePermissions()` reads the grants from the environment rather than constructing an empty set in which
    // every check denies.
    if (!seeded) return `@Environment(\\.pyreonPermissions) private var ${name}`
    // `usePermissions([])` — an explicit empty grant list is a deny-all container, not a provider read.
    if (grants.length === 0) return `@State private var ${name} = PyreonPermissions()`
    return `@State private var ${name} = PyreonPermissions([${grants.map((g) => swiftStr(g)).join(', ')}])`
  },
  kotlin(decl, ctx) {
    const { grants, seeded } = permissionsOf(decl)
    const name = ctx.ident(decl.name)
    if (!seeded) return `val ${name} = LocalPyreonPermissions.current`
    if (grants.length === 0) return `val ${name} = remember { PyreonPermissions() }`
    return `val ${name} = remember { PyreonPermissions(setOf(${grants.map((g) => kotlinStr(g)).join(', ')})) }`
  },
}

/**
 * The granted keys from a literal `permissions={{ 'a': true, 'b': false }}` map, or `null` when the attribute is absent
 * or not a literal object (the caller falls back to the generic emit). Only `true` entries are granted: the native
 * container is grant-only, so a `false` VALUE has nowhere to live — exact when the map has no wildcards, and reported
 * by the caller when it does.
 */
function providerSeed(e: JsxElementIR): { granted: string[]; deniedUnderWildcard: string[] } | null {
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'permissions')
  if (!attr || attr.kind !== 'attr' || attr.value.kind !== 'object') return null
  const granted: string[] = []
  const denied: string[] = []
  for (const field of (attr.value as Extract<ExprIR, { kind: 'object' }>).fields) {
    if (field.value.kind !== 'literal') return null
    if (field.value.value === true) granted.push(field.name)
    else if (field.value.value === false) denied.push(field.name)
    else return null
  }
  // A `false` only matters natively when a wildcard would otherwise grant it; an ordinary unlisted key is denied either way.
  const hasWildcard = granted.some((g) => g === '*' || g.endsWith('.*') || g.endsWith('.**'))
  return { granted, deniedUnderWildcard: hasWildcard ? denied : [] }
}

/**
 * Shared by both targets: validate the seed (declining to the generic emit, reporting why, when the map is not
 * baked-able) and report a denial the grant-only container cannot express. `null` means "already emitted generically".
 */
function readSeed(e: JsxElementIR, ctx: EmitContext, quote: (key: string) => string): { granted: string[] } | string {
  const seed = providerSeed(e)
  if (seed === null) {
    // The emit is the authority on whether it lowered, so it reports: a provider that cannot be baked would
    // otherwise go silent — worse than before the tag lowered at all.
    ctx.warn(
      '<PermissionsProvider permissions={…}>: the permissions map is not a literal object of boolean values, so the grants cannot be baked into the native emit — the provider injects NOTHING and every check below it denies. Use a literal map, or seed at the call site with usePermissions(["posts.*"]).',
    )
    return ctx.generic(e)
  }
  if (seed.deniedUnderWildcard.length > 0) {
    // Under a wildcard the `false` is the ONLY thing denying the key, so dropping it makes native GRANT what the web
    // DENIES. A wrong-direction authorization divergence must be loud.
    ctx.warn(
      `<PermissionsProvider>: ${seed.deniedUnderWildcard.map((d) => quote(d)).join(', ')} ${seed.deniedUnderWildcard.length === 1 ? 'is' : 'are'} set to false under a wildcard grant, and the native permissions container is GRANT-ONLY — so those keys are DENIED on the web and GRANTED on device. Split the wildcard into the exact keys you mean to grant, or gate the check in app code.`,
    )
  }
  return { granted: seed.granted }
}

function emitSwiftProvider(e: JsxElementIR, ctx: EmitContext): string {
  const seed = readSeed(e, ctx, (key) => swiftStr(key))
  if (typeof seed === 'string') return seed
  const set = `PyreonPermissions([${seed.granted.map((g) => swiftStr(g)).join(', ')}])`
  if (e.children.length === 0) return `EmptyView().environment(\\.pyreonPermissions, ${set})`
  const pad = ctx.pad(ctx.indent + 2)
  const content = e.children.map((c) => pad + ctx.child(c, ctx.indent + 2)).join('\n')
  // The modifier attaches to the GROUP, so every child sees the value — attaching it to the last child would scope it to that child alone.
  return `Group {\n${content}\n${ctx.pad()}}.environment(\\.pyreonPermissions, ${set})`
}

function emitKotlinProvider(e: JsxElementIR, ctx: EmitContext): string {
  const seed = readSeed(e, ctx, (key) => kotlinStr(key))
  if (typeof seed === 'string') return seed
  const set = `PyreonPermissions(setOf(${seed.granted.map((g) => kotlinStr(g)).join(', ')}))`
  const pad = ctx.pad(ctx.indent + 2)
  const content = e.children.map((c) => pad + ctx.child(c, ctx.indent + 2)).join('\n')
  return `CompositionLocalProvider(LocalPyreonPermissions provides ${set}) {\n${content}\n${ctx.pad()}}`
}

const providerLowering: ElementLowering = Object.freeze({
  module: PERMISSIONS_PLUGIN_NAME,
  tags: Object.freeze(['PermissionsProvider']),
  emit: Object.freeze({ swift: emitSwiftProvider, kotlin: emitKotlinProvider }),
})

/**
 * A `<PermissionsProvider>` in the file means the import IS consumed by lowering: the blanket "has NO native lowering"
 * line would print directly above the injection the emit performs. (The check is textual, as it always was: an
 * unrendered import still draws the warning.)
 */
const scanPermissions: ModuleScanner = (scan) => {
  if (/<\s*PermissionsProvider[\s/>]/.test(scan.source)) scan.lowered(PERMISSIONS_PLUGIN_NAME, 'PermissionsProvider')
}

/**
 * The `@pyreon/permissions` native plugin. Shipped by `@pyreon/permissions` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const permissionsPlugin: CompilerPlugin = Object.freeze({
  name: PERMISSIONS_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze([PERMISSIONS_PLUGIN_NAME]),
  scanModule: scanPermissions,
  calls: Object.freeze({ usePermissions: recognizePermissions }),
  // `const { can } = usePermissions()` aliases onto the container like any other lowered hook.
  destructureCalls: Object.freeze(['usePermissions']),
  decls: Object.freeze({ [DECL_TYPE]: permissionsDecl }),
  elements: Object.freeze([providerLowering]),
  unlowered: Object.freeze({
    // The previous advice — "`usePermissions()` DOES lower — use the hook instead" — was addressed to someone ALREADY
    // using the hook, and following it changed nothing: `<PermissionsProvider>` is where the grants come from, so a
    // hook without it lowers to an EMPTY set and every check denies. Name the seeding shape instead.
    [PERMISSIONS_PLUGIN_NAME]: Object.freeze({
      advice:
        'a literal `<PermissionsProvider permissions={{ … }}>` DOES lower — it injects the grants a bare `usePermissions()` reads. What does not lower is a NON-literal permissions map (a variable, a fetch result), and `createPermissions()` used outside the provider',
    }),
  }),
  stubs: permissionsStubs,
})
