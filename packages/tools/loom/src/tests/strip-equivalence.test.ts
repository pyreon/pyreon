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

/** The original implementation, character at a time. Reference only. */
function stripReference(text: string): { stripped: string; codeAt: boolean[] } {
  let out = ''
  const codeAt: boolean[] = []
  let i = 0
  const n = text.length
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  const push = (chunk: string, inCode: boolean): void => {
    out += chunk
    for (let k = 0; k < chunk.length; k += 1) codeAt.push(inCode)
  }
  while (i < n) {
    const c = text[i]!
    const next = text[i + 1]
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; i += 2; continue }
      if (c === '/' && next === '*') { mode = 'block'; i += 2; continue }
      if (c === '`') { mode = 'template'; i += 1; continue }
      if (c === "'") { mode = 'single'; push(c, true); i += 1; continue }
      if (c === '"') { mode = 'double'; push(c, true); i += 1; continue }
      push(c, true); i += 1; continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; push(c, true) } i += 1; continue }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = 'code'; i += 2 } else i += 1; continue }
    if (mode === 'single') {
      if (c === '\\') { push(text.slice(i, i + 2), false); i += 2; continue }
      push(c, false); i += 1
      if (c === "'" || c === '\n') mode = 'code'
      continue
    }
    if (mode === 'double') {
      if (c === '\\') { push(text.slice(i, i + 2), false); i += 2; continue }
      push(c, false); i += 1
      if (c === '"' || c === '\n') mode = 'code'
      continue
    }
    if (c === '\\') { i += 2; continue }
    if (c === '`') { mode = 'code'; i += 1; continue }
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
  })
})
