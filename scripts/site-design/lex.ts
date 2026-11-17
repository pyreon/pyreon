/**
 * Comment blanking for the site design ratchet: every comment becomes spaces
 * (newlines kept, so line numbers survive) while strings and template literals
 * stay, because CSS-in-JS lives inside template literals. CSS comments inside a
 * template (`css\`… /* … *\/ …\``) are blanked too.
 */

interface LexState {
  src: string
  chars: string[]
  /** 'code' frames carry their brace depth; 'tpl' frames are template text. */
  frames: { kind: 'code' | 'tpl'; depth: number }[]
}

function blank(s: LexState, from: number, to: number): void {
  for (let k = from; k < to && k < s.chars.length; k++) if (s.chars[k] !== '\n') s.chars[k] = ' '
}

function skipString(src: string, i: number, quote: string): number {
  let k = i + 1
  while (k < src.length && src[k] !== quote && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1
  return k + 1
}

const REGEX_PREFIX = /[(,=:[!&|?{};+\-*%<>~^]/

function regexStart(src: string, i: number): boolean {
  let k = i - 1
  while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--
  if (k < 0 || src[k] === '\n') return true
  return REGEX_PREFIX.test(src[k] ?? '') || /\b(?:return|typeof|case)$/.test(src.slice(Math.max(0, k - 6), k + 1))
}

function skipRegex(src: string, i: number): number {
  let k = i + 1
  let inClass = false
  while (k < src.length && src[k] !== '\n') {
    const c = src[k]
    if (c === '\\') k++
    else if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) return k + 1
    k++
  }
  return k
}

function blockEnd(src: string, i: number): number {
  const end = src.indexOf('*/', i + 2)
  return end < 0 ? src.length : end + 2
}

function stepCode(s: LexState, i: number): number {
  const { src } = s
  const c = src[i]
  const frame = s.frames[s.frames.length - 1] as { kind: 'code' | 'tpl'; depth: number }
  if (c === '/' && src[i + 1] === '/') {
    const end = src.indexOf('\n', i)
    const stop = end < 0 ? src.length : end
    blank(s, i, stop)
    return stop
  }
  if (c === '/' && src[i + 1] === '*') {
    const end = blockEnd(src, i)
    blank(s, i, end)
    return end
  }
  if (c === '/' && regexStart(src, i)) return skipRegex(src, i)
  if (c === "'" || c === '"') return skipString(src, i, c)
  if (c === '`') {
    s.frames.push({ kind: 'tpl', depth: 0 })
    return i + 1
  }
  if (c === '{') frame.depth++
  if (c === '}') {
    if (frame.depth === 0 && s.frames.length > 1) s.frames.pop()
    else frame.depth--
  }
  return i + 1
}

function stepTemplate(s: LexState, i: number): number {
  const { src } = s
  const c = src[i]
  if (c === '\\') return i + 2
  if (c === '`') {
    s.frames.pop()
    return i + 1
  }
  if (c === '$' && src[i + 1] === '{') {
    s.frames.push({ kind: 'code', depth: 0 })
    return i + 2
  }
  if (c === '/' && src[i + 1] === '*') {
    const end = blockEnd(src, i)
    blank(s, i, end)
    return end
  }
  return i + 1
}

/** `src` with every comment replaced by spaces. `css` = a stylesheet (block comments only). */
export function blankComments(src: string, css = false): string {
  const s: LexState = { src, chars: src.split(''), frames: [{ kind: 'code', depth: 0 }] }
  if (css) {
    for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) blank(s, m.index, m.index + m[0].length)
    return s.chars.join('')
  }
  let i = 0
  while (i < src.length) {
    const top = s.frames[s.frames.length - 1]
    i = top?.kind === 'tpl' ? stepTemplate(s, i) : stepCode(s, i)
  }
  return s.chars.join('')
}
