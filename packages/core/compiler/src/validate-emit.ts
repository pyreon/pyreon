/**
 * Validate-Emit — compile-time specialized validators for `@pyreon/validate`.
 *
 * `@pyreon/validate`'s runtime already JIT-compiles a schema's op array into one
 * closure (`jit.ts`). This module is the BUILD-TIME analogue: it reads a schema
 * DEFINITION from source (`s.object({ email: s.string().email(), age:
 * s.number().int() })`), parses it into a typed IR, and emits a monomorphic,
 * fully-inlined validator function as source code — the typia-class approach.
 * No op-array traversal, no closure dispatch, no per-check function calls; just
 * straight-line `typeof` / regex / comparison checks specialized to the exact
 * shape.
 *
 * Two pure entry points, mirroring the `analyzeReactivity` sidecar:
 *   - {@link analyzeValidate} — source → `ValidateSchemaInfo[]` (the IR). Pure,
 *     deterministic, TS-compiler-API based. Conservative: any shape it doesn't
 *     recognize becomes an `unsupported` node (and the schema is not
 *     `emittable`), so a partial-understanding never produces a wrong validator.
 *   - {@link emitValidator} — an EMITTABLE IR node → validator source string.
 *
 * Scope (slice 1): primitives `string` / `number` / `boolean` / `literal` with
 * their common checks, plus `object` / `array` composition and the `.optional()`
 * modifier. Everything else bails to `unsupported`. The emitted validator's
 * verdict (zero issues ⟺ valid) is equivalence-tested against the real runtime
 * `s` schema in `tests/validate-emit.test.ts`.
 *
 * Both `@pyreon/vite-plugin` consumers are SHIPPED: `optimizeValidators`
 * (rewrites module-level `s.` chains to the tree-shakeable `/mini` form via
 * `emitSchemaSource`) and `compileValidators` (attaches emitted monomorphic
 * `.is()` verdicts via `emitValidator`). A chain using a check OUTSIDE this
 * slice's scope (e.g. `.cuid2()`, unions, records) analyzes as
 * non-`emittable` and gracefully keeps the full runtime — correctness never
 * depends on the emit; widening the slice widens the optimization coverage.
 *
 * @module
 */

import ts from 'typescript'
import { assertClassicTs } from './ts'

// ─── IR ──────────────────────────────────────────────────────────────────────

export type StringCheck =
  | { kind: 'min'; n: number }
  | { kind: 'max'; n: number }
  | { kind: 'length'; n: number }
  | { kind: 'email' }
  | { kind: 'url' }
  | { kind: 'uuid' }
  | { kind: 'nonempty' }
  | { kind: 'regex'; source: string; flags: string }

export type NumberCheck =
  | { kind: 'int' }
  | { kind: 'min'; n: number } // >=
  | { kind: 'max'; n: number } // <=
  | { kind: 'gt'; n: number }
  | { kind: 'lt'; n: number }
  | { kind: 'positive' }
  | { kind: 'negative' }

export type ValidateNode =
  | { kind: 'string'; checks: StringCheck[] }
  | { kind: 'number'; checks: NumberCheck[] }
  | { kind: 'boolean' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'object'; fields: ValidateField[] }
  | { kind: 'array'; element: ValidateNode }
  | { kind: 'optional'; inner: ValidateNode }
  | { kind: 'unsupported'; reason: string }

export interface ValidateField {
  key: string
  value: ValidateNode
}

export interface ValidateSchemaInfo {
  /** Variable name the schema is assigned to, or `null` for an anonymous expression. */
  name: string | null
  /** 1-based line of the schema expression. */
  line: number
  /** 0-based column. */
  column: number
  /** Character offset where the schema initializer expression starts (for source rewrite). */
  start: number
  /** Character offset where the schema initializer expression ends (exclusive). */
  end: number
  /** The parsed IR (may contain `unsupported` nodes). */
  node: ValidateNode
  /** True iff the IR contains no `unsupported` node — i.e. `emitValidator` is safe. */
  emittable: boolean
  /**
   * True iff the schema is a MODULE-LEVEL `const`/`let`/`var` declaration
   * (`VariableDeclarationList → VariableStatement → SourceFile`). The
   * `@pyreon/vite-plugin` verdict-emit appends `name._attachCompiledVerdict(…)`
   * at module end, which is only sound when `name` is in module scope — a
   * function-scoped schema would be a ReferenceError at module load.
   */
  topLevel: boolean
}

// Regexes copied VERBATIM from `@pyreon/validate`'s `string.ts` so the emitted
// verdict is byte-identical to the runtime (`email` is the strict standard
// default — 2+ char TLD, no leading/consecutive dots). Emitted via `reExpr`
// (`new RegExp(re.source, re.flags)`) so a literal can't drift in transcription.
const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Emit a faithful `new RegExp(...)` call source from a real RegExp. */
function reExpr(re: RegExp): string {
  return `new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)})`
}

// ─── Analysis ────────────────────────────────────────────────────────────────

const UNSUP = (reason: string): ValidateNode => ({ kind: 'unsupported', reason })

interface ChainSegment {
  name: string
  args: ts.NodeArray<ts.Expression>
}

/**
 * Unwind a method chain `s.X(...).a(...).b(...)` into ordered segments
 * (inner→outer, segment[0] is the base factory). Returns `null` when the chain
 * is not rooted in the `s` identifier (so it's not a `@pyreon/validate` schema).
 */
function unwindChain(expr: ts.Expression): ChainSegment[] | null {
  const segments: ChainSegment[] = []
  let cur: ts.Expression = expr
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    const pa = cur.expression
    segments.push({ name: pa.name.text, args: cur.arguments })
    cur = pa.expression
  }
  if (!ts.isIdentifier(cur) || cur.text !== 's') return null
  segments.reverse()
  return segments.length > 0 ? segments : null
}

/** Extract a numeric literal (incl. unary minus) from a method's first arg, or `null`. */
function numArg(args: ts.NodeArray<ts.Expression>): number | null {
  const a = args[0]
  if (!a) return null
  if (ts.isNumericLiteral(a)) return Number(a.text)
  if (ts.isPrefixUnaryExpression(a) && a.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(a.operand)) {
    return -Number(a.operand.text)
  }
  return null
}

/** Extract a literal value (string / number / boolean) for `s.literal(...)`. */
function literalArg(args: ts.NodeArray<ts.Expression>): string | number | boolean | undefined {
  const a = args[0]
  if (!a) return undefined
  if (ts.isStringLiteral(a)) return a.text
  if (ts.isNumericLiteral(a)) return Number(a.text)
  if (a.kind === ts.SyntaxKind.TrueKeyword) return true
  if (a.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isPrefixUnaryExpression(a) && a.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(a.operand)) {
    return -Number(a.operand.text)
  }
  return undefined
}

function applyStringMethod(checks: StringCheck[], seg: ChainSegment): ValidateNode | null {
  switch (seg.name) {
    case 'min': {
      const n = numArg(seg.args)
      if (n === null) return UNSUP('string.min non-literal')
      checks.push({ kind: 'min', n })
      return null
    }
    case 'max': {
      const n = numArg(seg.args)
      if (n === null) return UNSUP('string.max non-literal')
      checks.push({ kind: 'max', n })
      return null
    }
    case 'length': {
      const n = numArg(seg.args)
      if (n === null) return UNSUP('string.length non-literal')
      checks.push({ kind: 'length', n })
      return null
    }
    case 'email':
      checks.push({ kind: 'email' })
      return null
    case 'url':
      checks.push({ kind: 'url' })
      return null
    case 'uuid':
      checks.push({ kind: 'uuid' })
      return null
    case 'nonEmpty': // runtime method is camelCase `.nonEmpty()`
      checks.push({ kind: 'nonempty' })
      return null
    case 'regex': {
      const a = seg.args[0]
      if (a && ts.isRegularExpressionLiteral(a)) {
        // `/src/flags` → strip the slashes, split off the trailing flags.
        const m = /^\/(.*)\/([a-z]*)$/s.exec(a.text)
        if (m) {
          checks.push({ kind: 'regex', source: m[1] ?? '', flags: m[2] ?? '' })
          return null
        }
      }
      return UNSUP('string.regex non-literal')
    }
    default:
      return UNSUP(`string.${seg.name}`)
  }
}

function applyNumberMethod(checks: NumberCheck[], seg: ChainSegment): ValidateNode | null {
  switch (seg.name) {
    case 'int':
      checks.push({ kind: 'int' })
      return null
    case 'positive':
      checks.push({ kind: 'positive' })
      return null
    case 'negative':
      checks.push({ kind: 'negative' })
      return null
    case 'min':
    case 'max':
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte': {
      const n = numArg(seg.args)
      if (n === null) return UNSUP(`number.${seg.name} non-literal`)
      const kind = seg.name === 'gte' ? 'min' : seg.name === 'lte' ? 'max' : (seg.name as 'min' | 'max' | 'gt' | 'lt')
      checks.push({ kind, n })
      return null
    }
    default:
      return UNSUP(`number.${seg.name}`)
  }
}

function parseObjectLiteral(arg: ts.Expression | undefined): ValidateNode {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return UNSUP('object non-literal shape')
  const fields: ValidateField[] = []
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) return UNSUP('object spread/shorthand/method')
    let key: string
    if (ts.isIdentifier(prop.name)) key = prop.name.text
    else if (ts.isStringLiteral(prop.name)) key = prop.name.text
    else return UNSUP('object computed key')
    fields.push({ key, value: parseExpr(prop.initializer) })
  }
  return { kind: 'object', fields }
}

/** Parse any expression to a `ValidateNode` (the recursive entry for fields/elements). */
function parseExpr(expr: ts.Expression): ValidateNode {
  const segments = unwindChain(expr)
  if (!segments) return UNSUP('not an s.* chain')
  return parseChain(segments)
}

function parseChain(segments: ChainSegment[]): ValidateNode {
  const base = segments[0]!
  const methods = segments.slice(1)

  let node: ValidateNode
  switch (base.name) {
    case 'string':
      node = { kind: 'string', checks: [] }
      break
    case 'number':
      node = { kind: 'number', checks: [] }
      break
    case 'boolean':
      node = { kind: 'boolean' }
      break
    case 'literal': {
      const v = literalArg(base.args)
      node = v === undefined ? UNSUP('literal non-primitive') : { kind: 'literal', value: v }
      break
    }
    case 'object':
      node = parseObjectLiteral(base.args[0])
      break
    case 'array':
      node = base.args[0] ? { kind: 'array', element: parseExpr(base.args[0]) } : UNSUP('array missing element')
      break
    default:
      return UNSUP(`s.${base.name}`)
  }

  for (const seg of methods) {
    if (node.kind === 'unsupported') return node
    if (seg.name === 'optional') {
      node = { kind: 'optional', inner: node }
      continue
    }
    if (node.kind === 'string') {
      const bail = applyStringMethod(node.checks, seg)
      if (bail) return bail
    } else if (node.kind === 'number') {
      const bail = applyNumberMethod(node.checks, seg)
      if (bail) return bail
    } else {
      // No supported methods on boolean / literal / object / array / optional yet.
      return UNSUP(`${node.kind}.${seg.name}`)
    }
  }
  return node
}

/** Recursively true iff the IR contains no `unsupported` node. */
export function isEmittable(node: ValidateNode): boolean {
  switch (node.kind) {
    case 'unsupported':
      return false
    case 'object':
      return node.fields.every((f) => isEmittable(f.value))
    case 'array':
      return isEmittable(node.element)
    case 'optional':
      return isEmittable(node.inner)
    default:
      return true
  }
}

/**
 * Analyze a source file's `@pyreon/validate` schema definitions. Pure,
 * deterministic. Finds `const X = s.<chain>` declarations (and the schema
 * sub-expressions reachable from them) and returns their parsed IR.
 *
 * @example
 * const [info] = analyzeValidate(`const L = s.object({ e: s.string().email() })`)
 * info.emittable // true
 */
export function analyzeValidate(code: string, filename = 'input.ts'): ValidateSchemaInfo[] {
  let sf: ts.SourceFile
  try {
    assertClassicTs()
    sf = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  } catch {
    return []
  }
  const out: ValidateSchemaInfo[] = []

  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer && unwindChain(n.initializer)) {
      const node = parseExpr(n.initializer)
      const pos = sf.getLineAndCharacterOfPosition(n.initializer.getStart(sf))
      // MODULE-LEVEL iff: VariableDeclaration → VariableDeclarationList →
      // VariableStatement → SourceFile. Anything nested (function body, block,
      // arrow) is NOT safe to attach a module-end verdict to.
      const list = n.parent
      const stmt = list?.parent
      const topLevel =
        !!list && ts.isVariableDeclarationList(list) &&
        !!stmt && ts.isVariableStatement(stmt) &&
        ts.isSourceFile(stmt.parent)
      out.push({
        name: ts.isIdentifier(n.name) ? n.name.text : null,
        line: pos.line + 1,
        column: pos.character,
        start: n.initializer.getStart(sf),
        end: n.initializer.getEnd(),
        node,
        emittable: isEmittable(node),
        topLevel,
      })
      return // don't descend into a recognized schema's internals as separate top-level schemas
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

// ─── Emit ────────────────────────────────────────────────────────────────────

function emitStringChecks(checks: StringCheck[], v: string, path: string): string {
  const lines: string[] = []
  for (const c of checks) {
    switch (c.kind) {
      case 'min':
        lines.push(`if (${v}.length < ${c.n}) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be at least ${c.n} characters`)} })`)
        break
      case 'max':
        lines.push(`if (${v}.length > ${c.n}) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be at most ${c.n} characters`)} })`)
        break
      case 'length':
        lines.push(`if (${v}.length !== ${c.n}) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be exactly ${c.n} characters`)} })`)
        break
      case 'nonempty':
        lines.push(`if (${v}.length === 0) issues.push({ path: ${path}, message: "Must not be empty" })`)
        break
      case 'email':
        lines.push(`if (!${reExpr(EMAIL_RE)}.test(${v})) issues.push({ path: ${path}, message: "Invalid email" })`)
        break
      case 'url':
        lines.push(`if (!${reExpr(URL_RE)}.test(${v})) issues.push({ path: ${path}, message: "Invalid URL" })`)
        break
      case 'uuid':
        lines.push(`if (!${reExpr(UUID_RE)}.test(${v})) issues.push({ path: ${path}, message: "Invalid UUID" })`)
        break
      case 'regex':
        lines.push(`if (!new RegExp(${JSON.stringify(c.source)}, ${JSON.stringify(c.flags)}).test(${v})) issues.push({ path: ${path}, message: "Invalid format" })`)
        break
    }
  }
  return lines.join('\n')
}

function emitNumberChecks(checks: NumberCheck[], v: string, path: string): string {
  const lines: string[] = []
  for (const c of checks) {
    switch (c.kind) {
      case 'int':
        lines.push(`if (!Number.isInteger(${v})) issues.push({ path: ${path}, message: "Must be an integer" })`)
        break
      case 'min':
        lines.push(`if (${v} < ${c.n}) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be >= ${c.n}`)} })`)
        break
      case 'max':
        lines.push(`if (${v} > ${c.n}) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be <= ${c.n}`)} })`)
        break
      case 'gt':
        lines.push(`if (!(${v} > ${c.n})) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be > ${c.n}`)} })`)
        break
      case 'lt':
        lines.push(`if (!(${v} < ${c.n})) issues.push({ path: ${path}, message: ${JSON.stringify(`Must be < ${c.n}`)} })`)
        break
      case 'positive':
        lines.push(`if (!(${v} > 0)) issues.push({ path: ${path}, message: "Must be positive" })`)
        break
      case 'negative':
        lines.push(`if (!(${v} < 0)) issues.push({ path: ${path}, message: "Must be negative" })`)
        break
    }
  }
  return lines.join('\n')
}

/** Emit the issue-collecting statements for `node` over `v` (an expr) at `path` (an array expr). */
// `depth` = the number of ENCLOSING array loops. Each `array` node names its
// loop vars `__i<depth>` / `__e<depth>` so a NESTED array never shadows its
// ancestor's loop var. Without this, two arrays on one root-to-leaf path both
// emitted `__i`/`__e`, and the inner `const __e = __e[__i]` self-referenced the
// outer `__e` in the inner block scope → `Cannot access '__e' before
// initialization` (TDZ) thrown for EVERY input. Under `compileValidators`
// (vite-plugin) that throw is swallowed by the verdict try/catch → `.is()`
// silently returned `false` for valid data. Sibling arrays at the same depth
// (`s.object({ a: s.array(…), b: s.array(…) })`) live in separate `for` block
// scopes, so reusing the same name there is correct — only nesting collides.
function emitNode(node: ValidateNode, v: string, path: string, depth = 0): string {
  switch (node.kind) {
    case 'string': {
      const checks = emitStringChecks(node.checks, v, path)
      return `if (typeof ${v} !== "string") { issues.push({ path: ${path}, message: "Expected string" }) }${checks ? ` else {\n${checks}\n}` : ''}`
    }
    case 'number': {
      const checks = emitNumberChecks(node.checks, v, path)
      return `if (typeof ${v} !== "number" || Number.isNaN(${v})) { issues.push({ path: ${path}, message: "Expected number" }) }${checks ? ` else {\n${checks}\n}` : ''}`
    }
    case 'boolean':
      return `if (typeof ${v} !== "boolean") issues.push({ path: ${path}, message: "Expected boolean" })`
    case 'literal':
      return `if (${v} !== ${JSON.stringify(node.value)}) issues.push({ path: ${path}, message: ${JSON.stringify(`Expected ${JSON.stringify(node.value)}`)} })`
    case 'optional':
      return `if (${v} !== undefined) {\n${emitNode(node.inner, v, path, depth)}\n}`
    case 'array': {
      const i = `__i${depth}`
      const e = `__e${depth}`
      const elemPath = `[...${path}, ${i}]`
      return `if (!Array.isArray(${v})) { issues.push({ path: ${path}, message: "Expected array" }) } else { for (let ${i} = 0; ${i} < ${v}.length; ${i}++) { const ${e} = ${v}[${i}];\n${emitNode(node.element, e, elemPath, depth + 1)}\n} }`
    }
    case 'object': {
      const fieldStmts = node.fields
        .map((f) => {
          const fv = `${v}[${JSON.stringify(f.key)}]`
          const fpath = `[...${path}, ${JSON.stringify(f.key)}]`
          return emitNode(f.value, fv, fpath, depth)
        })
        .join('\n')
      return `if (typeof ${v} !== "object" || ${v} === null || Array.isArray(${v})) { issues.push({ path: ${path}, message: "Expected object" }) } else {\n${fieldStmts}\n}`
    }
    case 'unsupported':
      throw new Error(`[Pyreon] emitValidator: cannot emit an unsupported node (${node.reason})`)
  }
}

/**
 * Emit a specialized validator FUNCTION SOURCE for an emittable IR node. The
 * returned string is an arrow expression `(input) => Issue[]` — zero issues
 * means valid. Throws if the node (or any descendant) is `unsupported`; check
 * {@link isEmittable} first.
 *
 * @example
 * const src = emitValidator({ kind: 'string', checks: [{ kind: 'email' }] })
 * const validate = new Function('return ' + src)()
 * validate('a@b.co').length // 0
 */
export function emitValidator(node: ValidateNode): string {
  if (!isEmittable(node)) throw new Error('[Pyreon] emitValidator: node is not emittable')
  const body = emitNode(node, 'input', '[]')
  return `(input) => {\nconst issues = []\n${body}\nreturn issues\n}`
}

// ─── Schema-source emit (tree-shakeable rewrite target) ──────────────────────
//
// The COUNTERPART to `emitValidator`: instead of lowering the IR to a verdict
// function, lower it to a tree-shakeable `@pyreon/validate/mini` schema
// CONSTRUCTION expression. The user keeps writing the beautiful chainable
// `s.string().email().min(2)`; `@pyreon/vite-plugin` swaps the source for the
// emitted lean form (`string().check(email(), minLength(2))`) so the bundle
// pulls only the constructors + actions used — no second API to learn. Verdict
// + issues stay byte-identical (the mini actions are parity-locked to the
// chainable methods: `validate/tests/mini-parity.test.ts`).

/** Result of {@link emitSchemaSource}. */
export interface SchemaSourceResult {
  /** The lean schema-construction expression (uses `<aliasPrefix><name>` identifiers). */
  code: string
  /** Original `@pyreon/validate/mini` export names referenced (constructors + actions). */
  imports: Set<string>
}

function stringActionExpr(c: StringCheck): { call: string; name: string } {
  switch (c.kind) {
    case 'min':
      return { call: `minLength(${c.n})`, name: 'minLength' }
    case 'max':
      return { call: `maxLength(${c.n})`, name: 'maxLength' }
    case 'length':
      return { call: `length(${c.n})`, name: 'length' }
    case 'email':
      return { call: 'email()', name: 'email' }
    case 'url':
      return { call: 'url()', name: 'url' }
    case 'uuid':
      return { call: 'uuid()', name: 'uuid' }
    case 'nonempty':
      return { call: 'nonEmpty()', name: 'nonEmpty' }
    case 'regex':
      return { call: `regex(${reExpr(new RegExp(c.source, c.flags))})`, name: 'regex' }
  }
}

function numberActionExpr(c: NumberCheck): { call: string; name: string } {
  switch (c.kind) {
    case 'int':
      return { call: 'integer()', name: 'integer' }
    case 'min':
      return { call: `minValue(${c.n})`, name: 'minValue' }
    case 'max':
      return { call: `maxValue(${c.n})`, name: 'maxValue' }
    case 'gt':
      return { call: `gt(${c.n})`, name: 'gt' }
    case 'lt':
      return { call: `lt(${c.n})`, name: 'lt' }
    case 'positive':
      return { call: 'positive()', name: 'positive' }
    case 'negative':
      return { call: 'negative()', name: 'negative' }
  }
}

/** Bare identifier → emit unquoted; anything else → a quoted object key. */
function objectKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
}

function emitSchemaExpr(node: ValidateNode, imports: Set<string>, prefix: string): string {
  const ref = (name: string): string => {
    imports.add(name)
    return prefix + name
  }
  switch (node.kind) {
    case 'string': {
      const ctor = `${ref('string')}()`
      if (node.checks.length === 0) return ctor
      const actions = node.checks.map((c) => {
        const a = stringActionExpr(c)
        imports.add(a.name)
        // `prefix + call` prefixes only the leading action identifier; any
        // `new RegExp(...)` inside the call is a global, left untouched.
        return prefix + a.call
      })
      return `${ctor}.check(${actions.join(', ')})`
    }
    case 'number': {
      const ctor = `${ref('number')}()`
      if (node.checks.length === 0) return ctor
      const actions = node.checks.map((c) => {
        const a = numberActionExpr(c)
        imports.add(a.name)
        return prefix + a.call
      })
      return `${ctor}.check(${actions.join(', ')})`
    }
    case 'boolean':
      return `${ref('boolean')}()`
    case 'literal':
      return `${ref('literal')}(${JSON.stringify(node.value)})`
    case 'object': {
      const ctor = ref('object')
      const fields = node.fields.map(
        (f) => `${objectKey(f.key)}: ${emitSchemaExpr(f.value, imports, prefix)}`,
      )
      return `${ctor}({ ${fields.join(', ')} })`
    }
    case 'array':
      return `${ref('array')}(${emitSchemaExpr(node.element, imports, prefix)})`
    case 'optional':
      return `${ref('optional')}(${emitSchemaExpr(node.inner, imports, prefix)})`
    case 'unsupported':
      throw new Error(`[Pyreon] emitSchemaSource: unsupported node (${node.reason})`)
  }
}

/**
 * Lower an EMITTABLE schema IR to a tree-shakeable `@pyreon/validate/mini`
 * construction expression.
 *
 * @param node   An emittable IR node (no `unsupported`). Throws otherwise.
 * @param aliasPrefix Prefix for the emitted identifiers (default `''`). The
 *               vite-plugin passes a collision-proof prefix (e.g. `_pv_`) and
 *               injects `import { name as _pv_name } from '@pyreon/validate/mini'`,
 *               so the rewrite can never clash with a user binding named
 *               `string` / `object` / `email` / …
 *
 * @example
 * emitSchemaSource({ kind: 'string', checks: [{ kind: 'email' }, { kind: 'min', n: 2 }] })
 * // → { code: 'string().check(email(), minLength(2))', imports: Set{string,email,minLength} }
 */
export function emitSchemaSource(node: ValidateNode, aliasPrefix = ''): SchemaSourceResult {
  if (!isEmittable(node)) throw new Error('[Pyreon] emitSchemaSource: node is not emittable')
  const imports = new Set<string>()
  const code = emitSchemaExpr(node, imports, aliasPrefix)
  return { code, imports }
}
