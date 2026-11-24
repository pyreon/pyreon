#!/usr/bin/env bun
/**
 * check-css-balanced — every tracked stylesheet closes every block it opens.
 *
 * ## The failure this catches
 *
 * A merge into `@pyreon/calendar` dropped the two closing braces of
 * `@media print { .pcal-event { box-shadow: none; } }`. CSS closes an open
 * block at end of file, so the file still parsed on its own, and every test
 * passed. Two things broke for users:
 *
 *  - Everything after the cut (the timeline's now line and its drag
 *    selection) became print-only: it sat inside `@media print`.
 *  - A bundler concatenates stylesheets. With any CSS imported after the
 *    calendar's (for example `@pyreon/command/style.css`), that CSS was
 *    nested inside the calendar's open rule, and `vite build` failed in
 *    lightningcss with `Unknown at rule: @keyframes`.
 *
 * The file was published that way (0.53.0, hand-published), so the check is
 * structural and cheap: walk the stylesheet with comments and strings
 * skipped, and require the brace depth to never go negative and to end at
 * zero. A stylesheet that passes is safe to concatenate.
 *
 * Scope: every git-tracked `.css` file in the repo (packages, templates the
 * scaffolders copy into apps, docs, examples).
 *
 *   bun scripts/check-css-balanced.ts
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')

export interface CssProblem {
  line: number
  message: string
}

/**
 * Structural problems in one stylesheet: an unterminated comment or string, a
 * `}` with no open block, or blocks still open at end of file (reported at the
 * line of the outermost one still open, which is where the cut usually is).
 */
export function cssBalanceProblems(source: string): CssProblem[] {
  const lineAt = (index: number): number => source.slice(0, index).split('\n').length
  const problems: CssProblem[] = []
  const open: number[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i] as string
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) {
        return [...problems, { line: lineAt(i), message: 'comment is never closed (missing `*/`)' }]
      }
      i = end + 2
    } else if (ch === '"' || ch === "'") {
      const end = stringEnd(source, i)
      if (end === -1) {
        return [...problems, { line: lineAt(i), message: `string is never closed (missing ${ch})` }]
      }
      i = end + 1
    } else {
      if (ch === '{') open.push(i)
      else if (ch === '}' && open.pop() === undefined) {
        problems.push({ line: lineAt(i), message: '`}` closes a block that was never opened' })
      }
      // A backslash escapes the next character (`.w-\{1\}`), so skip both.
      i += ch === '\\' ? 2 : 1
    }
  }
  if (open.length > 0) {
    problems.push({
      line: lineAt(open[0] as number),
      message:
        `${open.length} block(s) still open at end of file; the outermost opens here. ` +
        'CSS closes them silently, so the rules after the missing `}` land inside this block, ' +
        'and any stylesheet a bundler concatenates after this one does too.',
    })
  }
  return problems
}

/**
 * Index of the quote that closes the string opening at `start`, or -1 when it
 * is unterminated. A CSS string cannot span a raw newline; `\` escapes one.
 */
function stringEnd(source: string, start: number): number {
  const quote = source[start]
  for (let j = start + 1; j < source.length; j++) {
    const c = source[j]
    if (c === '\\') j++
    else if (c === quote) return j
    else if (c === '\n') return -1
  }
  return -1
}

function trackedCssFiles(): string[] {
  const r = spawnSync('git', ['ls-files', '-z', '--', '*.css'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`[check-css-balanced] git ls-files failed: ${r.stderr}`)
  return r.stdout.split('\0').filter(Boolean)
}

if (import.meta.main) {
  const files = trackedCssFiles()
  let failed = 0
  for (const file of files) {
    for (const p of cssBalanceProblems(readFileSync(join(REPO_ROOT, file), 'utf8'))) {
      failed++
      console.error(`${file}:${p.line}: ${p.message}`)
    }
  }
  if (failed > 0) {
    console.error(
      `\n[check-css-balanced] ${failed} problem(s). Close the block at the reported line ` +
        '(usually a `}` lost in a merge), then re-run.',
    )
    process.exit(1)
  }
  console.log(`[check-css-balanced] ✓ ${files.length} stylesheet(s) balanced`)
}
