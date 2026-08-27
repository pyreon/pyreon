/**
 * A YAML reader scoped to OpenAPI documents.
 *
 * Written rather than depended on, deliberately. A general YAML parser is a
 * large surface with a genuinely hostile spec (anchors, tags, merge keys, five
 * scalar styles, implicit typing rules that famously turn `NO` into `false`),
 * and Lathe needs one narrow slice of it: the subset an OpenAPI document
 * actually uses. Depending on a full implementation would import all of that
 * risk to read block maps and sequences.
 *
 * SUPPORTED: block maps, block sequences, inline `{}` / `[]` flow collections,
 * plain / single- / double-quoted scalars, `|` and `>` block scalars, comments,
 * multi-document `---` (first document wins), explicit `null`/`~`, and the
 * JSON-compatible scalar types.
 *
 * NOT SUPPORTED, and REFUSED LOUDLY rather than mis-parsed: anchors (`&`/`*`),
 * merge keys (`<<`), and explicit tags (`!!`). A parser that silently ignores
 * an anchor produces a document that is subtly wrong everywhere the anchor was
 * used, which is far worse than not opening the file — so each throws with the
 * line number and the offending token.
 *
 * Tabs are rejected for the same reason YAML itself rejects them: a tab in
 * indentation makes the document's structure depend on the reader's tab width.
 */

export class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`[Pyreon] lathe: YAML parse error on line ${line}: ${message}`)
    this.name = 'YamlError'
  }
}

type Line = { indent: number; text: string; n: number }

/** Parse a YAML document. Returns the first document in a multi-doc stream. */
export function parseYaml(source: string): unknown {
  const lines = scan(source)
  if (lines.length === 0) return null
  const [value] = parseBlock(lines, 0, lines[0]!.indent)
  return value
}

/** Strip comments and blank lines; measure indentation; reject tabs. */
function scan(source: string): Line[] {
  const out: Line[] = []
  const raw = source.split(/\r?\n/)
  let started = false
  for (let i = 0; i < raw.length; i++) {
    const text = raw[i] as string
    const n = i + 1
    // A document separator ends the first document once we have content.
    if (/^---\s*$/.test(text)) {
      if (started && out.length > 0) break
      continue
    }
    if (/^\.\.\.\s*$/.test(text)) break
    const indentMatch = /^[ \t]*/.exec(text)![0]
    if (indentMatch.includes('\t')) {
      throw new YamlError('tab in indentation (YAML forbids it; use spaces)', n)
    }
    const body = text.slice(indentMatch.length)
    if (body === '' || body.startsWith('#')) continue
    started = true
    out.push({ indent: indentMatch.length, text: body, n })
  }
  return out
}

/**
 * Parse the block starting at `i` whose members sit at `indent`.
 * Returns the value and the index of the first line NOT consumed.
 */
function parseBlock(lines: Line[], i: number, indent: number): [unknown, number] {
  const first = lines[i]
  if (!first) return [null, i]
  if (first.text.startsWith('- ') || first.text === '-') {
    return parseSeq(lines, i, indent)
  }
  return parseMap(lines, i, indent)
}

function parseSeq(lines: Line[], start: number, indent: number): [unknown[], number] {
  const items: unknown[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]!
    if (line.indent < indent) break
    if (line.indent > indent) throw new YamlError('unexpected indent in sequence', line.n)
    if (!(line.text === '-' || line.text.startsWith('- '))) break
    const rest = line.text === '-' ? '' : line.text.slice(2).trim()
    if (rest === '') {
      // Value lives on the following, more-indented lines.
      const next = lines[i + 1]
      if (next && next.indent > indent) {
        const [v, ni] = parseBlock(lines, i + 1, next.indent)
        items.push(v)
        i = ni
      } else {
        items.push(null)
        i += 1
      }
      continue
    }
    // A FLOW collection (`- { name: x, in: path }`) is a complete value, not
    // the head of a block map. It must be tested BEFORE the inline-map branch:
    // `{ name: x, ... }` contains a `key:` and would otherwise be read as one,
    // producing a single bogus entry keyed `"{ name"` — which is exactly how a
    // parameter list silently becomes empty.
    if (rest.startsWith('{') || rest.startsWith('[')) {
      items.push(scalar(rest, line.n))
      i += 1
      continue
    }
    // `- key: value` opens an inline map whose members align after the dash.
    if (isMapEntry(rest)) {
      const synthetic: Line[] = [{ indent: indent + 2, text: rest, n: line.n }]
      let j = i + 1
      while (j < lines.length && lines[j]!.indent > indent) {
        synthetic.push(lines[j]!)
        j++
      }
      const [v] = parseMap(synthetic, 0, indent + 2)
      items.push(v)
      i = j
      continue
    }
    items.push(scalar(rest, line.n))
    i += 1
  }
  return [items, i]
}

function parseMap(lines: Line[], start: number, indent: number): [Record<string, unknown>, number] {
  const map: Record<string, unknown> = {}
  let i = start
  while (i < lines.length) {
    const line = lines[i]!
    if (line.indent < indent) break
    if (line.indent > indent) throw new YamlError('unexpected indent in mapping', line.n)
    if (line.text.startsWith('- ')) break
    const split = splitMapEntry(line.text)
    if (!split) throw new YamlError(`expected 'key: value', got ${JSON.stringify(line.text)}`, line.n)
    const [key, rest] = split
    if (rest === '') {
      const next = lines[i + 1]
      if (next && next.indent > line.indent) {
        const [v, ni] = parseBlock(lines, i + 1, next.indent)
        map[key] = v
        i = ni
        continue
      }
      // A sequence may sit at the SAME indent as its key — legal YAML.
      if (next && next.indent === line.indent && next.text.startsWith('-')) {
        const [v, ni] = parseSeq(lines, i + 1, line.indent)
        map[key] = v
        i = ni
        continue
      }
      map[key] = null
      i += 1
      continue
    }
    if (rest === '|' || rest === '>' || /^[|>][-+]?$/.test(rest)) {
      const [text, ni] = parseBlockScalar(lines, i + 1, line.indent, rest.startsWith('>'))
      map[key] = text
      i = ni
      continue
    }
    map[key] = scalar(rest, line.n)
    i += 1
  }
  return [map, i]
}

function parseBlockScalar(
  lines: Line[],
  start: number,
  parentIndent: number,
  folded: boolean,
): [string, number] {
  const parts: string[] = []
  let i = start
  let base = -1
  while (i < lines.length && lines[i]!.indent > parentIndent) {
    const line = lines[i]!
    if (base < 0) base = line.indent
    parts.push(' '.repeat(Math.max(0, line.indent - base)) + line.text)
    i += 1
  }
  return [folded ? parts.join(' ') : parts.join('\n'), i]
}

function isMapEntry(text: string): boolean {
  return splitMapEntry(text) !== null
}

/**
 * Split `key: value`, honouring quotes so a colon inside a quoted key or a URL
 * value (`url: https://x.com`) does not split in the wrong place.
 */
function splitMapEntry(text: string): [string, string] | null {
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '#' && i > 0 && text[i - 1] === ' ') break
    if (c === ':' && (i + 1 === text.length || text[i + 1] === ' ')) {
      const rawKey = text.slice(0, i).trim()
      const key =
        (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
        (rawKey.startsWith("'") && rawKey.endsWith("'"))
          ? rawKey.slice(1, -1)
          : rawKey
      return [key, stripComment(text.slice(i + 1).trim())]
    }
  }
  return null
}

/** Drop a trailing ` # comment` outside quotes. */
function stripComment(text: string): string {
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '#' && (i === 0 || text[i - 1] === ' ')) return text.slice(0, i).trim()
  }
  return text
}

/** Convert a scalar token to a JS value, including flow collections. */
function scalar(token: string, line: number): unknown {
  const t = token.trim()
  if (t === '') return null
  if (t.startsWith('&') || t.startsWith('*')) {
    throw new YamlError(
      `anchors and aliases are not supported (${JSON.stringify(t)}); inline the value`,
      line,
    )
  }
  if (t.startsWith('!')) {
    throw new YamlError(`explicit tags are not supported (${JSON.stringify(t)})`, line)
  }
  if (t.startsWith('{') || t.startsWith('[')) return parseFlow(t, line)
  if (t.startsWith('"') || t.startsWith("'")) return unquote(t, line)
  if (t === 'null' || t === '~' || t === 'Null' || t === 'NULL') return null
  if (t === 'true' || t === 'True' || t === 'TRUE') return true
  if (t === 'false' || t === 'False' || t === 'FALSE') return false
  if (/^-?(0|[1-9][0-9]*)$/.test(t)) return Number(t)
  if (/^-?(0|[1-9][0-9]*)\.[0-9]+([eE][-+]?[0-9]+)?$/.test(t)) return Number(t)
  return t
}

function unquote(t: string, line: number): string {
  const q = t[0] as string
  if (!t.endsWith(q) || t.length < 2) throw new YamlError('unterminated quoted scalar', line)
  const body = t.slice(1, -1)
  if (q === "'") return body.split("''").join("'")
  return body.replace(/\\(["\\/nrt])/g, (_m, c: string) =>
    c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
  )
}

/**
 * Flow collections (`{a: 1, b: [2, 3]}`).
 *
 * A hand-rolled recursive reader rather than a `JSON.parse` after quoting
 * repair: OpenAPI flow scalars are frequently unquoted (`type: [string, null]`),
 * so any repair pass would have to make the same decisions this does anyway.
 */
function parseFlow(src: string, line: number): unknown {
  let pos = 0
  const value = readValue()
  skipWs()
  if (pos !== src.length) throw new YamlError('trailing characters in flow collection', line)
  return value

  function skipWs(): void {
    while (pos < src.length && /\s/.test(src[pos] as string)) pos++
  }
  function readValue(): unknown {
    skipWs()
    const c = src[pos]
    if (c === '{') return readMap()
    if (c === '[') return readSeq()
    return scalar(readToken(), line)
  }
  function readMap(): Record<string, unknown> {
    pos++ // {
    const out: Record<string, unknown> = {}
    skipWs()
    if (src[pos] === '}') { pos++; return out }
    for (;;) {
      skipWs()
      const rawKey = readToken(':')
      const key = rawKey.startsWith('"') || rawKey.startsWith("'") ? unquote(rawKey, line) : rawKey
      skipWs()
      if (src[pos] !== ':') throw new YamlError('expected ":" in flow mapping', line)
      pos++
      out[key] = readValue()
      skipWs()
      if (src[pos] === ',') { pos++; continue }
      if (src[pos] === '}') { pos++; return out }
      throw new YamlError('expected "," or "}" in flow mapping', line)
    }
  }
  function readSeq(): unknown[] {
    pos++ // [
    const out: unknown[] = []
    skipWs()
    if (src[pos] === ']') { pos++; return out }
    for (;;) {
      out.push(readValue())
      skipWs()
      if (src[pos] === ',') { pos++; continue }
      if (src[pos] === ']') { pos++; return out }
      throw new YamlError('expected "," or "]" in flow sequence', line)
    }
  }
  /** Read a scalar token, honouring quotes, stopping at flow punctuation. */
  function readToken(extraStop = ''): string {
    skipWs()
    const start = pos
    const q = src[pos]
    if (q === '"' || q === "'") {
      pos++
      while (pos < src.length && src[pos] !== q) {
        if (src[pos] === '\\' && q === '"') pos++
        pos++
      }
      pos++
      return src.slice(start, pos)
    }
    while (pos < src.length && !',}]'.includes(src[pos] as string) && !extraStop.includes(src[pos] as string)) {
      pos++
    }
    return src.slice(start, pos).trim()
  }
}

/** Read a spec from text, choosing JSON or YAML by content. */
export function parseSpecText(source: string): unknown {
  const trimmed = source.trimStart()
  if (trimmed.startsWith('{')) return JSON.parse(source)
  return parseYaml(source)
}
