/**
 * Source-text scanners used by the transform passes: string/comment masking,
 * balanced-argument extraction, line/column mapping, import-name collection
 * and the oxc-backed reactive-callee locator.
 *
 * Every masker returns a SAME-LENGTH string so match offsets in the masked
 * text line up with the original.
 */

import { Visitor } from 'oxc-parser'
import { parseOxc } from './oxc-parse'

export function _skipStringLiteral(code: string, start: number, quote: string): number {
  let j = start + 1
  while (j < code.length) {
    if (code[j] === '\\') {
      j += 2
      continue
    }
    if (code[j] === quote) break
    j++
  }
  return j
}

export function _extractBalancedArgs(code: string, start: number): string | null {
  let depth = 1
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return code.slice(start, i)
    } else if (ch === '"' || ch === "'" || ch === '`') {
      i = _skipStringLiteral(code, i, ch)
    }
  }
  return null
}

/**
 * Start offsets of every `signal` / `computed` / `effect` CALLEE identifier
 * in `code` — the ground truth `injectSignalNames` confirms its regex hits
 * against. Returns `null` when the module does not parse, so the caller keeps
 * its regex-only behaviour instead of dropping every injection.
 *
 * @internal — exported for tests.
 */
export function _reactiveCalleeStarts(code: string, moduleId: string): Set<number> | null {
  let program: ReturnType<typeof parseOxc>['program']
  try {
    const lang = /\.tsx?(?:$|\?)/.test(moduleId)
      ? moduleId.includes('.tsx')
        ? 'tsx'
        : 'ts'
      : 'jsx'
    const r = parseOxc(moduleId, code, { sourceType: 'module', lang })
    if (r.errors.length > 0) return null
    program = r.program
  } catch {
    return null
  }
  // oxc's own Visitor walks only the fields its generated visitor keys name
  // (no `Object.keys` per node), and dispatches on the one node type this
  // needs. It also works on the default JSON-decoded AST, so the Bun / older
  // Node path (no raw transfer) gets the same result.
  const out = new Set<number>()
  new Visitor({
    CallExpression(node) {
      const callee = node.callee
      if (
        callee.type === 'Identifier' &&
        (callee.name === 'signal' || callee.name === 'computed' || callee.name === 'effect')
      ) {
        out.add(callee.start)
      }
    },
  }).visit(program)
  return out
}

/** Characters a masker branch can start on: comment slash, quotes, backtick. */
const MASK_TRIGGER_RE = /[/"'`]/g

/** Index of the next masker trigger at or after `from`, or `code.length`. */
function _nextMaskTrigger(code: string, from: number): number {
  MASK_TRIGGER_RE.lastIndex = from
  const m = MASK_TRIGGER_RE.exec(code)
  return m === null ? code.length : m.index
}

/** `code.indexOf(ch, from)`, with "not found" mapped to `code.length`. */
function _indexOrEnd(code: string, ch: string, from: number): number {
  const at = code.indexOf(ch, from)
  return at < 0 ? code.length : at
}

/**
 * Mask string-literal / template-literal / comment regions in `code` by
 * replacing their content with spaces. Returns a SAME-LENGTH string so
 * regex match positions in the masked version line up with the original.
 *
 * Used by `injectSignalNames` to skip false-positive matches against
 * reactive-primitive names that appear inside strings or comments. Without
 * masking, a user's `const docs = \`effect(() => x)\`` template literal
 * would get `, { __sourceLocation: ... }` injected INSIDE the string,
 * corrupting runtime values.
 *
 * Handles:
 *   - `"..."` / `'...'` strings (escape-aware)
 *   - `` `...` `` template literals; interpolations `${...}` are KEPT as
 *     code (their content can contain real `signal()` calls worth catching)
 *   - `// ...` line comments
 *   - `/* ... *\/` block comments
 *
 * Regex literals (`/foo/g`) are NOT special-cased — they're rare and the
 * downstream extractBalancedArgs handles unmatched parens by returning null.
 *
 * @internal — exported for tests.
 */
export function _maskStringsAndComments(code: string): string {
  // Built from SLICES (see `_maskSource`): the traversal is unchanged, but each
  // masked run is emitted as one newline-preserving blank instead of one array
  // entry per character. Every masked character follows the same rule —
  // newline stays a newline, anything else becomes a space — so the output is
  // identical; `${...}` interpolation bodies are copied through as code.
  const parts: string[] = []
  let last = 0
  const mask = (from: number, to: number): void => {
    if (from > last) parts.push(code.slice(last, from))
    if (to > from) parts.push(code.slice(from, to).replace(/[^\n]/g, ' '))
    last = to
  }
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const c1 = code[i + 1]

    // Line comment `// ...`
    if (c === '/' && c1 === '/') {
      const start = i
      while (i < n && code[i] !== '\n') i++
      mask(start, i)
      continue
    }
    // Block comment `/* ... */` — newlines preserved so line numbers don't shift
    if (c === '/' && c1 === '*') {
      const start = i
      i += 2
      while (i < n) {
        if (code[i] === '*' && code[i + 1] === '/') {
          i += 2
          break
        }
        i++
      }
      mask(start, i)
      continue
    }
    // String literal "..." or '...'
    if (c === '"' || c === "'") {
      const start = i
      const quote = c
      i++
      while (i < n && code[i] !== quote) {
        // Escape sequence — skip the next char too (handles `\"`, `\\`, and a
        // line-continuation `\<LF>`, whose newline the mask preserves).
        if (code[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        // Unterminated string (legacy parsers stop at newline) — break
        if (code[i] === '\n') break
        i++
      }
      if (i < n && code[i] === quote) i++
      mask(start, i)
      continue
    }
    // Template literal `...` — preserve `${...}` interpolations as code
    if (c === '`') {
      let start = i
      i++
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        // `${...}` — mask the template text up to and including `${`, keep the
        // interpolation body as code (nested braces tracked), mask its `}`.
        if (code[i] === '$' && code[i + 1] === '{') {
          i += 2
          mask(start, i)
          let depth = 1
          while (i < n && depth > 0) {
            if (code[i] === '{') {
              depth++
              i++
              continue
            }
            if (code[i] === '}') {
              depth--
              if (depth === 0) {
                mask(i, i + 1)
                i++
                break
              }
              i++
              continue
            }
            // Inside `${}` — pass through as code (might contain `signal(` etc).
            i++
          }
          start = i
          continue
        }
        i++
      }
      if (i < n && code[i] === '`') i++
      mask(start, i)
      continue
    }
    // Every branch above starts on `/`, a quote or a backtick; jump to the
    // next one rather than stepping through plain code (see `_maskSource`).
    i = _nextMaskTrigger(code, i + 1)
  }
  if (last < n) parts.push(code.slice(last))
  return parts.join('')
}

/**
 * Compute the 0-indexed character offset for the start of each line.
 * `lineStarts[i]` is the offset of the FIRST character on line i+1
 * (1-based, so `lineStarts[0]` = offset 0 = line 1).
 *
 * @internal — exported for tests.
 */
export function _computeLineStarts(code: string): number[] {
  const starts: number[] = [0]
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) starts.push(i + 1) // \n
  }
  return starts
}

/**
 * Convert a 0-indexed offset to `{ line: 1-based, col: 1-based }` using a
 * pre-computed line-starts array. Binary search → O(log N) per lookup.
 *
 * @internal — exported for tests.
 */
export function _offsetToLineCol(
  offset: number,
  lineStarts: number[],
): { line: number; col: number } {
  // Binary search for the largest lineStarts[i] <= offset.
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    const v = lineStarts[mid]
    if (v !== undefined && v <= offset) lo = mid
    else hi = mid - 1
  }
  const lineStart = lineStarts[lo] ?? 0
  return { line: lo + 1, col: offset - lineStart + 1 }
}

/**
 * Replace JS comments with spaces while preserving line/column
 * positions. Used by the auto-import scanner so `<Stack>` text inside
 * JSDoc doesn't false-positive as a JSX usage. Position preservation
 * lets the caller use the masked code for regex SEARCH and the
 * original code for SPLICE.
 *
 * String literals are deliberately LEFT VISIBLE — they often carry
 * the package name we need to match (`from '@pyreon/primitives'`).
 * The trade-off: a literal `'<Stack/>'` inside a string would
 * false-positive, but that's vanishingly rare compared to JSDoc
 * examples + the cost of either making string-aware AST parsing OR
 * masking only the LITERAL TEXT (not the quotes) is not worth it
 * for the marginal correctness gain.
 *
 * Handles:
 *   - line comments  `// ... newline`
 *   - block comments `/* ... *​/`
 */
function _maskSource(code: string, maskStrings: boolean): string {
  // Built from SLICES: unmasked runs are copied whole and each masked run is
  // blanked with one replace. The former shape wrote one single-character
  // string per source character into an array and joined it — a full-source
  // allocation storm on every masked file. Same output: a masked run keeps
  // its newlines and turns every other UTF-16 unit into a space, so positions
  // still align.
  const parts: string[] = []
  let last = 0
  let i = 0
  const n = code.length

  /** Blank out [from, to) while preserving newlines so positions still align. */
  const blank = (from: number, to: number): void => {
    if (from > last) parts.push(code.slice(last, from))
    parts.push(code.slice(from, to).replace(/[^\n]/g, ' '))
    last = to
  }

  while (i < n) {
    const c = code[i] ?? ''
    const c2 = code[i + 1] ?? ''

    // Block comment
    if (c === '/' && c2 === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      blank(i, stop)
      i = stop
      continue
    }

    // Line comment
    if (c === '/' && c2 === '/') {
      let j = i
      while (j < n && code[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }

    // Quoted string. A JS string cannot span a raw newline, so an unterminated
    // one stops at the line end rather than swallowing the rest of the file —
    // an apostrophe in a comment the masker already removed cannot reach here,
    // but a stray quote in real code must not blind the scanner to everything
    // after it.
    if (maskStrings && (c === '"' || c === "'")) {
      let j = i + 1
      while (j < n) {
        const ch = code[j]
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === c || ch === '\n') break
        j++
      }
      const stop = Math.min(j + 1, n)
      blank(i, stop)
      i = stop
      continue
    }

    // Template literal. The whole literal is masked, INTERPOLATIONS INCLUDED.
    //
    // Masking `${…}` too means a JSX tag written inside an interpolation stops
    // triggering the auto-import — a false NEGATIVE, where the author adds an
    // explicit import. The alternative bias is a false POSITIVE, which injects
    // an import for a package the file's own package may not depend on and
    // BREAKS THE BUILD. An injecting transform must bias toward not injecting,
    // so the cheap failure is the correct one.
    //
    // Nested templates inside an interpolation are tracked by depth so the
    // closing backtick found is the real one.
    if (maskStrings && c === '`') {
      let j = i + 1
      let depth = 0
      while (j < n) {
        const ch = code[j]
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === '$' && code[j + 1] === '{') {
          depth++
          j += 2
          continue
        }
        if (ch === '}' && depth > 0) {
          depth--
          j++
          continue
        }
        if (ch === '`') {
          if (depth === 0) break
          // A nested template inside an interpolation — skip it wholesale.
          let k = j + 1
          while (k < n) {
            if (code[k] === '\\') {
              k += 2
              continue
            }
            if (code[k] === '`') break
            k++
          }
          j = k + 1
          continue
        }
        j++
      }
      const stop = Math.min(j + 1, n)
      blank(i, stop)
      i = stop
      continue
    }

    // Nothing above starts at this character, and nothing CAN start before the
    // next `/` (or quote / backtick, when strings are masked): jump there
    // instead of stepping one character at a time through plain code.
    i = maskStrings ? _nextMaskTrigger(code, i + 1) : _indexOrEnd(code, '/', i + 1)
  }
  if (last < n) parts.push(code.slice(last))
  return parts.join('')
}

/**
 * Mask comments AND string / template literals.
 *
 * Used for JSX-USAGE scanning: a primitive name inside a diagnostic message or
 * a doc example is not usage, and treating it as such injects an import for a
 * package the file may not depend on — which breaks the build.
 */
export function _maskCommentsAndStrings(code: string): string {
  return _maskSource(code, true)
}

/**
 * Mask ONLY comments, preserving strings.
 *
 * Used where module SPECIFIERS must stay readable — import detection and the
 * extend-existing-import splice. Masking those blinds both, and the pass emits
 * a duplicate import line instead of extending the existing one.
 */
export function _maskComments(code: string): string {
  return _maskSource(code, false)
}

/** Collect every name imported via `import { ... }` / `import X` / `import * as X`. */
export function _collectImportedNames(code: string): Set<string> {
  const out = new Set<string>()
  // Named imports: `import { A, B as C } from '...'`
  const namedRe = /import\s*(?:type\s+)?\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g
  let m: RegExpExecArray | null
  while ((m = namedRe.exec(code)) !== null) {
    for (const spec of m[1]!.split(',')) {
      const trimmed = spec.trim()
      if (!trimmed) continue
      // `A` or `A as B` — the LOCAL name is what matters (the part
      // after `as`, or the original if no rename).
      const asIdx = trimmed.indexOf(' as ')
      out.add(asIdx >= 0 ? trimmed.slice(asIdx + 4).trim() : trimmed)
    }
  }
  // Default + namespace imports: `import D from '...'` / `import * as N from '...'`
  const defaultRe = /import\s+(\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s*['"][^'"]+['"]/g
  while ((m = defaultRe.exec(code)) !== null) {
    out.add(m[1]!)
  }
  const nsRe = /import\s+\*\s+as\s+(\w+)\s+from\s*['"][^'"]+['"]/g
  while ((m = nsRe.exec(code)) !== null) {
    out.add(m[1]!)
  }
  return out
}
