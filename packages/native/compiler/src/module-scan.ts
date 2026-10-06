/**
 * File-level parse seams for plugins that own FACTS other code reads.
 *
 * A library such as `@pyreon/http` declares bindings at the top of a file
 * (`const api = createHttp(…)`, `const getUser = api.endpoint(…)`) that emit
 * nothing themselves but decide what a hook elsewhere in the file lowers to. Two
 * seams carry that without the compiler knowing the library:
 *
 *   - {@link ModuleScanner} (`CompilerPlugin.scanModule`) — a pre-pass over the
 *     program's top-level nodes, run before any declaration is parsed. It keeps
 *     what it learns in `fileState`, may make the core SKIP a top-level
 *     declaration (metadata that must not reach the emitters), and may mark an
 *     import as consumed by lowering so the "has NO native lowering" warning is
 *     not printed above code that does lower.
 *   - {@link RequestSource} (`CompilerPlugin.requestSources`) — turns a call of a
 *     binding the plugin recorded (`getUser({ params })`) into a concrete
 *     request. The core's `useFetch` and any other plugin's hook read it through
 *     `ParseContext.requests`, so a fact crosses plugins with no package edge.
 */

import type { AstNode, ParseContext } from './call-lowering'
import type { ExprIR } from './types'

/** What a scanner may read and record while the file's top level is walked. */
export interface ModuleScan {
  /** The whole program node. */
  readonly program: AstNode
  /** The program's top-level statements. */
  readonly body: readonly AstNode[]
  /** The file's source text (for messages that quote a span). */
  readonly source: string
  /** The statically-known string an argument denotes — a literal, or a module-scope `const` holding one — else `null`. */
  staticString(node: AstNode | null | undefined): string | null
  /** Plugin-owned memory for THIS file. Namespace the key with the plugin name; the core never reads it. */
  fileState<T>(key: string, init: () => T): T
  /** Make the core skip every top-level node for which `skip` is true (a declaration that is metadata only). */
  skipTopLevel(skip: (node: AstNode) => boolean): void
  /** Mark `name` imported from `module` (`'*'`: from any module) as consumed by lowering, so it draws no "has NO native lowering" warning. */
  lowered(module: string, name: string): void
  /** Report a limitation to the author exactly as written. */
  report(message: string): void
}

/** A per-file pre-pass; runs once per compile, in plugin order. */
export type ModuleScanner = (scan: ModuleScan) => void

/** A call of a plugin-known binding, lowered to a concrete request. */
export interface ResolvedRequest {
  /** The URL as a compile-time constant (with `:name` placeholders when `urlExpr` is set). */
  readonly url: string
  /** Set when a path parameter is a RUNTIME value: a `template` the emit renders as native string interpolation. */
  readonly urlExpr?: ExprIR | undefined
  readonly method: string
  readonly headers?: Record<string, string> | undefined
  readonly body?: string | undefined
  /** The same-module schema binding the request's `response` names (evidence for the decode type's `Int`/`Double` fields). */
  readonly response?: { readonly binding: string; readonly array: boolean } | undefined
}

/** What the CALLER can honour. */
export interface RequestOptions {
  /** The caller re-runs when a path parameter changes (a keyed query), so a runtime value is honourable. */
  readonly allowRuntimeParams: boolean
  /** The caller consumes the RAW body as a stream. */
  readonly streaming: boolean
}

export interface RequestSource {
  /** True when `name` is a binding this source resolves. */
  has(name: string, ctx: ParseContext): boolean
  /** The request for a call of `name` with `arg` as its first argument, or `null` after reporting why it stays web. */
  resolve(name: string, arg: AstNode | undefined, options: RequestOptions, ctx: ParseContext): ResolvedRequest | null
}

type ScanPlugin = {
  readonly name: string
  readonly scanModule?: ModuleScanner | undefined
  readonly requestSources?: readonly RequestSource[] | undefined
  readonly destructureCalls?: readonly string[] | undefined
  readonly componentOnlyCalls?: readonly string[] | undefined
}

export interface ScanRegistry {
  readonly scanners: readonly { readonly owner: string; readonly scan: ModuleScanner }[]
  readonly sources: readonly { readonly owner: string; readonly source: RequestSource }[]
  /** Hooks whose result may be destructured (`const { data } = useQuery(…)`). */
  readonly destructureCalls: ReadonlySet<string>
  /** Calls that lower only inside a component body (a file-scope declaration of one is reported as misplaced). */
  readonly componentOnlyCalls: ReadonlySet<string>
}

/** Build the registry from every plugin's scan-side hooks, in plugin order. */
export function createScanRegistry(plugins: readonly ScanPlugin[]): ScanRegistry {
  const scanners: { owner: string; scan: ModuleScanner }[] = []
  const sources: { owner: string; source: RequestSource }[] = []
  const destructureCalls = new Set<string>()
  const componentOnlyCalls = new Set<string>()
  for (const plugin of plugins) {
    if (plugin.scanModule !== undefined) scanners.push({ owner: plugin.name, scan: plugin.scanModule })
    for (const source of plugin.requestSources ?? []) sources.push({ owner: plugin.name, source })
    for (const name of plugin.destructureCalls ?? []) destructureCalls.add(name)
    for (const name of plugin.componentOnlyCalls ?? []) componentOnlyCalls.add(name)
  }
  return Object.freeze({ scanners: Object.freeze(scanners), sources: Object.freeze(sources), destructureCalls, componentOnlyCalls })
}
