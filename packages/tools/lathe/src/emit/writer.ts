/**
 * File construction: an import manager and a small source builder.
 *
 * The import manager is the part worth having. Emitting correct, deduplicated,
 * correctly-ordered imports across a few hundred generated files is the single
 * most error-prone mechanical job in a generator, and it is exactly the job a
 * component tree with a context (Kubb's approach) exists to do. A map keyed by
 * module specifier does the same work with a stack trace you can read.
 *
 * Import ORDER is deterministic — sorted by specifier, named bindings sorted
 * within each — so an unchanged spec regenerates byte-identically. Anything
 * less makes every regeneration an unreviewable diff.
 */

export interface GeneratedFile {
  /** Path relative to the output root, POSIX separators. */
  path: string
  contents: string
}

export class SourceFile {
  /** module specifier -> named bindings. */
  private readonly named = new Map<string, Set<string>>()
  /** module specifier -> its DEFAULT binding's local name. */
  private readonly defaults = new Map<string, string>()
  /** module specifier -> type-only named bindings. */
  private readonly typeNamed = new Map<string, Set<string>>()
  private readonly body: string[] = []

  constructor(readonly path: string) {}

  /** Record a value import. Repeated calls collapse. */
  import(from: string, ...names: string[]): this {
    add(this.named, from, names)
    return this
  }

  /**
   * Record a DEFAULT import — `import axios from 'axios'`.
   *
   * `import { default as axios }` is valid ESM and behaves identically, which
   * is what this used to emit. It reads as a mistake, though, and generated
   * code is read by people exactly when something already looks wrong; a line
   * that makes the reader wonder about the generator costs more than the ten
   * lines it takes to emit the ordinary form.
   */
  importDefault(from: string, local: string): this {
    const existing = this.defaults.get(from)
    if (existing !== undefined && existing !== local) {
      throw new Error(
        `[Pyreon] lathe: '${from}' already has a default import bound to '${existing}'; cannot also bind '${local}'.`,
      )
    }
    this.defaults.set(from, local)
    return this
  }

  /**
   * Record a TYPE-only import.
   *
   * Kept separate from value imports because `import type` is fully erased —
   * it costs nothing at runtime and, on the native path, never trips PMTC's
   * "no native lowering" warning for the module it came from.
   */
  importType(from: string, ...names: string[]): this {
    add(this.typeNamed, from, names)
    return this
  }

  /** Append a line (or a blank line with no argument). */
  line(text = ''): this {
    this.body.push(text)
    return this
  }

  /** Append several lines. */
  lines(...text: string[]): this {
    for (const t of text) this.body.push(t)
    return this
  }

  /** Append a JSDoc block, if there is anything to say. */
  doc(...parts: (string | undefined)[]): this {
    const kept = parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    if (kept.length === 0) return this
    // Sanitize BEFORE splitting: the sanitizer normalizes CR / U+2028 / U+2029
    // to `\n` so the split sees every line break the value actually contains.
    const flat = kept.map(safeBlockComment).flatMap((p) => p.split('\n'))
    if (flat.length === 1) {
      this.body.push(`/** ${flat[0]} */`)
      return this
    }
    this.body.push('/**')
    for (const l of flat) this.body.push(` * ${l}`.trimEnd())
    this.body.push(' */')
    return this
  }

  build(header: string): GeneratedFile {
    const out: string[] = [header, '']
    for (const spec of [...this.typeNamed.keys()].sort()) {
      const names = [...(this.typeNamed.get(spec) as Set<string>)].sort()
      // A binding imported both as a value and as a type only needs the value
      // import — emitting both is a duplicate-identifier error.
      const valueSide = this.named.get(spec)
      const only = names.filter((n) => !valueSide?.has(n))
      if (only.length > 0) out.push(`import type { ${only.join(', ')} } from '${spec}'`)
    }
    // One statement per specifier, default and named together, so a module
    // imported both ways emits `import axios, { isAxiosError } from 'axios'`
    // rather than two lines that a reader has to reconcile.
    for (const spec of [...new Set([...this.named.keys(), ...this.defaults.keys()])].sort()) {
      const names = [...(this.named.get(spec) ?? [])].sort()
      const def = this.defaults.get(spec)
      const clause = [def, names.length > 0 ? `{ ${names.join(', ')} }` : undefined]
        .filter(Boolean)
        .join(', ')
      if (clause) out.push(`import ${clause} from '${spec}'`)
    }
    if (out.length > 2) out.push('')
    out.push(...this.body)
    return { path: this.path, contents: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n` }
  }
}

function add(map: Map<string, Set<string>>, from: string, names: string[]): void {
  let set = map.get(from)
  if (!set) {
    set = new Set()
    map.set(from, set)
  }
  for (const n of names) set.add(n)
}

/**
 * A relative specifier from one generated file to another.
 *
 * Always prefixed with `./` or `../` and always extensionless — the repo's
 * packages resolve through export maps and bundlers, and an emitted `.ts`
 * extension breaks the published `lib/` build.
 */
export function relativeSpecifier(fromPath: string, toPath: string): string {
  const from = fromPath.split('/').slice(0, -1)
  const to = toPath.replace(/\.tsx?$/, '').split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  const up = from.length - i
  const rest = to.slice(i)
  const prefix = up === 0 ? './' : '../'.repeat(up)
  return `${prefix}${rest.join('/')}`
}

/**
 * Make a spec-supplied string safe inside a `//` line comment.
 *
 * A line comment ends at the first line terminator, so a newline in a value
 * that lands in one does not merely look wrong -- it ENDS the comment and
 * whatever follows becomes executable code in the generated file. A spec title
 * of `T\nglobalThis.pwned=1;//` did exactly that in every file's banner.
 *
 * Collapsed to spaces rather than escaped: a comment has no escape syntax, and
 * a banner is a label, so losing the line structure costs nothing.
 */
export function safeLineComment(value: string): string {
  return value
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
}

/**
 * Make a spec-supplied string safe inside a `/* *\/` block comment.
 *
 * The terminator is the two-character sequence, so breaking it with a
 * backslash is enough -- `*\/` contains no adjacent `*` `/` and still reads as
 * intended. Without this, a `description` containing the terminator closes the
 * JSDoc block and the remainder of the value lands in CODE position.
 */
export function safeBlockComment(value: string): string {
  return value
    .split('*/')
    .join('*\\/')
    .replace(/[\r\u2028\u2029]/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

/** The header every generated file carries. */
export function banner(specTitle: string, specVersion: string): string {
  return [
    '/* eslint-disable */',
    '// @generated by @pyreon/lathe — DO NOT EDIT.',
    `// source: ${safeLineComment(specTitle)} ${safeLineComment(specVersion)}`,
    '//',
    '// Re-run `lathe generate` to update. Edits here are lost on the next run;',
    '// to change the output, change the spec or the emitter.',
  ].join('\n')
}

/**
 * Render a value as a JS literal, safely.
 *
 * `JSON.stringify` alone is NOT safe to paste into source: it leaves U+2028 and
 * U+2029 RAW, and both are line terminators in JavaScript even though they are
 * legal inside a JSON string. The same trap the SSR loader-data serializer
 * documents, in a different context -- there it breaks an inline `<script>`,
 * here it breaks the emitted module.
 */
export function jsonLiteral(value: unknown, indent?: number): string {
  return JSON.stringify(value, null, indent)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Render a TS string literal with single quotes, matching repo style.
 *
 * Escapes every character that can terminate or escape out of the literal.
 * `\r`, U+2028 and U+2029 matter as much as `\n`: all four are line
 * terminators in JavaScript source, so a spec enum value carrying one broke the
 * emitted file. The remaining control characters are escaped rather than
 * dropped, so the generated literal still equals the spec's value.
 */
export function q(value: string): string {
  const escaped = value
    .replace(/[\\']/g, '\\$&')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, (c) =>
      `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    )
  return `'${escaped}'`
}
