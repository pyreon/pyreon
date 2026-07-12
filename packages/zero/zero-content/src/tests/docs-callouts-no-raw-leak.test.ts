/**
 * Docs-wide regression gate for the callout raw-leak class.
 *
 * `:::warning bare text` is not valid remark-directive syntax — the opener is
 * rejected and the line ships to the published page as literal `:::warning …`
 * text, with (pre-fix) zero diagnostics. 73 instances had leaked across the
 * docs before the `[label]`-title fix + the migration to the bracketed form.
 *
 * This scans the REAL docs tree (not a fixture) and asserts no callout line
 * uses the bare-text form. It is the "cannot silently ship again" lock the
 * per-file runtime diagnostic (advisory `this.warn`) can't be by itself.
 *
 * Fence-aware: a ```` ```md ```` sample that shows `:::warning …` is legitimate
 * documentation of the syntax and must not be flagged.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { describe, expect, it } from 'vitest'

// Walk up from the test's cwd (the package dir under `bun --filter`) to the
// repo root — the first ancestor that contains `docs/src/content/docs`.
function findDocsDir(): string | null {
  let dir = process.cwd()
  const root = parse(dir).root
  while (dir !== root) {
    const candidate = join(dir, 'docs', 'src', 'content', 'docs')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  return null
}

const DOCS_DIR = findDocsDir()

const CALLOUT_TYPES = 'tip|warning|note|danger|info'
// A known callout type followed by bare text (a run of whitespace then any
// char that is NOT `[` or `{`). `:::warning[…]` / `:::warning{…}` / a bare
// `:::` close / `:::warning` alone on the line are all fine.
const RAW_LEAK = new RegExp(`^:::(?:${CALLOUT_TYPES})[ \\t]+[^\\[{]`)

function mdFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...mdFiles(p))
    else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) out.push(p)
  }
  return out
}

function rawLeaks(source: string): string[] {
  const hits: string[] = []
  let inFence = false
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (RAW_LEAK.test(line)) hits.push(`${i + 1}: ${line.slice(0, 72)}`)
  }
  return hits
}

describe('docs callouts — no bare-text raw leak', () => {
  it.skipIf(DOCS_DIR === null)(
    'every `:::type` title in the docs uses `[label]` or `{title=…}`, never bare text',
    () => {
      const docsDir = DOCS_DIR as string
      const offenders: string[] = []
      for (const file of mdFiles(docsDir)) {
        const leaks = rawLeaks(readFileSync(file, 'utf8'))
        for (const l of leaks) offenders.push(`${file.replace(docsDir + '/', '')}:${l}`)
      }
      expect(
        offenders,
        `Bare-text callouts leak as literal ":::type …" on the page. ` +
          `Use ":::type[Title]" or ":::type{title=\\"Title\\"}":\n  ${offenders.join('\n  ')}`,
      ).toEqual([])
    },
  )
})
