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
  /** Top-level declarations inside the component body. */
  decls: DeclIR[]
  /** The expression the component returns. */
  returnExpr: ExprIR
}

export type DeclIR =
  | { kind: 'signal'; name: string; type: TypeIR; initial: ExprIR }
  | { kind: 'computed'; name: string; expr: ExprIR }

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
  | { kind: 'unknown' }

export type ExprIR =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'identifier'; name: string }
  | { kind: 'call'; callee: ExprIR; args: ExprIR[] }
  | { kind: 'member'; object: ExprIR; property: string }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%'; left: ExprIR; right: ExprIR }
  | { kind: 'arrow'; params: string[]; body: ExprIR }
  | { kind: 'jsx-element'; tag: string; attrs: AttrIR[]; children: ChildIR[] }
  | { kind: 'jsx-fragment'; children: ChildIR[] }
  | { kind: 'array'; elements: ExprIR[] }
  | { kind: 'object'; fields: { name: string; value: ExprIR }[] }
  | { kind: 'paren'; inner: ExprIR }

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

export interface ParseResult {
  components: ComponentIR[]
  /** Diagnostic messages produced during IR construction. */
  warnings: string[]
}

export interface TransformResult {
  /** Emitted source code for the target language. */
  code: string
  /** Diagnostic messages from the IR construction. */
  warnings: string[]
}
