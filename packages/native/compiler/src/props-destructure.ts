/**
 * Props destructuring → `props.x` reads, for the native targets.
 *
 * A native component's props ARE its fields: `props.title` lowers to the field `title`. Destructuring them is the most
 * common way to write a component, and two shapes did not lower:
 *
 * - `const { title, count: n } = props` in the body bound `__pyDestr0 = props`, a `props` that does not exist natively;
 * - a destructured parameter with a rename or a default (`function Card({ title, size = 'm' }: P)`) declared NO props at
 *   all, so the component's body read unbound names.
 *
 * Both compiled with zero warnings and failed in `swiftc` / `kotlinc`. This pass rewrites them, before the component is
 * parsed, into the member-read form the parser already lowers: each destructured name becomes `props.key`, and a
 * default becomes `(props.key ?? <default>)` — `??` because native has one nullish value, so an omitted optional prop
 * and an explicit `null` reach the default alike.
 *
 * The rewrite is lexical, so it refuses — with a named warning — what it cannot reproduce faithfully: a rest element, a
 * nested pattern, a computed key, a default that reads another destructured name, or a destructured name re-declared in
 * a nested function or block. Plain-Mode files never reach this pass with a destructure left (the Plain pre-pass rewrites
 * them the same way, for the same reason). The plain `{ a, b }` parameter with no rename and no default is already
 * lowered by the parser and is left untouched.
 */

import { parseSync } from 'oxc-parser'
import { type Edit, applyEdits, collectAllIdentifierNames, collectNestedBindings, lineEnd, walkRefs } from './inline-hooks'

type Node = any

export interface PropsDestructureResult {
  readonly code: string
  readonly warnings: string[]
}

interface Entry {
  readonly key: string
  readonly local: string
  /** Source text of the default, when the entry has one. */
  readonly defaultText: string | undefined
  readonly defaultNode: Node | undefined
}

const COMPONENT_NAME = /^[A-Z]/

/** Rewrite props destructuring in every component of the file; `null` when there is nothing to rewrite. */
export function rewritePropsDestructuring(source: string, filename: string): PropsDestructureResult | null {
  // Cheap gate: no destructuring pattern anywhere means nothing to do.
  if (!/[({,]\s*\{/.test(source) && !/(const|let)\s*\{/.test(source)) return null
  const parsed = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  if (parsed.errors.length > 0) return null
  const edits: Edit[] = []
  const warnings: string[] = []
  for (const { name, fn } of components(parsed.program as Node)) rewriteComponent(name, fn, source, edits, warnings)
  if (edits.length === 0 && warnings.length === 0) return null
  return { code: edits.length > 0 ? applyEdits(source, edits) : source, warnings }
}

/** Top-level PascalCase functions: declarations (exported or not) and `const X = (…) => …` / function expressions. */
function components(program: Node): { name: string; fn: Node }[] {
  const out: { name: string; fn: Node }[] = []
  for (const stmt of program.body as Node[]) {
    const decl =
      (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') && stmt.declaration
        ? stmt.declaration
        : stmt
    if (decl.type === 'FunctionDeclaration' && decl.id && COMPONENT_NAME.test(decl.id.name)) {
      out.push({ name: decl.id.name, fn: decl })
    } else if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations as Node[]) {
        const init = d.init
        if (
          d.id?.type === 'Identifier' &&
          COMPONENT_NAME.test(d.id.name) &&
          (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression')
        ) {
          out.push({ name: d.id.name, fn: init })
        }
      }
    }
  }
  return out
}

function rewriteComponent(name: string, fn: Node, source: string, edits: Edit[], warnings: string[]): void {
  const param = (fn.params as Node[] | undefined)?.[0]
  if (!param) return
  const statements: Node[] = fn.body?.type === 'BlockStatement' ? (fn.body.body as Node[]) : []
  const replacements = new Map<string, string>()
  const localEdits: Edit[] = []
  const allEntries: Entry[] = []
  const removed = new Set<Node>()
  let propsName: string

  if (param.type === 'ObjectPattern') {
    const entries = readPattern(param, source)
    if (typeof entries === 'string') {
      warnings.push(refusal(name, `its props parameter ${entries}`))
      return
    }
    // The plain `{ a, b }` shape is lowered by the parser directly.
    if (entries.every((e) => e.key === e.local && e.defaultText === undefined)) return
    const annotation = param.typeAnnotation
    if (!annotation) {
      warnings.push(refusal(name, 'its destructured props parameter has no type annotation'))
      return
    }
    propsName = freshName(fn, 'props')
    localEdits.push({ start: param.start, end: param.end, text: propsName + source.slice(annotation.start, annotation.end) })
    for (const e of entries) replacements.set(e.local, read(propsName, e))
    allEntries.push(...entries)
  } else if (param.type === 'Identifier') {
    propsName = param.name
    for (const stmt of statements) {
      const d = stmt.type === 'VariableDeclaration' && (stmt.declarations as Node[]).length === 1 ? stmt.declarations[0] : undefined
      if (d?.id?.type !== 'ObjectPattern' || d.init?.type !== 'Identifier' || d.init.name !== propsName) continue
      if (stmt.kind !== 'const') {
        warnings.push(refusal(name, `it destructures \`${propsName}\` with \`${stmt.kind}\`; only \`const\` is rewritten`))
        return
      }
      const entries = readPattern(d.id, source)
      if (typeof entries === 'string') {
        warnings.push(refusal(name, `its \`const { … } = ${propsName}\` ${entries}`))
        return
      }
      for (const e of entries) replacements.set(e.local, read(propsName, e))
      allEntries.push(...entries)
      localEdits.push({ start: stmt.start, end: lineEnd(source, stmt.end), text: '' })
      removed.add(stmt)
    }
    if (replacements.size === 0) return
  } else {
    return
  }

  const locals = new Set(replacements.keys())
  // A default that reads another destructured name would need that name substituted inside copied text.
  for (const e of allEntries) {
    if (!e.defaultNode) continue
    let mentioned: string | undefined
    walkRefs(e.defaultNode, (id, kind) => {
      if (kind !== 'binding' && locals.has(id.name)) mentioned ??= id.name as string
    })
    if (mentioned !== undefined) {
      warnings.push(refusal(name, `the default of \`${e.local}\` reads \`${mentioned}\`, another destructured prop`))
      return
    }
  }
  const shadowed = [...collectNestedBindings(statements)].find((n) => locals.has(n))
  if (shadowed !== undefined) {
    warnings.push(refusal(name, `\`${shadowed}\` is declared again in a nested function or block`))
    return
  }

  const refEdits: Edit[] = []
  // The removed `const { … } = props` statements are not walked: their names are the bindings being replaced.
  const scope = fn.body?.type === 'BlockStatement' ? statements.filter((st) => !removed.has(st)) : fn.body
  walkRefs(scope, (id, kind) => {
    const replacement = replacements.get(id.name)
    if (replacement === undefined || kind === 'binding') return
    refEdits.push(
      kind === 'shorthand'
        ? { start: id.start, end: id.end, text: `${id.name}: ${replacement}` }
        : { start: id.start, end: id.end, text: replacement },
    )
  })
  edits.push(...localEdits, ...refEdits)
}

/** The entries of a props pattern, or the reason it cannot be rewritten. */
function readPattern(pattern: Node, source: string): Entry[] | string {
  const entries: Entry[] = []
  for (const p of pattern.properties as Node[]) {
    if (p.type === 'RestElement') return 'uses a rest element (`...rest`)'
    if (p.computed) return 'uses a computed key'
    // A native prop is a field, so its key must be a plain name.
    const key = p.key?.type === 'Identifier' ? (p.key.name as string) : undefined
    if (key === undefined) return 'uses a key that is not a plain name'
    if (p.value?.type === 'Identifier') {
      entries.push({ key, local: p.value.name, defaultText: undefined, defaultNode: undefined })
    } else if (p.value?.type === 'AssignmentPattern' && p.value.left?.type === 'Identifier') {
      const right = p.value.right
      entries.push({ key, local: p.value.left.name, defaultText: source.slice(right.start, right.end), defaultNode: right })
    } else {
      return `destructures \`${key}\` into a nested pattern`
    }
  }
  return entries.length > 0 ? entries : 'is empty'
}

function read(propsName: string, e: Entry): string {
  const access = `${propsName}.${e.key}`
  return e.defaultText === undefined ? access : `(${access} ?? ${e.defaultText})`
}

function freshName(fn: Node, base: string): string {
  const taken = collectAllIdentifierNames(fn)
  if (!taken.has(base)) return base
  for (let i = 1; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`
}

function refusal(component: string, reason: string): string {
  return (
    `Component ${component}: props destructuring was not lowered to native — ${reason}. ` +
    'Read the props off the parameter instead (`props.title`, `props.size ?? \'m\'`).'
  )
}
