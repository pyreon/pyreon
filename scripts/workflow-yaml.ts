/**
 * workflow-yaml — a structural reader for GitHub Actions workflow files, and a
 * three-valued evaluator for their `${{ … }}` expressions.
 *
 * The workflow gates run in `validate-fast` and in vitest under node, where no
 * YAML library is installed (the repo has no YAML dependency on purpose), so
 * this reads the YAML subset workflow files use: block mappings and sequences,
 * flow lists and maps (`[a, b]`, `{}`), plain / single / double-quoted
 * scalars (plain ones may continue on deeper-indented lines), block scalars
 * (`|`, `>`, with chomping indicators) and comments. Every scalar stays a
 * string. Anchors, aliases and tags are rejected with an error, so a gate
 * built on this fails closed instead of misreading a shape it does not know.
 * `workflow-yaml.test.ts` compares it with Bun's YAML parser on every
 * workflow in the repository.
 */

export type YamlValue = string | null | YamlValue[] | { [key: string]: YamlValue }
export type YamlMap = { [key: string]: YamlValue }

interface Line {
  indent: number
  /** The line without its indentation (comments not yet removed). */
  text: string
}

const isBlank = (l: Line) => l.text === '' || l.text.startsWith('#')

/** Drop a trailing comment: a `#` after whitespace, outside quotes. */
export function stripComment(s: string): string {
  let quote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quote) {
      if (ch === quote) {
        if (quote === "'" && s[i + 1] === "'") i++
        else quote = null
      } else if (ch === '\\' && quote === '"') i++
      continue
    }
    if ((ch === "'" || ch === '"') && (i === 0 || /[\s[{,:-]/.test(s[i - 1]!))) quote = ch
    else if (ch === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return s.slice(0, i).trimEnd()
  }
  return s.trimEnd()
}

/** Index just past the closing quote of a quoted scalar that starts at 0. */
function quotedEnd(s: string): number {
  const q = s[0]
  let i = 1
  while (i < s.length) {
    if (s[i] === q) {
      if (q === "'" && s[i + 1] === "'") {
        i += 2
        continue
      }
      return i + 1
    }
    if (s[i] === '\\' && q === '"') i++
    i++
  }
  return i
}

/** Index of the `:` that separates a mapping key from its value, or -1. */
function keySeparator(s: string): number {
  if (s[0] === '"' || s[0] === "'") {
    const i = quotedEnd(s)
    return s[i] === ':' && (i + 1 === s.length || s[i + 1] === ' ') ? i : -1
  }
  if (s[0] === '[' || s[0] === '{') return -1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ':' && (i + 1 === s.length || s[i + 1] === ' ' || s[i + 1] === '\t')) return i
    if (s[i] === ' ' && s[i + 1] === '#') return -1
  }
  return -1
}

function unquote(s: string): string {
  const t = s.trim()
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") return t.slice(1, -1).replaceAll("''", "'")
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\(.)/g, (_, c: string) => ({ n: '\n', t: '\t', '"': '"', '\\': '\\' })[c] ?? c)
  }
  return t
}

/** Split a flow collection's inside at top-level commas. */
function splitFlow(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i))
      start = i + 1
    }
  }
  parts.push(inner.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

function parseFlow(s: string): YamlValue {
  const t = s.trim()
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new Error(`unterminated flow list: ${t}`)
    return splitFlow(t.slice(1, -1)).map(parseFlow)
  }
  if (t.startsWith('{')) {
    if (!t.endsWith('}')) throw new Error(`unterminated flow map: ${t}`)
    const out: YamlMap = {}
    for (const part of splitFlow(t.slice(1, -1))) {
      const sep = keySeparator(part)
      if (sep < 0) out[unquote(part)] = null
      else out[unquote(part.slice(0, sep))] = parseFlow(part.slice(sep + 1))
    }
    return out
  }
  return scalar(t)
}

function scalar(t: string): string | null {
  if (t === '' || t === '~' || t === 'null') return t === '' ? null : t
  if (/^[&*!]/.test(t)) throw new Error(`anchors, aliases and tags are not read by workflow-yaml: ${t}`)
  return unquote(t)
}

/** Balance of `[`/`{` minus `]`/`}` outside quotes. */
function bracketDepth(s: string): number {
  let depth = 0
  let quote: string | null = null
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
  }
  return depth
}

class Reader {
  private i = 0
  constructor(private readonly lines: Line[]) {}

  private peek(): Line | undefined {
    while (this.i < this.lines.length && isBlank(this.lines[this.i]!)) this.i++
    return this.lines[this.i]
  }

  parseDocument(): YamlValue {
    const first = this.peek()
    if (!first) return null
    const value = this.parseBlock(first.indent)
    const rest = this.peek()
    if (rest) throw new Error(`unexpected indentation at: ${rest.text}`)
    return value
  }

  private parseBlock(indent: number): YamlValue {
    const line = this.peek()!
    return line.text === '-' || line.text.startsWith('- ') ? this.parseSeq(indent) : this.parseMap(indent)
  }

  private parseMap(indent: number): YamlMap {
    const out: YamlMap = {}
    for (;;) {
      const line = this.peek()
      if (!line || line.indent < indent) break
      if (line.indent > indent) throw new Error(`unexpected indentation at: ${line.text}`)
      if (line.text === '-' || line.text.startsWith('- ')) break
      const text = stripComment(line.text)
      const sep = keySeparator(text)
      if (sep < 0) throw new Error(`expected "key: value" at: ${line.text}`)
      const key = unquote(text.slice(0, sep))
      this.i++
      out[key] = this.parseValue(text.slice(sep + 1).trim(), indent, true)
    }
    return out
  }

  private parseSeq(indent: number): YamlValue[] {
    const out: YamlValue[] = []
    for (;;) {
      const line = this.peek()
      if (!line || line.indent !== indent || !(line.text === '-' || line.text.startsWith('- '))) break
      const content = line.text === '-' ? '' : line.text.slice(2).replace(/^ +/, '')
      const offset = line.text.length - content.length
      const body = stripComment(content)
      if (body !== '' && keySeparator(body) >= 0) {
        // `- key: value` opens a mapping whose keys sit at the content's column.
        this.lines[this.i] = { indent: indent + offset, text: content }
        out.push(this.parseMap(indent + offset))
        continue
      }
      this.i++
      out.push(this.parseValue(body, indent, false))
    }
    return out
  }

  /** The value after `key:` (or `- `) at `indent`. */
  private parseValue(rest: string, indent: number, inMap: boolean): YamlValue {
    if (rest === '') {
      const next = this.peek()
      if (next && next.indent > indent) return this.parseBlock(next.indent)
      if (inMap && next && next.indent === indent && (next.text === '-' || next.text.startsWith('- '))) {
        return this.parseSeq(indent)
      }
      return null
    }
    if (/^[|>][+-]?$/.test(rest)) return this.blockScalar(rest, indent)
    if (rest.startsWith('[') || rest.startsWith('{')) {
      let flow = rest
      while (bracketDepth(flow) > 0 && this.i < this.lines.length) {
        flow += ' ' + stripComment(this.lines[this.i]!.text)
        this.i++
      }
      return parseFlow(flow)
    }
    // A plain or quoted scalar may continue on deeper-indented lines.
    let text = rest
    while (this.i < this.lines.length) {
      const next = this.lines[this.i]!
      if (next.text === '' || next.indent <= indent || next.text.startsWith('#')) break
      text += ' ' + stripComment(next.text)
      this.i++
    }
    return scalar(text)
  }

  private blockScalar(header: string, indent: number): string {
    const raw: Line[] = []
    while (this.i < this.lines.length) {
      const next = this.lines[this.i]!
      if (next.text !== '' && next.indent <= indent) break
      raw.push(next)
      this.i++
    }
    while (raw.length > 0 && raw[raw.length - 1]!.text === '') raw.pop()
    const base = raw.find((l) => l.text !== '')?.indent ?? indent + 1
    const lines = raw.map((l) => (l.text === '' ? '' : ' '.repeat(Math.max(0, l.indent - base)) + l.text))
    const body = header.startsWith('>') ? lines.join(' ').replace(/ {2,}/g, ' ') : lines.join('\n')
    return header.endsWith('-') ? body : `${body}\n`
  }
}

/** Parse a workflow file. Throws on a shape outside the subset described above. */
export function parseWorkflowYaml(text: string): YamlValue {
  const lines = text.split(/\r?\n/).map((raw) => {
    const trimmed = raw.replace(/^ +/, '')
    if (trimmed.startsWith('\t')) throw new Error('tab indentation is not valid YAML')
    return { indent: raw.length - trimmed.length, text: trimmed.trimEnd() }
  })
  return new Reader(lines).parseDocument()
}

export const isMap = (v: YamlValue | undefined): v is YamlMap =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The workflow's triggers as event name → config (`on: push` and `on: [a, b]` normalised). */
export function triggersOf(doc: YamlValue): YamlMap {
  if (!isMap(doc)) return {}
  const on = doc.on ?? doc.true
  if (typeof on === 'string') return { [on]: null }
  if (Array.isArray(on)) return Object.fromEntries(on.filter((e): e is string => typeof e === 'string').map((e) => [e, null]))
  return isMap(on) ? on : {}
}

/** A list-or-single-string field (`types: [a, b]`, `types: a`), or null when absent. */
export function stringList(v: YamlValue | undefined): string[] | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return null
}

// ─── expressions ──────────────────────────────────────────────────────────

/** A value the evaluator cannot know statically (a step output, `success()`, an unbound context). */
export const UNKNOWN = Symbol('unknown')
export type ExprValue = string | number | boolean | null | typeof UNKNOWN

type Token = { kind: 'str' | 'num' | 'id' | 'op'; value: string }

/** A single-quoted string starting at `i`: its value and the index after it. */
function readString(src: string, i: number): [string, number] {
  let s = ''
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] !== "'") {
      s += src[j]
      continue
    }
    if (src[j + 1] !== "'") return [s, j + 1]
    s += "'"
    j++
  }
  throw new Error(`unterminated string in expression: ${src}`)
}

/** A context path starting at `i`: identifiers joined by `.`, `.*`, `[n]` or `['key']`. */
function readPath(src: string, i: number): number {
  let j = i
  for (;;) {
    while (j < src.length && /[\w-]/.test(src[j]!)) j++
    if (src[j] === '.' && (src[j + 1] === '*' || /[A-Za-z_]/.test(src[j + 1] ?? ''))) {
      j += src[j + 1] === '*' ? 2 : 1
    } else if (src[j] === '[') {
      const close = src.indexOf(']', j)
      if (close < 0) throw new Error(`unterminated index in expression: ${src}`)
      j = close + 1
    } else {
      return j
    }
  }
}

const OPERATORS = ['==', '!=', '&&', '||', '<=', '>=', '!', '(', ')', '<', '>', ',']

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === "'") {
      const [value, next] = readString(src, i)
      out.push({ kind: 'str', value })
      i = next
      continue
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i))
    if (op) {
      out.push({ kind: 'op', value: op })
      i += op.length
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++
      out.push({ kind: 'num', value: src.slice(i, j) })
      i = j
      continue
    }
    if (!/[A-Za-z_]/.test(ch)) throw new Error(`unexpected character "${ch}" in expression: ${src}`)
    const end = readPath(src, i)
    out.push({ kind: 'id', value: src.slice(i, end) })
    i = end
  }
  return out
}

const truthy = (v: Exclude<ExprValue, typeof UNKNOWN>) => !(v === false || v === 0 || v === '' || v === null || Number.isNaN(v))

function toNumber(v: Exclude<ExprValue, typeof UNKNOWN>): number {
  if (v === null) return 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return v
  return v.trim() === '' ? 0 : Number(v)
}

function relate<T extends string | number>(op: string, x: T, y: T): boolean {
  switch (op) {
    case '==':
      return x === y
    case '!=':
      return x !== y
    case '<':
      return x < y
    case '>':
      return x > y
    case '<=':
      return x <= y
    default:
      return x >= y
  }
}

function compare(op: string, a: ExprValue, b: ExprValue): ExprValue {
  if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN
  if (typeof a === 'string' && typeof b === 'string') return relate(op, a.toLowerCase(), b.toLowerCase())
  if (typeof a === typeof b && (op === '==' || op === '!=')) return op === '==' ? a === b : a !== b
  const x = toNumber(a)
  const y = toNumber(b)
  if (Number.isNaN(x) || Number.isNaN(y)) return op === '!='
  return relate(op, x, y)
}

const STRING_FNS: Record<string, (a: string, b: string) => boolean> = {
  contains: (a, b) => a.toLowerCase().includes(b.toLowerCase()),
  startswith: (a, b) => a.toLowerCase().startsWith(b.toLowerCase()),
  endswith: (a, b) => a.toLowerCase().endsWith(b.toLowerCase()),
}

class ExprParser {
  private i = 0
  constructor(
    private readonly tokens: Token[],
    private readonly context: Record<string, ExprValue>,
  ) {}

  parse(): ExprValue {
    const v = this.or()
    if (this.i < this.tokens.length) throw new Error(`unexpected token "${this.tokens[this.i]!.value}"`)
    return v
  }

  private eat(op: string): boolean {
    const t = this.tokens[this.i]
    if (t?.kind === 'op' && t.value === op) {
      this.i++
      return true
    }
    return false
  }

  private or(): ExprValue {
    let left = this.and()
    while (this.eat('||')) {
      const right = this.and()
      if (left === UNKNOWN) left = right !== UNKNOWN && truthy(right) ? right : UNKNOWN
      else if (!truthy(left)) left = right
    }
    return left
  }

  private and(): ExprValue {
    let left = this.equality()
    while (this.eat('&&')) {
      const right = this.equality()
      if (left === UNKNOWN) left = right !== UNKNOWN && !truthy(right) ? right : UNKNOWN
      else if (truthy(left)) left = right
    }
    return left
  }

  private equality(): ExprValue {
    let left = this.relational()
    for (;;) {
      const op = this.eat('==') ? '==' : this.eat('!=') ? '!=' : null
      if (!op) return left
      left = compare(op, left, this.relational())
    }
  }

  private relational(): ExprValue {
    let left = this.unary()
    for (;;) {
      const op = this.eat('<=') ? '<=' : this.eat('>=') ? '>=' : this.eat('<') ? '<' : this.eat('>') ? '>' : null
      if (!op) return left
      left = compare(op, left, this.unary())
    }
  }

  private unary(): ExprValue {
    if (this.eat('!')) {
      const v = this.unary()
      return v === UNKNOWN ? UNKNOWN : !truthy(v)
    }
    return this.primary()
  }

  private primary(): ExprValue {
    const t = this.tokens[this.i++]
    if (!t) throw new Error('unexpected end of expression')
    if (t.kind === 'op' && t.value === '(') {
      const v = this.or()
      if (!this.eat(')')) throw new Error('missing ")"')
      return v
    }
    if (t.kind === 'str') return t.value
    if (t.kind === 'num') return Number(t.value)
    if (t.kind === 'id') {
      if (this.eat('(')) {
        const args: ExprValue[] = []
        if (!this.eat(')')) {
          do args.push(this.or())
          while (this.eat(','))
          if (!this.eat(')')) throw new Error('missing ")" after arguments')
        }
        const fn = STRING_FNS[t.value.toLowerCase()]
        const [a, b] = args
        if (fn && args.length === 2 && typeof a === 'string' && typeof b === 'string') return fn(a, b)
        return UNKNOWN
      }
      if (t.value === 'true') return true
      if (t.value === 'false') return false
      if (t.value === 'null') return null
      return t.value in this.context ? this.context[t.value]! : UNKNOWN
    }
    throw new Error(`unexpected token "${t.value}"`)
  }
}

/**
 * Evaluate a workflow condition or `${{ … }}` value with the given context
 * paths bound (`{ 'github.event_name': 'pull_request' }`). Anything unbound,
 * and every status function, is UNKNOWN; `&&` and `||` short-circuit through
 * UNKNOWN the way three-valued logic does, so `x && github.event_name ==
 * 'pull_request'` is known false for a merge group whatever `x` is.
 * A value with no `${{ }}` is a literal string, unless `bare` (an `if:`).
 */
export function evaluate(source: string, context: Record<string, ExprValue>, bare = false): ExprValue {
  const t = source.trim()
  const wrapped = /^\$\{\{([\s\S]*)\}\}$/.exec(t)
  if (wrapped && !wrapped[1]!.includes('}}')) return new ExprParser(tokenize(wrapped[1]!), context).parse()
  if (t.includes('${{')) return UNKNOWN // interpolation inside a longer string
  if (!bare) return t === 'true' ? true : t === 'false' ? false : t
  return new ExprParser(tokenize(t), context).parse()
}

/** True / false when the value is known, UNKNOWN otherwise. */
export function truthOf(v: ExprValue): boolean | typeof UNKNOWN {
  return v === UNKNOWN ? UNKNOWN : truthy(v)
}
