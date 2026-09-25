/**
 * DETERMINISTIC, constraint-satisfying sample values — the mock fixtures'
 * generator (audit C7).
 *
 * The faker plugin already chooses its generators constraints-first; the mock
 * emitter did not, so a `Pet` with `maxLength: 4`, `pattern: ^[A-Z]{3}$` and
 * `minimum: 18` got `"sample name"`, `"sample code"` and `1`, the generated
 * client REJECTED its own mock, and the Atlas `Default` scenario rendered
 * "Request failed.". This applies the same ordering — enum, then pattern, then
 * length / range, then the readable guess — with no randomness, because a
 * fixture that changes between runs turns every snapshot into a flake.
 */
import type { IrField, IrType } from './ir'

/**
 * A string matching `pattern`, or `undefined` when the pattern uses syntax
 * this generator does not model (lookaround, backreferences). The result is
 * VERIFIED against the pattern before it is returned, so a wrong guess costs
 * the fixture its pattern, never a fixture that fails its own schema.
 */
export function sampleFromPattern(pattern: string): string | undefined {
  let out: string | undefined
  try {
    out = new PatternSampler(pattern).run()
  } catch {
    return undefined
  }
  if (out === undefined) return undefined
  try {
    return new RegExp(pattern).test(out) ? out : undefined
  } catch {
    return undefined
  }
}

class Unsupported extends Error {}

/** A tiny recursive-descent walker over the regex subset specs actually use. */
class PatternSampler {
  private i = 0
  constructor(private readonly src: string) {}

  run(): string {
    const out = this.alternation()
    if (this.i < this.src.length) throw new Unsupported()
    return out
  }

  private alternation(): string {
    const first = this.sequence()
    // The FIRST branch is taken; the rest are consumed for syntax only.
    while (this.src[this.i] === '|') {
      this.i++
      this.sequence()
    }
    return first
  }

  private sequence(): string {
    let out = ''
    while (this.i < this.src.length && this.src[this.i] !== '|' && this.src[this.i] !== ')') {
      const atom = this.atom()
      out += this.quantify(atom)
    }
    return out
  }

  private atom(): string {
    const c = this.src[this.i] as string
    this.i++
    switch (c) {
      case '^':
      case '$':
        return ''
      case '.':
        return 'a'
      case '(': {
        if (this.src[this.i] === '?') {
          if (this.src[this.i + 1] !== ':') throw new Unsupported()
          this.i += 2
        }
        const inner = this.alternation()
        if (this.src[this.i] !== ')') throw new Unsupported()
        this.i++
        return inner
      }
      case '[':
        return this.charClass()
      case '\\':
        return this.escape()
      default:
        if ('*+?{'.includes(c)) throw new Unsupported()
        return c
    }
  }

  private escape(): string {
    const c = this.src[this.i] as string | undefined
    this.i++
    switch (c) {
      case 'd':
        return '1'
      case 'w':
        return 'a'
      case 's':
        return ' '
      case 'D':
      case 'W':
      case 'S':
        return c === 'S' ? 'a' : '-'
      case undefined:
        throw new Unsupported()
      default:
        if (/[1-9bBkpPu]/.test(c)) throw new Unsupported()
        return c === 'n' ? '\n' : c === 't' ? '\t' : c
    }
  }

  private charClass(): string {
    const negated = this.src[this.i] === '^'
    if (negated) this.i++
    const members: [number, number][] = []
    let first = true
    while (this.i < this.src.length && (this.src[this.i] !== ']' || first)) {
      first = false
      let lo = this.src[this.i] as string
      this.i++
      if (lo === '\\') {
        const e = this.src[this.i] as string
        this.i++
        if (e === 'd') {
          members.push([48, 57])
          continue
        }
        if (e === 'w') {
          members.push([97, 122])
          continue
        }
        if (e === 's') {
          members.push([32, 32])
          continue
        }
        lo = e
      }
      if (this.src[this.i] === '-' && this.src[this.i + 1] !== ']' && this.i + 1 < this.src.length) {
        this.i++
        let hi = this.src[this.i] as string
        this.i++
        if (hi === '\\') {
          hi = this.src[this.i] as string
          this.i++
        }
        members.push([lo.charCodeAt(0), hi.charCodeAt(0)])
      } else {
        members.push([lo.charCodeAt(0), lo.charCodeAt(0)])
      }
    }
    if (this.src[this.i] !== ']') throw new Unsupported()
    this.i++
    if (!negated) {
      const m = members[0]
      if (!m) throw new Unsupported()
      return String.fromCharCode(m[0])
    }
    for (const candidate of 'aA0_-x') {
      const code = candidate.charCodeAt(0)
      if (!members.some(([lo, hi]) => code >= lo && code <= hi)) return candidate
    }
    throw new Unsupported()
  }

  private quantify(atom: string): string {
    const c = this.src[this.i]
    let min = 1
    if (c === '*' || c === '?') {
      this.i++
      min = 0
    } else if (c === '+') {
      this.i++
      min = 1
    } else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(this.src.slice(this.i))
      if (!m) return atom
      this.i += m[0].length
      min = Number(m[1])
    } else {
      return atom
    }
    // Lazy / possessive suffixes change nothing about a minimum.
    if (this.src[this.i] === '?') this.i++
    return atom.repeat(min)
  }
}

/**
 * Does `value` satisfy `type` (and the field's constraints)? Used to decide
 * whether a spec `example` may be used verbatim: OpenAI's spec carries 40
 * examples that contradict their own schema, and each one produced a fixture
 * the generated client rejects.
 */
export function conforms(
  value: unknown,
  type: IrType,
  resolveRef: (name: string) => IrType | undefined,
  field?: IrField,
  depth = 0,
): boolean {
  if (depth > 8) return true
  if (value === null) return field?.nullable === true || type.kind === 'null'
  switch (type.kind) {
    case 'string': {
      if (typeof value !== 'string') return false
      if (type.enum && !type.enum.includes(value)) return false
      if (field?.min !== undefined && value.length < field.min) return false
      if (field?.max !== undefined && value.length > field.max) return false
      if (field?.pattern) {
        try {
          if (!new RegExp(field.pattern).test(value)) return false
        } catch {
          return false
        }
      }
      return true
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return false
      if (type.integer && !Number.isInteger(value)) return false
      if (field?.min !== undefined && value < field.min) return false
      if (field?.max !== undefined && value > field.max) return false
      return true
    case 'boolean':
      return typeof value === 'boolean'
    case 'null':
      return false
    case 'unknown':
      return true
    case 'array':
      return Array.isArray(value) && value.every((v) => conforms(v, type.items, resolveRef, undefined, depth + 1))
    case 'ref': {
      const target = resolveRef(type.name)
      return target ? conforms(value, target, resolveRef, undefined, depth + 1) : true
    }
    case 'union':
      return type.options.some((o) => conforms(value, o, resolveRef, undefined, depth + 1))
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return false
      const rec = value as Record<string, unknown>
      for (const f of type.fields) {
        const v = rec[f.name]
        if (v === undefined) {
          if (f.required) return false
          continue
        }
        if (!conforms(v, f.type, resolveRef, f, depth + 1)) return false
      }
      return true
    }
  }
}

/** A deterministic string honouring enum, pattern and length, in that order. */
export function sampleString(
  type: Extract<IrType, { kind: 'string' }>,
  field: IrField | undefined,
  index: number,
): string {
  if (type.enum && type.enum.length > 0) return type.enum[0] as string
  if (field?.pattern) {
    const fromPattern = sampleFromPattern(field.pattern)
    if (fromPattern !== undefined) return fromPattern
  }
  let base: string
  switch (type.format) {
    case 'email':
      return 'user@example.com'
    case 'uri':
      return 'https://example.com'
    case 'uuid':
      return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    case 'date':
      return '2026-01-01'
    case 'date-time':
      return '2026-01-01T00:00:00Z'
    default:
      base = field ? `sample ${field.name}${index > 0 ? ` ${index}` : ''}` : 'sample'
  }
  const min = field?.min
  const max = field?.max
  if (max !== undefined && base.length > max) base = base.slice(0, Math.max(max, 0))
  if (min !== undefined && base.length < min) base = base.padEnd(min, 'x')
  return base
}

/** A deterministic number inside the field's range. */
export function sampleNumber(type: Extract<IrType, { kind: 'number' }>, field: IrField | undefined, index: number): number {
  const preferred = type.integer ? Math.max(1, index) : 1.5
  const min = field?.min
  const max = field?.max
  let v = preferred
  if (min !== undefined && v < min) v = type.integer ? Math.ceil(min) : min
  if (max !== undefined && v > max) v = type.integer ? Math.floor(max) : max
  return v
}
