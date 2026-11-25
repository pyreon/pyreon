/**
 * Swift source split into CODE and the rest (comments, string-literal text), for passes that read or rewrite Swift
 * identifiers: the reserved-name scan (`scripts/gen-swift-reserved-names.ts`) and the rename of synthesized types
 * (`swift-reserved-rename.ts`). An interpolation inside a string (`"\(x)"`) is code.
 */

/** An open string literal, and the paren depth of the interpolation open inside it (-1: none, so its text is skipped). */
interface OpenString {
  triple: boolean
  interp: number
}

/** The index after the comment starting at `i`, or `i` when none starts there. Block comments nest in Swift. */
function skipComment(src: string, i: number): number {
  if (src.startsWith('//', i)) {
    const nl = src.indexOf('\n', i)
    return nl < 0 ? src.length : nl
  }
  if (!src.startsWith('/*', i)) return i
  let depth = 0
  let j = i
  do {
    const step = src.startsWith('/*', j) ? 1 : src.startsWith('*/', j) ? -1 : 0
    depth += step
    j += step === 0 ? 1 : 2
  } while (depth > 0 && j < src.length)

  return j
}

/** The end of one step inside a string literal's TEXT; pops the literal when it closes, opens an interpolation. */
function stepInText(src: string, i: number, strings: OpenString[]): { next: number; code: boolean } {
  const top = strings[strings.length - 1]!
  if (src.startsWith('\\(', i)) {
    top.interp = 0
    return { next: i + 2, code: true }
  }
  if (src[i] === '\\') return { next: i + 2, code: false }
  const close = top.triple ? '"""' : '"'
  if (!src.startsWith(close, i)) return { next: i + 1, code: false }
  strings.pop()

  return { next: i + close.length, code: false }
}

/** Track the parens of the interpolation open in the innermost string, so its closing `)` resumes the text. */
function trackInterpolation(c: string, strings: OpenString[]): void {
  const top = strings[strings.length - 1]
  if (top === undefined) return
  if (c === '(') top.interp += 1
  else if (c === ')') top.interp -= 1
}

/** `src` as alternating segments; `code: false` marks a comment, a string delimiter or string text. */
export function swiftSegments(src: string): { text: string; code: boolean }[] {
  const out: { text: string; code: boolean }[] = []
  const push = (text: string, code: boolean): void => {
    const last = out[out.length - 1]
    if (last !== undefined && last.code === code) last.text += text
    else if (text !== '') out.push({ text, code })
  }
  let i = 0
  const strings: OpenString[] = []
  while (i < src.length) {
    if (strings.length > 0 && strings[strings.length - 1]!.interp < 0) {
      const step = stepInText(src, i, strings)
      push(src.slice(i, step.next), step.code)
      i = step.next
      continue
    }
    const after = skipComment(src, i)
    if (after !== i) {
      push(src.slice(i, after), false)
      i = after
    } else if (src[i] === '"') {
      const triple = src.startsWith('"""', i)
      strings.push({ triple, interp: -1 })
      push(triple ? '"""' : '"', false)
      i += triple ? 3 : 1
    } else {
      trackInterpolation(src[i]!, strings)
      push(src[i]!, true)
      i += 1
    }
  }

  return out
}

/** Swift source with comments and string-literal text removed (interpolations stay). */
export function swiftCode(src: string): string {
  return swiftSegments(src)
    .map((s) => (s.code ? s.text : ' '))
    .join('')
}

/** `src` with each bare identifier in `renames` (not a member `.X`, not in a string or comment) replaced. */
export function renameSwiftIdentifiers(src: string, renames: ReadonlyMap<string, string>): string {
  if (renames.size === 0) return src
  const names = [...renames.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(?<![\\w.$\`])(${names.join('|')})(?![\\w$])`, 'g')

  return swiftSegments(src)
    .map((s) => (s.code ? s.text.replace(pattern, (m) => renames.get(m)!) : s.text))
    .join('')
}
