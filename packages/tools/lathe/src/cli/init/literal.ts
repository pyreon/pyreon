/**
 * A READ-ONLY reader for the object literal inside another tool's config file.
 *
 * `lathe init` migrates an orval / hey-api / kubb setup, and those live in
 * `*.config.ts` modules that import the tool itself (`defineConfig` from
 * `orval`, plugin factories from `@kubb/*`). Importing one would EXECUTE code
 * from a package that may not even be installed any more, so the config is
 * read as TEXT instead: strings, numbers, booleans, `null`, arrays, objects,
 * and calls (`pluginZod({ … })`, `defineConfig({ … })`), which every one of
 * these configs is made of. Anything else — a variable, `process.env.X`, a
 * spread — becomes an `expr` node carrying its source text, so the mapper can
 * name it as something it could not read rather than guess at it.
 */

export type Lit =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'array'; items: Lit[] }
  | { kind: 'object'; entries: Array<[string, Lit]> }
  | { kind: 'call'; callee: string; args: Lit[] }
  | { kind: 'expr'; text: string }

/**
 * The value a config module exports: `export default <expr>` (unwrapping
 * `defineConfig(…)` and `satisfies` / `as` casts), else `module.exports = …`.
 * `undefined` when the file has neither.
 */
export function readExportedConfig(source: string): Lit | undefined {
  const code = stripComments(source)
  const m = /export\s+default\s+/.exec(code) ?? /module\.exports\s*=\s*/.exec(code)
  if (!m) return undefined
  const reader = new Reader(code, m.index + m[0].length)
  let value = reader.value()
  // A config written as `const config = {…}; export default config` exports a
  // NAME; follow it one level to its declaration.
  if (value.kind === 'expr' && /^[A-Za-z_$][\w$]*$/.test(value.text)) {
    const decl = new RegExp(`(?:const|let|var)\\s+${value.text}\\b[^=]*=\\s*`).exec(code)
    if (decl) value = new Reader(code, decl.index + decl[0].length).value()
  }
  return unwrap(value)
}

/**
 * `defineConfig(x)` → `x`, recursively. A config FUNCTION (`() => ({…})`,
 * `() => { return {…} }` — kubb documents both) yields the object it returns,
 * read as text like everything else; the function is never called.
 */
function unwrap(value: Lit): Lit {
  if (value.kind === 'call' && /(^|\.)define\w*Config$/.test(value.callee) && value.args[0]) return unwrap(value.args[0])
  if (value.kind === 'expr') {
    const fn = /^(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/.exec(value.text)
    if (fn) {
      const body = value.text.slice(fn[0].length)
      if (body.startsWith('(')) return unwrap(new Reader(body, 1).value())
      const ret = /\breturn\s+/.exec(body)
      if (body.startsWith('{') && ret) return unwrap(new Reader(body, ret.index + ret[0].length).value())
    }
  }
  return value
}

/** Blank out comments while keeping every other character (and offset) intact. */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i] as string
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(src, i)
      out += src.slice(i, end)
      i = end
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' '
        i++
      }
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      out += src.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else {
      out += c
      i++
    }
  }
  return out
}

function skipString(src: string, start: number): number {
  const quote = src[start]
  let i = start + 1
  while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
  return i + 1
}

class Reader {
  constructor(
    private readonly src: string,
    private i: number,
  ) {}

  value(): Lit {
    this.ws()
    const start = this.i
    const c = this.src[this.i]
    let v: Lit
    if (c === '{') v = this.object()
    else if (c === '[') v = this.array()
    else if (c === '"' || c === "'") v = { kind: 'string', value: this.string() }
    else if (c === '`') v = this.template(start)
    else if (c !== undefined && /[-\d.]/.test(c) && /^-?\.?\d/.test(this.src.slice(this.i, this.i + 3))) v = this.number()
    else v = this.identifierish(start)
    // `x as const`, `x satisfies T` — the value is `x`.
    this.ws()
    const tail = /^(as|satisfies)\s+/.exec(this.src.slice(this.i))
    if (tail) {
      this.i += tail[0].length
      this.skipExpression()
    }
    return v
  }

  private ws(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i] as string)) this.i++
  }

  private object(): Lit {
    this.i++ // {
    const entries: Array<[string, Lit]> = []
    for (;;) {
      this.ws()
      const c = this.src[this.i]
      if (c === undefined || c === '}') {
        this.i++
        return { kind: 'object', entries }
      }
      if (this.src.startsWith('...', this.i)) {
        this.i += 3
        const start = this.i
        this.skipExpression()
        entries.push(['...', { kind: 'expr', text: this.src.slice(start, this.i).trim() }])
      } else {
        const key = c === '"' || c === "'" ? this.string() : this.word()
        this.ws()
        if (this.src[this.i] === ':') {
          this.i++
          entries.push([key, this.value()])
        } else if (this.src[this.i] === '(') {
          // A method (`transformer(x) { … }`) — behaviour, not configuration.
          const start = this.i
          this.skipExpression()
          entries.push([key, { kind: 'expr', text: `${key}${this.src.slice(start, this.i)}` }])
        } else {
          // Shorthand `{ input }` names a variable this reader cannot follow.
          entries.push([key, { kind: 'expr', text: key }])
        }
      }
      this.ws()
      if (this.src[this.i] === ',') this.i++
    }
  }

  private array(): Lit {
    this.i++ // [
    const items: Lit[] = []
    for (;;) {
      this.ws()
      if (this.src[this.i] === undefined || this.src[this.i] === ']') {
        this.i++
        return { kind: 'array', items }
      }
      items.push(this.value())
      this.ws()
      if (this.src[this.i] === ',') this.i++
    }
  }

  private string(): string {
    const quote = this.src[this.i]
    let out = ''
    this.i++
    while (this.i < this.src.length && this.src[this.i] !== quote) {
      if (this.src[this.i] === '\\') {
        const n = this.src[this.i + 1] as string
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n
        this.i += 2
      } else {
        out += this.src[this.i]
        this.i++
      }
    }
    this.i++
    return out
  }

  /** A template literal with no `${…}` is a string; with one it is an expression. */
  private template(start: number): Lit {
    const end = skipString(this.src, this.i)
    const raw = this.src.slice(this.i + 1, end - 1)
    this.i = end
    return raw.includes('${') ? { kind: 'expr', text: this.src.slice(start, end) } : { kind: 'string', value: raw }
  }

  private number(): Lit {
    const m = /^-?(?:\d[\d_]*)?(?:\.\d+)?(?:e[-+]?\d+)?/i.exec(this.src.slice(this.i)) as RegExpExecArray
    this.i += m[0].length
    return { kind: 'number', value: Number(m[0].replace(/_/g, '')) }
  }

  private word(): string {
    const m = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.i))
    if (!m && this.src[this.i] === '[') {
      // A computed key `[expr]` — kept as text, its value still read.
      const start = this.i
      this.i++
      this.skipExpression()
      this.i++ // ]
      return this.src.slice(start, this.i)
    }
    if (!m) {
      // Not a key this reader understands (a computed `[key]`): skip it whole.
      const start = this.i
      this.skipExpression()
      return this.src.slice(start, this.i)
    }
    this.i += m[0].length
    return m[0]
  }

  /** An identifier, a dotted name, a call, or something else read as text. */
  private identifierish(start: number): Lit {
    const m = /^(?:new\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(this.src.slice(this.i))
    if (m) {
      const name = m[0]
      this.i += name.length
      this.ws()
      if (name === 'true' || name === 'false') return { kind: 'boolean', value: name === 'true' }
      if (name === 'null') return { kind: 'null' }
      if (name === 'undefined') return { kind: 'expr', text: 'undefined' }
      // `async (x) => …` is a function, not a call to something named `async`.
      if (this.src[this.i] === '(' && !name.startsWith('new ') && name !== 'async') {
        this.i++
        const args: Lit[] = []
        for (;;) {
          this.ws()
          if (this.src[this.i] === undefined || this.src[this.i] === ')') {
            this.i++
            break
          }
          args.push(this.value())
          this.ws()
          if (this.src[this.i] === ',') this.i++
        }
        // A call whose RESULT is used further (`fn().x`), or an arrow's
        // parameter list, is not a plain call.
        if (/^(?:[.[]|=>)/.test(this.src.slice(this.i).trimStart())) {
          this.skipExpression()
          return { kind: 'expr', text: this.src.slice(start, this.i).trim() }
        }
        return { kind: 'call', callee: name, args }
      }
      // A bare name ending the value (`{ input }`, `[a, b]`) — anything that
      // continues it (`a + b`, `env.X ?? 'y'`) is read as text below.
      if (this.i >= this.src.length || /[,}\])]/.test(this.src[this.i] as string)) {
        return { kind: 'expr', text: name }
      }
    }
    this.i = start
    this.skipExpression()
    return { kind: 'expr', text: this.src.slice(start, this.i).trim() }
  }

  /** Advance past one expression: up to the next `,` / `}` / `]` / `)` at depth 0. */
  private skipExpression(): void {
    let depth = 0
    while (this.i < this.src.length) {
      const c = this.src[this.i] as string
      if (c === '"' || c === "'" || c === '`') {
        this.i = skipString(this.src, this.i)
        continue
      }
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) return
        depth--
      } else if ((c === ',' || c === ';') && depth === 0) return
      this.i++
    }
  }
}

/** `obj.key` for an object literal, else `undefined`. */
export function prop(value: Lit | undefined, key: string): Lit | undefined {
  if (value?.kind !== 'object') return undefined
  return value.entries.find(([k]) => k === key)?.[1]
}

/** The string a literal holds, else `undefined`. */
export function str(value: Lit | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

/** A readable one-line rendering, for the "could not map" report. */
export function show(value: Lit): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value)
    case 'number':
    case 'boolean':
      return String(value.value)
    case 'null':
      return 'null'
    case 'array':
      return `[${value.items.map(show).join(', ')}]`
    case 'object':
      return `{ ${value.entries.map(([k, v]) => `${k}: ${show(v)}`).join(', ')} }`
    case 'call':
      return `${value.callee}(${value.args.map(show).join(', ')})`
    case 'expr':
      return value.text
  }
}
