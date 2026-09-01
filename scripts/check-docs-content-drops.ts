#!/usr/bin/env bun
/**
 * Gate: no docs page may silently DROP content when it is rendered.
 *
 * `@pyreon/zero-content`'s markdown compiler already reports this — an
 * unhandled mdast node and an unknown callout directive both emit a warning
 * saying the content was dropped. Nothing read them.
 *
 * That is not hypothetical. On the commit that added this gate, ELEVEN of 207
 * pages were dropping text, and the warnings had been printing on every docs
 * build the whole time:
 *
 *   - `architecture-and-prior-art.md` lost three lines of the methodological
 *     caveat on the benchmark page, because two `~`-as-approximately figures
 *     paired into a GFM strikethrough spanning them.
 *   - Nine pages lost words to `remark-directive` claiming `:word` in prose —
 *     `display:none` lost `none`, `map 1:1 to every target` lost a `1`.
 *   - `zero.md` lost a SECURITY caveat (`lan: true` exposes your dev server)
 *     to a `:::caution` block, a callout type this pipeline does not have.
 *
 * A warning nobody reads is not a gate. This is the gate.
 *
 * Runs in `validate-fast` — it compiles markdown only, no bundler, no browser.
 */
import { readFileSync, globSync } from 'node:fs'
import { join } from 'node:path'
import { compileMarkdown } from '../packages/zero/zero-content/src/pipeline/parse'

/** A warning that means text the author wrote is absent from the output. */
export function isContentDropWarning(warning: string): boolean {
  return warning.includes('content was dropped') || warning.includes('Unknown callout directive')
}

export interface DropFinding {
  file: string
  warnings: string[]
}

async function main(): Promise<number> {
  const root = join(import.meta.dir, '..')
  const docsRoot = join(root, 'docs/src/content/docs')
  const files = globSync(join(docsRoot, '**/*.md')).sort()

  // An empty scan is a BROKEN gate, not a passing one — the docs tree moving
  // must fail loudly rather than silently stop checking anything.
  if (files.length === 0) {
    console.error(`✗ check-docs-content-drops scanned NO pages under ${docsRoot}.`)
    console.error('  The docs tree moved, or the glob is wrong. This is a gate failure, not a pass.')
    return 1
  }

  const findings: DropFinding[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const result = await compileMarkdown(source, file)
    const dropped = result.warnings.filter(isContentDropWarning)
    if (dropped.length > 0) findings.push({ file: file.slice(root.length + 1), warnings: dropped })
  }

  if (findings.length > 0) {
    console.error(`✗ ${findings.length} doc page(s) DROP content when rendered:\n`)
    for (const f of findings) {
      console.error(`  ${f.file}`)
      for (const w of f.warnings) console.error(`    ${w}`)
    }
    console.error('\n  Text the author wrote is absent from the built page.')
    console.error('  Callouts: valid types are tip, warning, note, danger, info.')
    return 1
  }

  console.log(`✓ ${files.length} doc page(s) render without dropping content.`)
  return 0
}

if (import.meta.main) process.exit(await main())
