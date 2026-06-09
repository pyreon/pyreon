#!/usr/bin/env bun
/**
 * Fail-fast guard against `<Playground>` re-appearing in docs-zero
 * markdown after the PR #1448 migration.
 *
 * The legacy iframe-sandboxed `<Playground code={`…`}>` shape was
 * deprecated in favor of `<Example file="./examples/…" />` because:
 *
 *   - Real `.tsx` files: typechecked, lint-covered, refactor-safe
 *   - Inline mount: no iframe boundary, signals share native
 *   - No template-literal escape-pass hazards (PR #1434 bug class)
 *
 * This script greps every `.md` file under
 * `examples/docs-zero/src/content/docs/` for `<Playground` and reports
 * any matches. Exits 1 if any found.
 *
 * Run on every PR via `bun run validate-fast`. Bypass with
 * `--allow-list <file>` per legitimate exception (none today).
 *
 * Usage:
 *   bun scripts/check-no-legacy-playground.ts          # gate
 *   bun scripts/check-no-legacy-playground.ts --json   # machine-readable
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

// `import.meta.dir` is undefined when this module is imported from a
// vitest test. Fall back to cwd-relative resolution; the `scanFile`
// export is what tests exercise, so the path constants are unused there.
const REPO_ROOT = path.resolve(
  typeof import.meta.dir === 'string' ? import.meta.dir : process.cwd(),
  typeof import.meta.dir === 'string' ? '..' : '.',
)
const DOCS_DIR = path.join(
  REPO_ROOT,
  'examples/docs-zero/src/content/docs',
)
const ALLOWED_PROSE_FILES = new Set([
  // The new docs page literally documents what `<Playground>` was and
  // why it was deprecated. Prose references (in code-spans or table
  // cells) don't count as authoring usage.
  'zero-content.md',
  'example-dx.md',
])

interface Finding {
  file: string
  line: number
  source: string
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  for (const d of dirents) {
    const full = path.join(dir, d.name)
    if (d.isDirectory()) {
      out.push(...(await walk(full)))
    } else if (d.isFile() && d.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Scan ONE file for `<Playground` JSX directive usages. Returns the
 * matching line + content for diagnostic purposes. Skips matches that
 * sit inside a code fence (` ```…``` `) since those are deliberately
 * displaying the syntax, not invoking it.
 *
 * @internal exported for testing
 */
export function scanFile(content: string): Array<{ line: number; source: string }> {
  const findings: Array<{ line: number; source: string }> = []
  const lines = content.split('\n')
  let inCodeFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    if (line.includes('<Playground')) {
      findings.push({ line: i + 1, source: line.trim() })
    }
  }
  return findings
}

async function main() {
  const json = process.argv.includes('--json')
  const files = await walk(DOCS_DIR)
  const findings: Finding[] = []
  for (const f of files) {
    const rel = path.relative(REPO_ROOT, f)
    const basename = path.basename(f)
    if (ALLOWED_PROSE_FILES.has(basename)) continue
    const content = await fs.readFile(f, 'utf8')
    const hits = scanFile(content)
    for (const h of hits) {
      findings.push({ file: rel, line: h.line, source: h.source })
    }
  }
  if (json) {
    console.log(JSON.stringify({ findings }, null, 2))
    process.exit(findings.length > 0 ? 1 : 0)
    return
  }
  if (findings.length === 0) {
    console.log(
      `[check-no-legacy-playground] OK — 0 \`<Playground>\` usages in ${files.length} docs-zero markdown file(s).`,
    )
    return
  }
  console.error(
    `[check-no-legacy-playground] FAIL — ${findings.length} legacy \`<Playground>\` usage(s):`,
  )
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.source.slice(0, 100)}`)
  }
  console.error(
    `\nLegacy <Playground> was deprecated in PR #1448. Use <Example file="./examples/<topic>/<slug>" /> instead. See docs/zero-content for the migration guide.`,
  )
  process.exit(1)
}

if (import.meta.main) {
  await main()
}
