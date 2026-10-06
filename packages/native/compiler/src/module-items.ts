/**
 * Module-level plugin seams: a plugin's own top-level declarations, the expressions that read them, and the
 * cross-library facts they publish — with no library named in the core.
 *
 * Declarations that live INSIDE a component (`const chart = createChartHandle()`) are `ExtDecl`s
 * (`call-lowering.ts`). A schema (`const Pet = s.object({ … })`), a field-metadata record
 * (`const email = withField(…)`) or any other file-scope declaration is different: it emits beside the
 * file's structs and enums, before every component, and other code reads it BY NAME (a form's
 * `schema: Pet`, an endpoint's `response: Pet`, `Pet.safeParse(x)`). Four small seams carry that:
 *
 *   - {@link TopLevelRecognizer} (`CompilerPlugin.topLevel`) + {@link ModuleItemEmitter}
 *     (`CompilerPlugin.items`, keyed by item `type`): recognize a top-level node and render the item on each
 *     target. The item is the open {@link ExtModuleItem}; the core dispatches by `(plugin, type)`.
 *   - {@link MethodCallRecognizer} (`CompilerPlugin.methodCalls`, keyed by METHOD name) + {@link ExprEmitter}
 *     (`CompilerPlugin.exprs`, keyed by expression `type`): `<receiver>.<method>(…)` becomes the open
 *     `ext-expr` IR node, which the plugin renders and types.
 *   - {@link CallExprRecognizer} (`CompilerPlugin.callExprs`): any CALL whose callee is a binding the plugin recorded
 *     when it scanned the file (`toast("x")`, `toast.success("x")`, `announce("x")`) — the same `ext-expr` IR node,
 *     for a call no registry can key by name because the callee is whatever local name the file imported it as.
 *   - {@link StructRefinement} (`CompilerPlugin.refineStructs`): edit the file's structs from the items and from
 *     the decode sites other plugins recorded (a response schema deciding `Int` vs `Double`).
 *   - {@link ModuleFinish} (`CompilerPlugin.finishModule`): a last pass over the finished item list.
 *
 * Every member is optional and every recognizer may DECLINE (`undefined`): the parser then continues exactly as
 * if the plugin were absent.
 */

import { isJson, type AstNode } from './call-lowering'
import type { EmitContext, KotlinEmitContext, SwiftEmitContext } from './emit-context'
import type { ExprIR, ExtModuleItem, ExtPayload, StructIR, TypeIR } from './types'

/** What a top-level recognizer (or `ModuleParseContext.addItem`) returns. The compiler stamps `plugin`. */
export interface ExtItemSpec {
  /** A key of the owning plugin's `items`. */
  readonly type: string
  /** The binding the item declares (what other code names it by). */
  readonly name: string
  /** JSON data for the emitter; defaults to `{}`. */
  readonly payload?: ExtPayload | undefined
}

/** What a module-level recognizer may read of the parser. */
export interface ModuleParseContext {
  /** The file's source text. */
  readonly source: string
  /** Report a limitation to the author exactly as written. */
  report(message: string): void
  /** Plugin-owned memory for THIS file (shared with `scanModule`); namespace the key with the plugin name. */
  fileState<T>(key: string, init: () => T): T
  /** The statically-known string an argument denotes — a literal, or a module-scope `const` holding one — else `null`. */
  staticString(node: AstNode | null | undefined): string | null
  /** Parse any sub-node to the IR the emitters consume. */
  expr(node: AstNode): ExprIR
  /**
   * Report that `node` (`what`) has no native lowering, `hint` saying how to write it so it does, and
   * return `null` — the verdict a {@link MethodCallRecognizer} gives for a call it claims but cannot lower.
   */
  unsupported(node: AstNode, what: string, hint: string): null
  /**
   * Report that `prop`'s computed key is only known at runtime, so the entry cannot be read at compile time
   * (the compiler's own wording). `where` is the prefix, e.g. `toast() options`.
   */
  warnDynamicKey(prop: AstNode, where: string): void
  /** The type arguments of a call or `new` node (`new Box<string, number>(…)`), each parsed to a type; none when there are none. */
  typeArgs(node: AstNode): TypeIR[]
  /** The source location of `node` as the compiler spells it in its own messages (`file.tsx:3:14`), for a message that names a call. */
  loc(node: AstNode): string
  /**
   * Add an item found OUTSIDE a declaration (a schema synthesized from an inline `s.object({ … }).safeParse(x)`).
   * Appended after every declaration-level item, in the order added.
   */
  addItem(spec: ExtItemSpec): void
}

/**
 * Recognize a top-level node: an item, or `undefined` to DECLINE (the node then falls through the parser's
 * own chain). The first plugin that returns an item owns the node.
 */
export type TopLevelRecognizer = (node: AstNode, ctx: ModuleParseContext) => ExtItemSpec | undefined

/** The names an item puts in the file's one value/type namespace, and how it follows a rename. */
export interface ItemBindings {
  /** The value bindings the item declares — what a same-named type declaration would collide with. */
  names(item: ExtModuleItem): readonly string[]
  /** Every other name the item takes in the shared namespace (nested declarations), so a rename never collides with one. */
  reserved?(item: ExtModuleItem): readonly string[]
  /**
   * Apply `renames` (old → new, the primary names already decided) to the item, in place. May ADD entries
   * to `renames` for names that follow a renamed primary (`Book_Author` follows `Book`), choosing only
   * names absent from `taken` and recording them there; the compiler applies the finished map everywhere
   * else (identifiers, `useForm({ schema })`, expressions through {@link ExprEmitter.rename}).
   */
  rename(item: ExtModuleItem, renames: Map<string, string>, taken: Set<string>): void
}

/** Per-field validation an item may offer a form that names it (`useForm({ schema: Pet })`). */
export interface FieldValidators {
  /**
   * What the "no declaration by that name" warning says declares such an item (`zodSchema/valibotSchema/…`),
   * so the core names no library. Absent: the warning names nothing.
   */
  readonly declaredBy?: string | undefined
  /** The fields a form can validate, in declaration order. */
  fields(item: ExtModuleItem): readonly string[]
  /** The validator body for `field`, as a call expression over the value variable `value` (returns `""` when valid). */
  swift(item: ExtModuleItem, field: string, value: string): string
  kotlin(item: ExtModuleItem, field: string, value: string): string
}

/** Renders one item type, and says how it takes part in the core's cross-cutting passes. */
export interface ModuleItemEmitter {
  /**
   * Where among the core's own module items this one emits: after the models (`'models'`) or after the
   * features (`'features'`, the default — beside every other data declaration).
   */
  readonly after?: 'models' | 'features' | undefined
  /**
   * Only an item that used to be a closed core array needs this: the name of the array it hashed in
   * (`moduleTag`, the hash that names synthesized structs, hashes each lane's payloads where the array stood).
   * A new plugin has no prior output to preserve and omits it.
   */
  readonly legacyList?: 'fieldMetas' | 'zodSchemas' | undefined
  readonly bindings?: ItemBindings | undefined
  readonly fieldValidators?: FieldValidators | undefined
  /** The item's declarations, one string each (nested declarations first). */
  swift(item: ExtModuleItem, ctx: EmitContext): readonly string[]
  kotlin(item: ExtModuleItem, ctx: EmitContext): readonly string[]
}

/** The open expression node — see `ExprIR`. */
export type ExtExprIR = Extract<ExprIR, { kind: 'ext-expr' }>

/** The call a {@link MethodCallRecognizer} is asked about: `<receiver>.<method>(…args)`. */
export interface MethodCallSite {
  /** The whole call node. */
  readonly node: AstNode
  readonly receiver: AstNode
  readonly method: string
  readonly args: readonly AstNode[]
}

/** What a method-call recognizer returns; the compiler stamps `plugin`. `args` are already-parsed expressions. */
export interface ExtExprSpec {
  readonly type: string
  readonly payload?: ExtPayload | undefined
  readonly args?: readonly ExprIR[] | undefined
}

/**
 * Recognize `<receiver>.<method>(…)`: an expression, `undefined` to DECLINE, or `null` to CLAIM the call
 * without lowering it (the recognizer reported why through {@link ModuleParseContext.unsupported}; the parser
 * substitutes the same empty literal it uses for every unsupported expression).
 */
export type MethodCallRecognizer = (site: MethodCallSite, ctx: ModuleParseContext) => ExtExprSpec | null | undefined

/** The call a {@link CallExprRecognizer} is asked about. */
export interface CallExprSite {
  /** The whole call node. */
  readonly node: AstNode
  /** The callee as written (`toast`, `toast.success`): the recognizer matches it against what its scan recorded. */
  readonly callee: AstNode
  readonly args: readonly AstNode[]
  /** True for `new Name(…)`: a recognizer that claims a constructor checks it, and one that claims a call ignores a construction. */
  readonly construct?: boolean | undefined
}

/**
 * Recognize a call by its callee: an expression, `undefined` to DECLINE, or `null` to CLAIM the call without
 * lowering it (reported through {@link ModuleParseContext.unsupported}). Called for every call expression once a
 * plugin registers one, so the first check must be cheap — read the names the plugin's `scanModule` recorded in
 * `fileState` and return `undefined` when the file holds none.
 */
export type CallExprRecognizer = (site: CallExprSite, ctx: ModuleParseContext) => ExtExprSpec | null | undefined

/** Renders and types one `ext-expr` type. */
export interface ExprEmitter {
  swift(e: ExtExprIR, ctx: SwiftEmitContext): string
  kotlin(e: ExtExprIR, ctx: KotlinEmitContext): string
  /** How expressions over the node are typed (without it the node is `unknown`). */
  readonly typing?:
    | {
        /**
         * The node's own type. `infer` types any expression in the active component — a source read, an argument — for a
         * node whose type follows from its parts (`rx.filter(todos, p)` is an array of `todos`' element).
         */
        type?(e: ExtExprIR, infer: (e: ExprIR) => TypeIR): TypeIR
        /** The type of `<node>.<property>`; when present it decides every member read on the node. */
        member?(e: ExtExprIR, property: string): TypeIR
        /**
         * Whether a file-scope `const` initialized with this node is typed by `type` for the READS that follow it.
         * Default true; false when the node's `type` describes how it reads (a map) but not what it is (a class
         * whose own member surface must be emitted verbatim).
         */
        seedsModuleConst?: boolean
      }
    | undefined
  /**
   * Only an expression that used to be a closed `ExprIR` kind needs this: the object `moduleTag` hashes in
   * its place. A new plugin omits it.
   */
  legacyHash?(e: ExtExprIR): unknown
  /** Apply a value rename (old → new) to the payload, in place. */
  rename?(e: ExtExprIR, renames: ReadonlyMap<string, string>): void
  /**
   * The node is a reduction over a collection: its source, its reducer (an arrow whose second parameter is the element) and its
   * seed — returned as the SAME nodes the expression holds, since the core widens an integer-valued seed to a Double in place when
   * the reducer accumulates a fractional value. Without it a plugin reduction keeps the seed it was written with.
   */
  reduce?(e: ExtExprIR): { readonly source: ExprIR; readonly reducer: ExprIR; readonly seed: ExprIR } | undefined
}

/** What a struct refinement may edit and read. */
export interface StructRefinementTarget {
  /** The file's structs; field types may be edited in place. */
  readonly structs: StructIR[]
  /** Every declaration-level item (inline-synthesized ones are not evidence). */
  readonly items: readonly ExtModuleItem[]
  /** The decode sites plugins recorded (`ParseContext.recordDecode`): a hook's type argument + the schema its request names. */
  readonly decodes: readonly { readonly type: TypeIR; readonly response: { readonly binding: string; readonly array: boolean } | undefined }[]
}

/**
 * Edit the file's structs from the module items. Runs after the core's own struct float refinements and
 * before the inline-object ones, which read the field types it settles.
 */
export type StructRefinement = (target: StructRefinementTarget) => void

/** What {@link ModuleFinish} may read and edit. */
export interface ModuleFinishTarget {
  /** Every item, inline-synthesized ones included, in emit order. The items' payloads may be edited in place. */
  readonly items: ExtModuleItem[]
  report(message: string): void
  fileState<T>(key: string, init: () => T): T
}

/** A last pass over the finished item list, run once per file after the parse. */
export type ModuleFinish = (target: ModuleFinishTarget) => void

type ItemPlugin = {
  readonly name: string
  readonly topLevel?: TopLevelRecognizer | undefined
  readonly items?: Readonly<Record<string, ModuleItemEmitter>> | undefined
  readonly methodCalls?: Readonly<Record<string, MethodCallRecognizer>> | undefined
  readonly callExprs?: CallExprRecognizer | undefined
  readonly exprs?: Readonly<Record<string, ExprEmitter>> | undefined
  readonly refineStructs?: StructRefinement | undefined
  readonly finishModule?: ModuleFinish | undefined
}

/** One compiler instance's module-level hooks. */
export interface ItemRegistry {
  /** Top-level recognizers in plugin order. */
  readonly topLevel: readonly { readonly owner: string; readonly recognize: TopLevelRecognizer }[]
  /** Plugin name → item type → emitter. */
  readonly emitters: ReadonlyMap<string, ReadonlyMap<string, ModuleItemEmitter>>
  emitter(plugin: string, type: string): ModuleItemEmitter | undefined
  /** Method name → recognizers in plugin order. A call with no claimant costs one `Map.get`. */
  readonly methodCalls: ReadonlyMap<string, readonly { readonly owner: string; readonly recognize: MethodCallRecognizer }[]>
  /** Recognizers registered under `'*'` — they see every method call, after the ones keyed by its own name. */
  readonly anyMethodCalls: readonly { readonly owner: string; readonly recognize: MethodCallRecognizer }[]
  /** Call-expression recognizers in plugin order. */
  readonly callExprs: readonly { readonly owner: string; readonly recognize: CallExprRecognizer }[]
  readonly exprEmitters: ReadonlyMap<string, ReadonlyMap<string, ExprEmitter>>
  exprEmitter(plugin: string, type: string): ExprEmitter | undefined
  readonly structRefinements: readonly { readonly owner: string; readonly refine: StructRefinement }[]
  readonly finishers: readonly { readonly owner: string; readonly finish: ModuleFinish }[]
}

/**
 * Build the registry from every plugin's module-level hooks, in plugin order. A `(plugin, type)` pair cannot
 * collide (the plugin name is the namespace) and recognizers are shape tests, not name claims — two plugins
 * may both see a `safeParse` call, and the first to return an expression owns it — so nothing here conflicts.
 *
 * @example
 * createItemRegistry([{ name: '@acme/toy', topLevel: () => undefined, items: { toy } }])
 */
export function createItemRegistry(plugins: readonly ItemPlugin[]): ItemRegistry {
  const topLevel: { owner: string; recognize: TopLevelRecognizer }[] = []
  const emitters = new Map<string, ReadonlyMap<string, ModuleItemEmitter>>()
  const methodCalls = new Map<string, { owner: string; recognize: MethodCallRecognizer }[]>()
  const anyMethodCalls: { owner: string; recognize: MethodCallRecognizer }[] = []
  const callExprs: { owner: string; recognize: CallExprRecognizer }[] = []
  const exprEmitters = new Map<string, ReadonlyMap<string, ExprEmitter>>()
  const structRefinements: { owner: string; refine: StructRefinement }[] = []
  const finishers: { owner: string; finish: ModuleFinish }[] = []
  for (const plugin of plugins) {
    if (plugin.topLevel !== undefined) topLevel.push({ owner: plugin.name, recognize: plugin.topLevel })
    if (plugin.items !== undefined) emitters.set(plugin.name, new Map(Object.entries(plugin.items)))
    for (const [method, recognize] of Object.entries(plugin.methodCalls ?? {})) {
      if (method === '*') {
        anyMethodCalls.push({ owner: plugin.name, recognize })
        continue
      }
      const list = methodCalls.get(method) ?? []
      list.push({ owner: plugin.name, recognize })
      methodCalls.set(method, list)
    }
    if (plugin.callExprs !== undefined) callExprs.push({ owner: plugin.name, recognize: plugin.callExprs })
    if (plugin.exprs !== undefined) exprEmitters.set(plugin.name, new Map(Object.entries(plugin.exprs)))
    if (plugin.refineStructs !== undefined) structRefinements.push({ owner: plugin.name, refine: plugin.refineStructs })
    if (plugin.finishModule !== undefined) finishers.push({ owner: plugin.name, finish: plugin.finishModule })
  }
  return Object.freeze<ItemRegistry>({
    topLevel: Object.freeze(topLevel),
    emitters,
    emitter: (plugin, type) => emitters.get(plugin)?.get(type),
    methodCalls,
    anyMethodCalls: Object.freeze(anyMethodCalls),
    callExprs: Object.freeze(callExprs),
    exprEmitters,
    exprEmitter: (plugin, type) => exprEmitters.get(plugin)?.get(type),
    structRefinements: Object.freeze(structRefinements),
    finishers: Object.freeze(finishers),
  })
}

/**
 * Turn a recognizer's item into the stamped one. Fails loudly (naming the plugin) when the `type` has no
 * emitter or the payload is not JSON — both would otherwise surface far away, as a missing declaration or as
 * a `structuredClone` error in a later pass.
 */
export function stampModuleItem(registry: ItemRegistry, owner: string, spec: ExtItemSpec): ExtModuleItem {
  if (registry.emitter(owner, spec.type) === undefined) {
    throw new Error(
      `[Pyreon] Plugin "${owner}" recognized a module item of type "${spec.type}" but declares no \`items.${spec.type}\` emitter.`,
    )
  }
  const payload = spec.payload ?? {}
  if (!isJson(payload, new Set())) {
    throw new Error(
      `[Pyreon] Plugin "${owner}" module item "${spec.type}" has a payload that is not JSON (functions, NaN, class instances and cycles are refused) — the compiler clones its IR between passes.`,
    )
  }
  return { plugin: owner, type: spec.type, name: spec.name, payload: payload as ExtModuleItem['payload'] }
}

/** The `ext-expr` node for a method-call recognizer's spec, with the same checks as {@link stampModuleItem}. */
export function stampExtExpr(registry: ItemRegistry, owner: string, spec: ExtExprSpec): ExtExprIR {
  if (registry.exprEmitter(owner, spec.type) === undefined) {
    throw new Error(
      `[Pyreon] Plugin "${owner}" recognized an expression of type "${spec.type}" but declares no \`exprs.${spec.type}\` emitter.`,
    )
  }
  const payload = spec.payload ?? {}
  if (!isJson(payload, new Set())) {
    throw new Error(
      `[Pyreon] Plugin "${owner}" expression "${spec.type}" has a payload that is not JSON (functions, NaN, class instances and cycles are refused) — the compiler clones its IR between passes.`,
    )
  }
  return { kind: 'ext-expr', plugin: owner, type: spec.type, payload, args: [...(spec.args ?? [])] }
}

/** Render an item through its owner's emitter. */
export function emitModuleItem(
  registry: ItemRegistry,
  item: ExtModuleItem,
  target: 'swift' | 'kotlin',
  ctx: EmitContext,
): readonly string[] {
  const emitter = registry.emitter(item.plugin, item.type)
  if (emitter === undefined) {
    throw new Error(
      `[Pyreon] module item "${item.type}" of plugin "${item.plugin}" has no emitter in this compiler — the plugin that recognized it is not loaded here.`,
    )
  }
  return target === 'swift' ? emitter.swift(item, ctx) : emitter.kotlin(item, ctx)
}

/** Render an `ext-expr` through its owner's emitter. */
export function emitExtExpr(
  registry: ItemRegistry,
  e: ExtExprIR,
  target: 'swift' | 'kotlin',
  ctx: SwiftEmitContext | KotlinEmitContext,
): string {
  const emitter = registry.exprEmitter(e.plugin, e.type)
  if (emitter === undefined) {
    throw new Error(
      `[Pyreon] expression "${e.type}" of plugin "${e.plugin}" has no emitter in this compiler — the plugin that recognized it is not loaded here.`,
    )
  }
  return target === 'swift' ? emitter.swift(e, ctx as SwiftEmitContext) : emitter.kotlin(e, ctx as KotlinEmitContext)
}

/**
 * The field-validator provider for a form's `schema: <name>`: the item named `name` whose emitter offers
 * {@link FieldValidators}, with the fields it can validate.
 */
export function findFieldValidators(
  registry: ItemRegistry,
  items: readonly ExtModuleItem[],
  name: string,
): { readonly item: ExtModuleItem; readonly validators: FieldValidators; readonly fields: readonly string[] } | undefined {
  for (const item of items) {
    if (item.name !== name) continue
    const validators = registry.emitter(item.plugin, item.type)?.fieldValidators
    if (validators === undefined) continue
    const fields = validators.fields(item)
    if (fields.length > 0) return { item, validators, fields }
  }
  return undefined
}

/** What the "no declaration by that name" warning says declares a validating item, from every loaded provider. */
export function fieldValidatorsAdvice(registry: ItemRegistry): string | undefined {
  const seen = new Set<string>()
  for (const emitters of registry.emitters.values()) {
    for (const emitter of emitters.values()) {
      const by = emitter.fieldValidators?.declaredBy
      if (by !== undefined) seen.add(by)
    }
  }
  return seen.size === 0 ? undefined : [...seen].join('/')
}
