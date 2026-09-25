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
import type { IrField, IrNumberType, IrStringType, IrType } from './ir'

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
 * Does `value` satisfy `type`, constraints included? Used to decide whether a
 * spec `example` may be used verbatim: OpenAI's spec carries 40 examples that
 * contradict their own schema, and each one produced a fixture the generated
 * client rejects.
 */
export function conforms(
  value: unknown,
  type: IrType,
  resolveRef: (name: string) => IrType | undefined,
  depth = 0,
): boolean {
  if (depth > 8) return true
  switch (type.kind) {
    case 'nullable':
      return value === null || conforms(value, type.inner, resolveRef, depth + 1)
    case 'null':
      return value === null
    case 'enum':
      return type.values.some((v) => v === value)
    case 'string': {
      if (typeof value !== 'string') return false
      if (type.minLength !== undefined && value.length < type.minLength) return false
      if (type.maxLength !== undefined && value.length > type.maxLength) return false
      if (type.pattern) {
        try {
          if (!new RegExp(type.pattern).test(value)) return false
        } catch {
          return false
        }
      }
      return true
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return false
      if (type.integer && !Number.isInteger(value)) return false
      if (type.minimum !== undefined && value < type.minimum) return false
      if (type.maximum !== undefined && value > type.maximum) return false
      if (type.exclusiveMinimum !== undefined && value <= type.exclusiveMinimum) return false
      if (type.exclusiveMaximum !== undefined && value >= type.exclusiveMaximum) return false
      if (type.multipleOf !== undefined && Math.abs(value / type.multipleOf - Math.round(value / type.multipleOf)) > 1e-9) {
        return false
      }
      return true
    case 'boolean':
      return typeof value === 'boolean'
    case 'unknown':
      return true
    case 'array':
      if (!Array.isArray(value)) return false
      if (type.minItems !== undefined && value.length < type.minItems) return false
      if (type.maxItems !== undefined && value.length > type.maxItems) return false
      return value.every((v) => conforms(v, type.items, resolveRef, depth + 1))
    case 'ref': {
      const target = resolveRef(type.name)
      return target ? conforms(value, target, resolveRef, depth + 1) : true
    }
    case 'union':
      return type.options.some((o) => conforms(value, o, resolveRef, depth + 1))
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
      const rec = value as Record<string, unknown>
      for (const f of type.fields) {
        const v = rec[f.name]
        if (v === undefined) {
          if (f.required) return false
          continue
        }
        if (!conforms(v, f.type, resolveRef, depth + 1)) return false
      }
      return true
    }
  }
}

/** A deterministic string honouring pattern and length, in that order. */
export function sampleString(type: IrStringType, field: IrField | undefined, index: number): string {
  if (type.pattern) {
    const fromPattern = sampleFromPattern(type.pattern)
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
  if (type.maxLength !== undefined && base.length > type.maxLength) base = base.slice(0, Math.max(type.maxLength, 0))
  if (type.minLength !== undefined && base.length < type.minLength) base = base.padEnd(type.minLength, 'x')
  return base
}

/** A sample number inside the spec's bounds, distinct per index. */
export function sampleNumber(type: IrNumberType, index: number): number {
  const step = type.multipleOf ?? (type.integer ? 1 : 0.5)
  const lo = type.minimum ?? (type.exclusiveMinimum !== undefined ? type.exclusiveMinimum + step : undefined)
  const hi = type.maximum ?? (type.exclusiveMaximum !== undefined ? type.exclusiveMaximum - step : undefined)
  const base = lo !== undefined ? Math.ceil(lo / step) * step : type.integer ? 1 : 1.5
  const value = base + Math.max(0, index - 1) * step
  const picked =
    hi !== undefined && value > hi ? (lo !== undefined ? Math.ceil(lo / step) * step : Math.floor(hi / step) * step) : value
  return type.integer ? Math.round(picked) : roundToStep(picked, step)
}

/** `3 * 0.1` is `0.30000000000000004`; a fixture should read `0.3`. */
function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number(value.toFixed(Math.min(decimals + 2, 20)))
}
