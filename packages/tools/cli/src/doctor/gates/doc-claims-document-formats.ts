/**
 * The doc-claims gate's document-format check: a docs page, README or package
 * manifest that calls `render(doc, '<format>')` with a format `@pyreon/document`
 * does not register. `render(tree, 'markdown')` was copied from two READMEs and
 * a manifest (#4307); the format id is `'md'`, so the call rejects with
 * `[@pyreon/document] No renderer registered for format 'markdown'`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Finding } from '../types'

/**
 * The literals of `@pyreon/document`'s `OutputFormat` union — the formats
 * `render()` resolves without a `registerRenderer` call. Read as text from
 * `types.ts`, the same source the format-count claim reads.
 */
export function documentFormatIds(repoRoot: string): Set<string> {
  const file = join(repoRoot, 'packages/fundamentals/document/src/types.ts')
  if (!existsSync(file)) return new Set()
  const m = readFileSync(file, 'utf8').match(/export type OutputFormat\s*=\s*([\s\S]*?)(?:\n\n|\nexport |\ntype )/)
  if (!m?.[1]) return new Set()

  return new Set([...m[1].matchAll(/'([a-z0-9-]+)'/gi)].map((x) => x[1] as string))
}

/** The files a reader copies `render()` calls from: docs content, every README, every package manifest. */
function formatDocFiles(repoRoot: string): string[] {
  const out: string[] = []
  const walk = (dir: string, accept: (rel: string, name: string) => boolean): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'lib' || entry === 'dist' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, accept)
      else if (accept(relative(repoRoot, full).split('\\').join('/'), entry)) out.push(full)
    }
  }
  walk(join(repoRoot, 'docs', 'src', 'content'), (_rel, name) => /\.mdx?$/.test(name))
  walk(
    join(repoRoot, 'packages'),
    (rel, name) => name === 'README.md' || /^packages\/[^/]+\/[^/]+\/src\/manifest\.ts$/.test(rel),
  )
  if (existsSync(join(repoRoot, 'README.md'))) out.push(join(repoRoot, 'README.md'))

  return out
}

/** A string literal, or a template literal without `${…}` (which is computed at runtime, not a format id). */
function isStaticLiteral(quote: string, value: string): boolean {
  return quote !== '`' || !value.includes('${')
}

/**
 * The second argument of the call whose `(` is at `open`, when it starts with
 * a string literal: its value and offset. Walks brackets and quotes so a first
 * argument like `h(Doc, { a: 1 })` or `'a,b'` is skipped as a whole.
 */
function secondStringArg(text: string, open: number): { value: string; at: number } | undefined {
  let depth = 0
  let quote = ''
  const limit = Math.min(text.length, open + 2000)
  for (let i = open + 1; i < limit; i++) {
    const c = text[i] as string
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return undefined
      depth--
    } else if (c === ',' && depth === 0) {
      const rest = text.slice(i + 1, i + 200)
      const m = rest.match(/^\s*(['"`])([^'"`\n]*)\1/)
      if (!m || !isStaticLiteral(m[1] as string, m[2] as string)) return undefined

      return { value: m[2] as string, at: i + 1 + (m.index ?? 0) + m[0].indexOf(m[1] as string) }
    }
  }

  return undefined
}

/**
 * Every `render(x, '<format>')` (a plain call, not a method) in docs, READMEs
 * and manifests whose format is neither a built-in `OutputFormat` nor
 * registered with `registerRenderer('<format>', …)` in the same file.
 */
export function findUnknownDocumentFormats(repoRoot: string): Finding[] {
  const known = documentFormatIds(repoRoot)
  if (known.size === 0) return []
  const findings: Finding[] = []
  for (const filePath of formatDocFiles(repoRoot)) {
    const text = readFileSync(filePath, 'utf8')
    if (!text.includes('render(')) continue
    const registered = new Set([...text.matchAll(/registerRenderer\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string))
    const relPath = relative(repoRoot, filePath)
    for (const m of text.matchAll(/(?<![\w$.])render\(/g)) {
      const arg = secondStringArg(text, (m.index ?? 0) + m[0].length - 1)
      // `'<format>'` / `'…'` stand for any format in prose, not a format id.
      if (!arg || !/^[\w-]+$/.test(arg.value) || known.has(arg.value) || registered.has(arg.value)) continue
      const line = text.slice(0, arg.at).split('\n').length
      const suggestion = arg.value === 'markdown' ? "'md'" : `one of ${[...known].map((f) => `'${f}'`).join(', ')}`
      findings.push({
        category: 'documentation',
        severity: 'error',
        code: 'doc-claims/unknown-document-format',
        gate: 'doc-claims',
        message: `${relPath}:${line}: \`render(…, '${arg.value}')\` names a format @pyreon/document does not register — the call rejects with "No renderer registered for format '${arg.value}'".`,
        location: { path: filePath, relPath },
        fix: `Use ${suggestion}, or register '${arg.value}' with registerRenderer() in the same example.`,
      })
    }
  }

  return findings
}
