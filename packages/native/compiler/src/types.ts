// Internal IR (intermediate representation) for Pyreon → native emit.
//
// The compiler parses a Pyreon JSX source to oxc AST, walks the AST to
// build this IR, then each target emitter (Swift / Kotlin) consumes the
// IR. Decoupling via IR means new targets just add a new emitter; the
// parser-side never changes.
//
// IR shape is intentionally minimal for Phase 0 — only what the seven
// starter fixtures need. Grows as more constructs land.

export type TargetLanguage = 'swift' | 'kotlin'

export interface EmitOptions {
  target: TargetLanguage
}

export interface ComponentIR {
  /** Component name from `export function NAME(...)`. */
  name: string
  /**
   * Component props parsed from the function's first parameter when it
   * carries an object type annotation. The parameter binding name (`props`,
   * `p`, etc.) is captured separately so the emitter can rewrite member
   * accesses like `props.title` → `title` on the target. Empty when the
   * component takes no params or the param is untyped.
   */
  props: PropIR[]
  /**
   * The first-parameter binding name (`props`, `p`, etc.) used to recognise
   * `<paramName>.field` member accesses inside the body and rewrite them to
   * bare field references on the target. Undefined for prop-less components.
   */
  propsParamName: string | undefined
  /** Top-level declarations inside the component body. */
  decls: DeclIR[]
  /** The expression the component returns. */
  returnExpr: ExprIR
}

export interface PropIR {
  /** Prop name (the field key in the JSX `<Comp x={...}>` site). */
  name: string
  /** Declared type from the TS annotation. */
  type: TypeIR
}

export type DeclIR =
  /**
   * Reactive signal declaration. The classic shape is `signal<T>(initial)`
   * — emits as `@State` on Swift / `mutableStateOf` on Kotlin.
   *
   * G5 (TodoMVC walkthrough) adds `storageKey` for persistent signals
   * declared via `useStorage<T>('key', default)`. When set, the Swift
   * emit shifts to `@AppStorage("key")` (SwiftUI's persistent property
   * wrapper) and the Kotlin emit shifts to `rememberSaveable` (Compose's
   * state-preservation primitive). `storageKey` is `undefined` for
   * regular signals — emit paths default to the non-storage shape.
   */
  | { kind: 'signal'; name: string; type: TypeIR; initial: ExprIR; storageKey?: string }
  /**
   * Computed value via `computed(() => expr)` or `computed(() => { ... })`.
   * The legacy single-expression form populates `expr`. Multi-statement
   * BlockStatement bodies populate `body` with the full statement
   * sequence — emit produces a multi-statement getter
   * (`private var X: T { let x = ...; if cond { return X } ; return Y }`).
   *
   * Exactly one of `expr` / `body` is populated. Phase 2 follow-up
   * closing the TodoMVC `visible: Any { xs }` typecheck blocker.
   */
  | { kind: 'computed'; name: string; expr?: ExprIR; body?: StatementIR[] }
  /**
   * Local function declaration via `const fn = () => { ... }`
   * (Parser-A from `native-platforms-todomvc-walkthrough.md`). Emits
   * as a `private func` on Swift / a private fn on Kotlin.
   *
   * Multi-statement BlockStatement bodies are supported via `body`
   * carrying StatementIR[]; a single-expression arrow body lands as
   * `body: [{ kind: 'return', expr }]` for uniformity.
   */
  | {
      kind: 'function'
      name: string
      params: { name: string; type: TypeIR }[]
      returnType: TypeIR
      body: StatementIR[]
    }
  /**
   * Router instance declaration via `createRouter({ routes: [...] })`
   * from `@pyreon/router`. Phase C4 shipped the SCAFFOLD (bare instance
   * emit); Phase C5 ADDS optional `routes: RouteIR[]` so the emitter
   * can produce per-target route definitions:
   *   Swift   →  @State private var router = PyreonRouter()
   *              + `.navigationDestination(for: String.self)` block
   *                inside the `<RouterProvider>` content closure
   *   Kotlin  →  val router = remember { PyreonRouter() }
   *              + `NavHost { composable("/path") { Component() } }`
   *                block replacing the bare RouterProvider content
   *
   * `routes` is undefined when the parser couldn't extract a literal
   * routes array (e.g. `createRouter()`, `createRouter(opts)` with a
   * non-literal config, or an object literal that doesn't match the
   * expected `{ routes: [{ path, component }, ...] }` shape). In that
   * case the emit falls back to the C4 bare-instance shape — back-compat.
   */
  | { kind: 'router'; name: string; routes?: RouteIR[] }
  /**
   * Router hook binding via `useNavigate()` or `useParams()` from
   * `@pyreon/router`. Phase C4 maps these directly to the native
   * runtimes' identically-named hooks:
   *   Swift   →  let navigate = useNavigate(router: pyreonRouter)
   *              (the View struct gains `@Environment(\.pyreonRouter)
   *               private var pyreonRouter` automatically)
   *   Kotlin  →  val navigate = useNavigate()
   *              (Compose function reads LocalPyreonRouter.current
   *               directly via CompositionLocal — no transform needed)
   *
   * `useParams()` follows the same shape.
   */
  | { kind: 'router-hook'; name: string; hook: 'navigate' | 'params' }

/**
 * Phase C5 — one route entry parsed from `createRouter({ routes: [...] })`.
 * Mirrors the web-side `RouteRecord<TPath>` shape from `@pyreon/router`,
 * intentionally narrowed to PATH + COMPONENT for v1.
 *
 * `path` is captured as the string-literal pattern (`/`, `/users/:id`).
 * The native emit walks it character-by-character — literal segments
 * become exact `==` comparisons (Swift) / fixed strings (Compose); `:name`
 * segments become param-capture slots.
 *
 * `component` is an `ExprIR` so it can carry any reachable component
 * expression — bare identifier (`HomePage`), property access
 * (`pages.Home`), or even a call. Phase 0 supports identifier and
 * member shapes; other shapes fall back to literal emit (the verbatim
 * source string).
 *
 * Deferred to future arcs: loader, guards, meta, middleware, children
 * (nested layouts), name. Phase C5 ships the route-resolution
 * minimum — the rest extends when a real app needs it.
 */
export interface RouteIR {
  /** Literal path pattern, e.g. `/` or `/users/:id`. */
  path: string
  /** Component to render for this route. */
  component: ExprIR
}

/**
 * Statement IR — sequence of operations inside a function body. The
 * existing parser walks Pyreon JSX components via top-level
 * VariableDeclaration / ReturnStatement; this adds the imperative
 * shape needed for TodoMVC's mutation functions (`addTodo`, `toggle`,
 * `remove`, `clearCompleted`).
 *
 * Kinds intentionally minimal for the immediate TodoMVC slice:
 * `let` (local const binding), `if` (with optional else), `return`,
 * and `expr` (call-expression as statement). Future expansions
 * (`for`, `while`, `try`) deliberately deferred.
 */
export type StatementIR =
  /** `const text = draft().trim()` — local const binding inside fn body. */
  | { kind: 'let'; name: string; expr: ExprIR }
  /** `if (cond) { then } [else { else }]`. */
  | { kind: 'if'; cond: ExprIR; then: StatementIR[]; elseBody?: StatementIR[] }
  /** `return [expr]` — bare early-return uses `expr: undefined`. */
  | { kind: 'return'; expr?: ExprIR }
  /** Bare expression statement: `todos.set([...])`, `draft.set('')`. */
  | { kind: 'expr'; expr: ExprIR }

/** Type annotation, parsed from `signal<T>(...)` generics. */
export type TypeIR =
  | { kind: 'number' }
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'array'; element: TypeIR }
  | { kind: 'object'; fields: { name: string; type: TypeIR }[] }
  | { kind: 'null' }
  | { kind: 'undefined' }
  /**
   * Union types — `string | number`, `Foo | null` (nullable), etc.
   * The branches are flat (no nested unions); the type mapper handles
   * the common nullable shapes (`T | null`, `T | undefined`) by
   * emitting Swift/Kotlin Optional / nullable types; mixed-type unions
   * (`string | number`) fall back to `Any` per target since neither
   * Swift nor Kotlin has a structural union primitive.
   */
  | { kind: 'union'; branches: TypeIR[] }
  /**
   * Named type reference — `Foo`, `MyInterface`. The Phase 0 parser
   * doesn't follow imports, so it can't resolve the referenced type.
   * The reference is preserved by name and emitted verbatim per target
   * (Swift / Kotlin both accept named type references resolved at
   * their respective compile time). Generic args (e.g. `Array<T>`)
   * propagate.
   */
  | { kind: 'typeRef'; name: string; args: TypeIR[] }
  /**
   * Function type — `(a: number, b: string) => boolean`. Captures
   * each parameter's name (when present in source) + type, and the
   * return type. Names are kept in IR for debugging + future use;
   * Swift / Kotlin function types are positional so the emitter
   * drops the names at emit time.
   */
  | { kind: 'function'; params: { name?: string; type: TypeIR }[]; returnType: TypeIR }
  | { kind: 'unknown' }

export type ExprIR =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'identifier'; name: string }
  | { kind: 'call'; callee: ExprIR; args: ExprIR[] }
  | { kind: 'member'; object: ExprIR; property: string }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%'; left: ExprIR; right: ExprIR }
  /**
   * Comparison + equality operators emit as-is on both Swift and Kotlin
   * (`==` / `!=` / `<` / `>` / `<=` / `>=`). Added in the Parser-A slice
   * because TodoMVC's filter conditionals (`t.id === id`, `filter() === 'active'`)
   * require them. Pyreon source uses `===` / `!==` which JS-evaluates
   * the same as `==` / `!=` for the value types Pyreon signals carry;
   * the emitter coalesces to the native target's `==` / `!=`.
   */
  | {
      kind: 'comparison'
      op: '==' | '!=' | '<' | '>' | '<=' | '>='
      left: ExprIR
      right: ExprIR
    }
  /**
   * Unary operators (Parser-B). TodoMVC uses `!t.done` in filter
   * callbacks. Both Swift and Kotlin support `!` / `-` / `+` as
   * prefix unary; the emitter passes them through verbatim.
   */
  | { kind: 'unary'; op: '!' | '-' | '+'; argument: ExprIR }
  /**
   * Logical operators (Parser-C). TodoMVC uses `e.key === 'Enter' && addTodo()`
   * in the keyboard handler. Swift and Kotlin both have `&&` / `||` with
   * the same short-circuit semantics. JS's `??` (nullish coalescing) maps
   * differently per target but isn't in the TodoMVC slice — deferred.
   */
  | { kind: 'logical'; op: '&&' | '||'; left: ExprIR; right: ExprIR }
  /**
   * Ternary conditional (`cond ? a : b`). Both Swift and Kotlin have
   * the ternary form verbatim (Kotlin uses `if (cond) a else b` as the
   * idiomatic equivalent — same expression-form semantics). TodoMVC's
   * `toggle` uses this in the map callback.
   */
  | { kind: 'ternary'; cond: ExprIR; then: ExprIR; otherwise: ExprIR }
  /**
   * Post-increment / -decrement (`x++`, `x--`). JavaScript evaluates
   * to the OLD value while side-effect-incrementing. In Pyreon source
   * the common use is `someCounter++` in an array literal (TodoMVC:
   * `{ id: nextId++, ... }`). The emit on both Swift and Kotlin
   * degrades to `x + 1` for the value (Swift @State / Kotlin var don't
   * support `++` natively in expression position) — the side-effect
   * increment is lost. Phase 2 refines if needed.
   */
  | { kind: 'update'; op: '++' | '--'; argument: ExprIR }
  | { kind: 'arrow'; params: string[]; body: ExprIR }
  | { kind: 'jsx-element'; tag: string; attrs: AttrIR[]; children: ChildIR[] }
  | { kind: 'jsx-fragment'; children: ChildIR[] }
  | { kind: 'array'; elements: ExprIR[] }
  /**
   * Object literal with optional spread members. The classic shape is
   * `{ a: 1, b: 2 }` (zero spreads); G4 (TodoMVC walkthrough) adds the
   * partial-update form `{ ...t, done: !t.done }` — the spread carries
   * the existing fields, the explicit fields override.
   *
   * Spreads are emitted in source order; emit targets that support a
   * native copy-with-overrides shape (Kotlin data class `.copy()`,
   * Swift struct construction) consume the array. `spreads.length === 0`
   * is the canonical zero-spread case; the field is optional for
   * backward compat with pre-G4 IR consumers.
   */
  | { kind: 'object'; fields: { name: string; value: ExprIR }[]; spreads?: ExprIR[] }
  | { kind: 'paren'; inner: ExprIR }
  /**
   * Spread element in array literal (`[...todos(), newTodo]`) used by
   * TodoMVC's mutation functions. The emit on Swift becomes `todos +
   * [newTodo]` (immutable concat) — preserves the source's
   * value-semantics. Kotlin emit: `todos + listOf(newTodo)`.
   */
  | { kind: 'spread'; argument: ExprIR }

export type AttrIR =
  /** Regular attribute: `each={items}`, `by={(i) => i.id}`, `when={visible}`. */
  | { kind: 'attr'; name: string; value: ExprIR }
  /** Event handler: `onClick={() => …}`. The 'on' prefix is stripped from `name`. */
  | { kind: 'event'; name: string; handler: ExprIR }

export type ChildIR =
  /** Static text between JSX tags: `<Text>Hello</Text>`. */
  | { kind: 'text'; value: string }
  /** Interpolation: `<Text>{count}</Text>`. */
  | { kind: 'expr'; expr: ExprIR }

/**
 * String-literal union type alias emitted as a native enum. Source:
 *
 *   type Filter = 'all' | 'active' | 'completed'
 *
 * Swift emit:
 *
 *   enum Filter: String { case all, active, completed }
 *
 * Kotlin emit:
 *
 *   enum class Filter { all, active, completed }
 *
 * Pyreon's signal-based reactivity is structurally aligned with both
 * targets' enum primitives — using a native enum is strictly better
 * than emitting raw String (typesafe; pattern-match-able) AND lets the
 * compiler convert literal usages (`'all'` → `.all` on Swift) at the
 * use site. Closes gap G6 from `native-platforms-todomvc-walkthrough.md`.
 */
export interface EnumIR {
  /** Alias name from `type X = ...` declaration. */
  name: string
  /** Allowed values from the union branches (`'all'` → `'all'`). */
  cases: string[]
}

/**
 * Object-shape type alias emitted as a native struct / data class. Source:
 *
 *   type Todo = { id: number; text: string; done: boolean }
 *
 * Swift emit:
 *
 *   struct Todo { var id: Int; var text: String; var done: Bool }
 *
 * Kotlin emit:
 *
 *   data class Todo(var id: Int, var text: String, var done: Boolean)
 *
 * Closes the foundational Phase 2 gap surfaced by G5 #849's known
 * caveats: anonymous record types currently emit as labelled tuples,
 * blocking @AppStorage's Codable bridge (Swift) and rememberSaveable's
 * Parcelable/Saver requirements (Kotlin). Real structs let downstream
 * Phase 2 work add Codable conformance + Compose Savers.
 *
 * `var` fields (not `let` / `val`) so the G4 IIFE-copy pattern's tuple
 * mutation idiom — `{ var c = t; c.done = !t.done; return c }()` —
 * works structurally when `t` is upgraded from tuple to struct.
 * Kotlin's `data class .copy(done = ...)` doesn't need this but the
 * `var` default keeps the option open for direct field mutation.
 */
export interface StructIR {
  /** Alias name from `type X = ...` declaration. */
  name: string
  /** Object-type fields. */
  fields: { name: string; type: TypeIR }[]
}

/**
 * Module-level mutable binding emitted at file scope on the target.
 * Source:
 *
 *   let nextId = 1
 *   const APP_VERSION = '1.0.0'
 *
 * Swift emit:
 *
 *   private var nextId: Int = 1
 *   private let APP_VERSION: String = "1.0.0"
 *
 * Kotlin emit:
 *
 *   private var nextId: Int = 1
 *   private val APP_VERSION: String = "1.0.0"
 *
 * Phase 2 follow-up closing the "TodoMVC's `nextId` undefined in Swift
 * scope" gap surfaced by the post-Phase-2-trilogy typecheck. The TS
 * source's `let` declares a mutable binding; `const` declares immutable.
 * Pyreon convention preserves the mutability through to the target —
 * `let` → `var`/`var`, `const` → `let`/`val`.
 *
 * Type field: explicit annotation when source carries one, otherwise
 * `unknown` (target falls back to type-inference at compile time).
 */
export interface ModuleDeclIR {
  name: string
  /** `var` (TS `let`) or `let` (TS `const`). Preserves source mutability. */
  mutable: boolean
  /** Type annotation; `unknown` when source omits it. */
  type: TypeIR
  /** Initial-value expression. */
  initial: ExprIR
}

export interface ParseResult {
  components: ComponentIR[]
  /** String-literal-union type aliases lifted to native enums. */
  enums: EnumIR[]
  /** Object-shape type aliases lifted to native structs / data classes. */
  structs: StructIR[]
  /** Module-level mutable / immutable bindings emitted at file scope. */
  moduleDecls: ModuleDeclIR[]
  /** Diagnostic messages produced during IR construction. */
  warnings: string[]
}

export interface TransformResult {
  /** Emitted source code for the target language. */
  code: string
  /** Diagnostic messages from the IR construction. */
  warnings: string[]
}
