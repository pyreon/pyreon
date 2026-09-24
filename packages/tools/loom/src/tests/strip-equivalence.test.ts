/**
 * `stripWithMask` moves RUNS instead of characters (see its doc comment for
 * why). This file is the proof that the rewrite changed only the bookkeeping.
 *
 * The reference implementation below is the ORIGINAL character-at-a-time
 * scanner, kept verbatim. Every source file in this repo is stripped by both
 * and compared byte for byte AND mask bit for mask bit. That corpus is far
 * harsher than any fixture could be — JSX, regex-heavy detectors, template
 * literals holding whole `import … from '…'` lines as prose, generated
 * api-reference examples, `.d.ts` files — and a hand-rolled scanner is exactly
 * where a rewrite hides a divergence that no unit fixture happens to hit.
 *
 * Keeping the reference here is deliberate. It is ~40 lines, it costs nothing
 * at runtime (test-only), and it turns "the rewrite was equivalent when I made
 * it" into "the rewrite is equivalent now" — which is the property that
 * matters the next time someone optimizes this loop.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripWithMask } from '../core/imports'

/**
 * The character-at-a-time reference. Written independently of the fast
 * scanner's helpers — the regex rule and the nested-template walk are
 * restated here, so a bug in one implementation shows up as a divergence
 * rather than being shared by both.
 */
function stripReference(text: string): { stripped: string; codeAt: boolean[] } {
  let out = ''
  const codeAt: boolean[] = []
  let i = 0
  const n = text.length
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  let prev = -1
  const push = (chunk: string, inCode: boolean): void => {
    out += chunk
    for (let k = 0; k < chunk.length; k += 1) codeAt.push(inCode)
  }
  const keywords = ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']
  const regexAllowed = (): boolean => {
    if (prev < 0) return true
    const c = text[prev]!
    if ('(,=:[!&|?{;~^+-*%'.includes(c)) return true
    if (!/[A-Za-z_$]/.test(c)) return false
    let k = prev
    while (k > 0 && /[\w$]/.test(text[k - 1]!)) k -= 1
    return text[k - 1] !== '.' && keywords.includes(text.slice(k, prev + 1))
  }
  const regexEnd = (start: number): number => {
    let inClass = false
    for (let j = start + 1; j < n; j += 1) {
      const c = text[j]!
      if (c === '\n') return -1
      if (c === '\\') { j += 1; continue }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) {
        let e = j + 1
        while (e < n && /[a-z]/.test(text[e]!)) e += 1
        return e
      }
    }
    return -1
  }
  // A template is a stack of contexts: 'tpl' (literal text) and 'expr'
  // (an interpolation, counting its own braces).
  const templateEnd = (start: number): number => {
    const stack: Array<{ kind: 'tpl' } | { kind: 'expr'; depth: number; prev: number }> = [{ kind: 'tpl' }]
    let j = start
    while (j < n) {
      const top = stack[stack.length - 1]!
      const c = text[j]!
      if (top.kind === 'tpl') {
        if (c === '\\') { j += 2; continue }
        if (c === '`') {
          stack.pop()
          j += 1
          if (stack.length === 0) return j
          const outer = stack[stack.length - 1]!
          if (outer.kind === 'expr') outer.prev = j - 1
          continue
        }
        if (c === '$' && text[j + 1] === '{') { stack.push({ kind: 'expr', depth: 1, prev: j + 1 }); j += 2; continue }
        j += 1
        continue
      }
      if (c === '{') top.depth += 1
      else if (c === '}') { top.depth -= 1; if (top.depth === 0) stack.pop() }
      else if (c === '`') { stack.push({ kind: 'tpl' }); j += 1; continue }
      else if (c === "'" || c === '"') {
        j += 1
        while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
        top.prev = j
        j += 1
        continue
      } else if (c === '/' && text[j + 1] !== '/' && text[j + 1] !== '*') {
        const saved = prev
        prev = top.prev
        const e = regexAllowed() ? regexEnd(j) : -1
        prev = saved
        if (e !== -1) { top.prev = e - 1; j = e; continue }
      } else if (c === '/' && text[j + 1] === '/') {
        while (j < n && text[j] !== '\n') j += 1
        continue
      } else if (c === '/' && text[j + 1] === '*') {
        const e = text.indexOf('*/', j + 2)
        j = e === -1 ? n : e + 2
        continue
      }
      if (!' \t\n\r'.includes(c)) top.prev = j
      j += 1
    }
    return n
  }
  while (i < n) {
    const c = text[i]!
    const next = text[i + 1]
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; i += 2; continue }
      if (c === '/' && next === '*') { mode = 'block'; i += 2; continue }
      if (c === '/') {
        const e = regexAllowed() ? regexEnd(i) : -1
        const to = e === -1 ? i + 1 : e
        push(text.slice(i, to), true)
        prev = to - 1
        i = to
        continue
      }
      if (c === '`') { i = templateEnd(i + 1); prev = i - 1; continue }
      if (c === "'") { mode = 'single'; push(c, true); i += 1; continue }
      if (c === '"') { mode = 'double'; push(c, true); i += 1; continue }
      if (!' \t\n\r'.includes(c)) prev = i
      push(c, true); i += 1; continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; push(c, true) } i += 1; continue }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = 'code'; i += 2 } else i += 1; continue }
    const quote = mode === 'single' ? "'" : '"'
    if (c === '\\') { push(text.slice(i, i + 2), false); i += 2; continue }
    push(c, false)
    if (c === quote || c === '\n') { mode = 'code'; prev = i }
    i += 1
  }
  return { stripped: out, codeAt }
}

function agree(text: string): { ok: true } | { ok: false; why: string } {
  const a = stripReference(text)
  const b = stripWithMask(text)
  if (a.stripped !== b.stripped) {
    let k = 0
    while (k < a.stripped.length && a.stripped[k] === b.stripped[k]) k += 1
    return {
      ok: false,
      why: `stripped diverges at ${k}: ref ${JSON.stringify(a.stripped.slice(k - 30, k + 30))} vs new ${JSON.stringify(b.stripped.slice(k - 30, k + 30))}`,
    }
  }
  if (a.codeAt.length !== b.codeAt.length) {
    return { ok: false, why: `mask length ${a.codeAt.length} vs ${b.codeAt.length}` }
  }
  for (let k = 0; k < a.codeAt.length; k += 1) {
    if (a.codeAt[k] !== (b.codeAt[k] === 1)) {
      return { ok: false, why: `mask bit ${k}: ref ${a.codeAt[k]} vs new ${b.codeAt[k]} near ${JSON.stringify(a.stripped.slice(Math.max(0, k - 30), k + 30))}` }
    }
  }
  return { ok: true }
}

/** The shapes worth naming, beyond whatever the corpus happens to contain. */
const CASES: Record<string, string> = {
  empty: '',
  'plain code': `import { a } from 'pkg'\nexport const x = a`,
  'import line inside a template literal (the motivating case)':
    'const doc = `\n  import { x } from "@scope/fake"\n`\nimport { real } from "@scope/real"',
  'import line inside a plain string':
    `const fix = "import { x } from '@scope/fake'"\nimport { real } from '@scope/real'`,
  'line comment holding an import': `// import { x } from 'nope'\nimport { y } from 'yes'`,
  'block comment holding an import': `/* import { x } from 'nope' */\nimport { y } from 'yes'`,
  'unterminated block comment': `import { a } from 'x'\n/* never closed`,
  'unterminated template': 'import { a } from "x"\nconst t = `never closed',
  'unterminated string': `import { a } from 'x\n`,
  'escaped quote inside a string': `const s = 'it\\'s fine'\nimport { a } from 'x'`,
  'escape at end of file': `const s = 'abc\\`,
  'backslash then EOF in a template': 'const t = `abc\\',
  'division is not a comment': `const r = a / b / c\nimport { x } from 'y'`,
  'regex containing a quote': `const re = /['"]/g\nimport { x } from 'y'`,
  'nested template braces': 'const t = `${`${inner}`}`\nimport { x } from "y"',
  'CRLF line endings': `import { a } from 'x'\r\n// comment\r\nimport { b } from 'y'`,
  'no trailing newline': `import { a } from 'x'`,
  'only a comment': `// nothing here`,
  'template immediately at EOF': 'const t = `',
  'double-quote string ended by newline': `const s = "unterminated\nimport { a } from 'x'`,
}

describe('stripWithMask matches the reference implementation', () => {
  for (const [name, text] of Object.entries(CASES)) {
    it(`agrees on: ${name}`, () => {
      const r = agree(text)
      expect(r.ok ? 'agree' : r.why).toBe('agree')
    })
  }

  // This spec's cost is REPO-SIZE-BOUND, and it runs under `Coverage (Full)`'s
  // 4-way package parallelism, so it must not sit on the shared 20 s default.
  // Measured 2026-09-06 on the same tree: 3.6 s alone, 26.4 s under that load —
  // a ~7x inflation that crossed 20 s and reddened main on two consecutive
  // runs (#3306, #3309; a third, #3307, was still queued when this landed), reported as `STACK_TRACE_ERROR` with no text
  // because a vitest TIMEOUT rendered through the JSON reporter drops its
  // message. The gate's own diagnostic then blamed an OOM'd worker; peak RSS
  // was ~630 MB. CI `retry: 2` cannot save it — every retry runs under the same
  // sustained load. Derived, not guessed: ~4.5x the observed worst case, and a
  // genuine hang still fails inside two minutes. Not gated behind
  // PYREON_SKIP_SLOW_TESTS on purpose — this is the corpus-level correctness
  // lock for the lexical stripper, not a nice-to-have.
  const WHOLE_REPO_SCAN_TIMEOUT_MS = 120_000

  it('agrees on every source file in this repo', () => {
    // The load-bearing spec. Fixtures cover what the author thought of; the
    // repo covers what people actually write.
    const root = resolve(__dirname, '../../../../..')
    const files: string[] = []
    const SRC = /\.(?:[cm]?[jt]sx?)$/
    const walk = (dir: string, depth: number): void => {
      if (depth > 10) return
      let entries
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p, depth + 1)
        else if (SRC.test(e.name)) files.push(p)
      }
    }
    walk(join(root, 'packages'), 0)
    walk(join(root, 'scripts'), 0)

    // An empty corpus must never read as a pass — that is the whole failure
    // mode this repo gates against elsewhere, and it applies here too.
    expect(files.length).toBeGreaterThan(500)

    const failures: string[] = []
    for (const f of files) {
      let text: string
      try { text = readFileSync(f, 'utf8') } catch { continue }
      const r = agree(text)
      if (!r.ok) failures.push(`${f.slice(root.length + 1)}: ${r.why}`)
      if (failures.length >= 3) break
    }
    expect(failures).toEqual([])
  }, WHOLE_REPO_SCAN_TIMEOUT_MS)
})
