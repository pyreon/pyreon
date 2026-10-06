/**
 * AST-positioned source rewrites for the vite plugin's text-level passes.
 *
 * Both passes here used to be raw text rewrites (`code.replaceAll(...)` /
 * `code.replace(/regex/g, ...)`), which cannot tell a real expression from the
 * same characters inside a quoted string, a comment, a regex literal or
 * template text. `process.env.NODE_ENV` inside the string `"process.env.NODE_ENV"`
 * (zero's own define key) became `"(      "production")"` — invalid JavaScript.
 * The rule: find the node with the parser, replace by its [start, end) range.
 */
import { parseSync } from 'oxc-parser'

type Lang = 'js' | 'jsx' | 'ts' | 'tsx'

function langOf(id: string): Lang {
  const path = id.split('?')[0]!
  if (/\.[cm]?tsx$/.test(path)) return 'tsx'
  if (/\.[cm]?ts$/.test(path)) return 'ts'
  if (/\.[cm]?jsx$/.test(path)) return 'jsx'
  return 'js'
}

interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function parse(code: string, id: string, lang: Lang): Node | null {
  try {
    const r = parseSync(id, code, { sourceType: 'module', lang, preserveParens: false })
    return r.errors.length > 0 ? null : (r.program as unknown as Node)
  } /* v8 ignore next 3 -- oxc's parseSync reports problems via `errors` and does not throw; this is a defensive net so a parser crash can never fail a build. */ catch {
    return null
  }
}

/** Pre-order walk. `visit` returns false to skip the node's children. */
function walk(root: unknown, visit: (n: Node, parent: Node | null) => boolean | void): void {
  const go = (n: unknown, parent: Node | null): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) go(c, parent)
      return
    }
    const node = n as Node
    if (typeof node.type !== 'string') return
    if (visit(node, parent) === false) return
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      const v = node[key]
      if (v && typeof v === 'object') go(v, node)
    }
  }
  go(root, null)
}

function splice(code: string, edits: { start: number; end: number; text: string }[]): string {
  edits.sort((a, b) => a.start - b.start)
  let out = ''
  let at = 0
  for (const e of edits) {
    out += code.slice(at, e.start) + e.text
    at = e.end
  }
  return out + code.slice(at)
}

/** `a.b` / `a['b']` property name, or null for a dynamic key. */
function memberKey(n: Node): string | null {
  const prop = n.property as Node | undefined
  if (!prop) return null
  if (!n.computed) return prop.type === 'Identifier' ? (prop.name as string) : null
  return prop.type === 'Literal' && typeof prop.value === 'string' ? prop.value : null
}

function isMember(n: unknown): n is Node {
  return !!n && (n as Node).type === 'MemberExpression'
}

/** `process` | `globalThis.process` | `global.process` | `self.process` | `window.process`. */
function isProcess(n: unknown): boolean {
  if (!n || typeof n !== 'object') return false
  const node = n as Node
  if (node.type === 'Identifier') return node.name === 'process'
  if (!isMember(node) || memberKey(node) !== 'process') return false
  const o = node.object as Node
  return o.type === 'Identifier' && ['globalThis', 'global', 'self', 'window'].includes(o.name as string)
}

/** A real `process.env.NODE_ENV` read (any member/optional/bracket spelling). */
function isNodeEnvRead(n: Node): boolean {
  if (!isMember(n) || memberKey(n) !== 'NODE_ENV') return false
  const env = n.object as Node
  return isMember(env) && memberKey(env) === 'env' && isProcess(env.object)
}

/**
 * Replacement for a folded read. Same length as the original when it is on one
 * line (so columns and lines are untouched and no source map is needed); a read
 * spanning lines keeps its line terminators so the line count is preserved.
 */
function foldedText(original: string): string {
  const breaks = original.replace(/[^\r\n]/g, '')
  if (breaks.length === 0) return `(${' '.repeat(original.length - 14)}"production")`
  return `("production")${breaks}`
}

const TS_WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion'])

/**
 * Fold every real `process.env.NODE_ENV` read in `code` to `"production"`.
 * Assignment / update / delete targets are not reads and are left alone.
 * Returns null when nothing was folded or the module does not parse (the
 * caller then keeps the runtime read — always safe, never invalid output).
 */
export function foldNodeEnvProduction(code: string, id: string): string | null {
  if (!code.includes('NODE_ENV')) return null
  const program = parse(code, id, langOf(id))
  if (!program) return null

  const edits: { start: number; end: number; text: string }[] = []
  const targets = new Set<Node>()

  // Mark the member expressions that are WRITE targets (never folded).
  const markTarget = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    switch (node.type) {
      case 'MemberExpression':
        targets.add(node)
        break
      case 'ArrayPattern':
        for (const el of node.elements as unknown[]) markTarget(el)
        break
      case 'ObjectPattern':
        for (const p of node.properties as Node[]) markTarget(p.type === 'RestElement' ? p.argument : p.value)
        break
      case 'RestElement':
        markTarget(node.argument)
        break
      case 'AssignmentPattern':
        markTarget(node.left)
        break
      default:
        if (TS_WRAPPERS.has(node.type)) markTarget(node.expression)
    }
  }

  walk(program, (n) => {
    switch (n.type) {
      case 'AssignmentExpression':
        markTarget(n.left)
        break
      case 'UpdateExpression':
        markTarget(n.argument)
        break
      case 'UnaryExpression':
        if (n.operator === 'delete') markTarget(n.argument)
        break
      case 'ForInStatement':
      case 'ForOfStatement':
        markTarget(n.left)
        break
    }
    if (isNodeEnvRead(n) && !targets.has(n)) {
      edits.push({ start: n.start, end: n.end, text: foldedText(code.slice(n.start, n.end)) })
      return false
    }
    return true
  })

  return edits.length === 0 ? null : splice(code, edits)
}

/**
 * React-style JSX attribute renames for the react/preact compat modes
 * (`className` → `class`, `htmlFor` → `for`). Only JSX attribute NAMES are
 * renamed — a `const className = …` binding, a string, a comment or an object
 * key spelling the same word is not an attribute and stays untouched.
 */
export function renameCompatJsxAttributes(code: string, id: string): string {
  if (!code.includes('className') && !code.includes('htmlFor')) return code
  const lang = langOf(id)
  const program = parse(code, id, lang === 'ts' || lang === 'js' ? 'jsx' : lang)
  if (!program) return code
  const edits: { start: number; end: number; text: string }[] = []
  walk(program, (n) => {
    if (n.type === 'JSXAttribute') {
      const name = n.name as Node
      if (name.type === 'JSXIdentifier') {
        if (name.name === 'className') edits.push({ start: name.start, end: name.end, text: 'class' })
        else if (name.name === 'htmlFor') edits.push({ start: name.start, end: name.end, text: 'for' })
      }
    }
    return true
  })
  return edits.length === 0 ? code : splice(code, edits)
}
