#!/usr/bin/env bun
/**
 * Migrate `<Playground>` to `<Example>` across all docs-zero markdown pages.
 *
 * For each `<Playground title="..." height={N} code={\`...\`} />` block found:
 *   1. Slugify the title → `signal-read-write-react`
 *   2. Extract `code={\`...\`}` content (template literal body)
 *   3. Write a Pyreon component file at
 *      `examples/docs-zero/src/examples/<topic>/<slug>.tsx` (topic = source
 *      markdown filename stem)
 *   4. Replace the original markup with `<Example file="./examples/<topic>/<slug>" title="..." />`
 *
 * Bun-native (uses Bun.glob + bun:fs). Idempotent — running twice with the
 * same content produces zero new diffs.
 *
 * Usage:
 *   bun scripts/migrate-playground-to-example.ts          # dry-run
 *   bun scripts/migrate-playground-to-example.ts --apply  # write changes
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dir, '..')
const DOCS_DIR = path.join(
  REPO_ROOT,
  'examples/docs-zero/src/content/docs',
)
const EXAMPLES_DIR = path.join(
  REPO_ROOT,
  'examples/docs-zero/src/examples',
)

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

interface PlaygroundMatch {
  /** Original full source (the whole `<Playground.../>` block). */
  source: string
  title: string
  /** Body of the `code={\`…\`}` template literal — JS to drop into the .tsx. */
  code: string
  /** Index in the source markdown the match begins at. */
  index: number
  /** Index in the source markdown the match ends at (exclusive). */
  end: number
}

/**
 * Parse every `<Playground ... />` block from a markdown source. Hand-rolled
 * because the `code={\`...\`}` template literal can contain JSX-looking
 * tokens (`<button>` etc.) that defeat both regex AND a vanilla JSX parser.
 *
 * Algorithm:
 *  1. Find each `<Playground` prefix.
 *  2. Find the matching `/>` that closes the JSX element — walking backtick-
 *     aware so a `<…/>` inside `code={\`…\`}` doesn't terminate parsing.
 *  3. Extract `title=` and `code={\`…\`}` attributes from the block body.
 */
export function parsePlaygrounds(src: string): PlaygroundMatch[] {
  const out: PlaygroundMatch[] = []
  const PREFIX = '<Playground'
  let i = 0
  while (i < src.length) {
    const start = src.indexOf(PREFIX, i)
    if (start === -1) break
    // Walk forward through the block, respecting backtick string literals,
    // to find the closing `/>`.
    let j = start + PREFIX.length
    let inBacktick = false
    let inBraceDepth = 0
    let end = -1
    while (j < src.length) {
      const ch = src[j]!
      if (inBacktick) {
        if (ch === '`') inBacktick = false
        else if (ch === '\\' && j + 1 < src.length) j++
        j++
        continue
      }
      if (ch === '`') {
        inBacktick = true
        j++
        continue
      }
      if (ch === '{') inBraceDepth++
      else if (ch === '}') inBraceDepth--
      else if (
        ch === '/' &&
        src[j + 1] === '>' &&
        inBraceDepth === 0
      ) {
        end = j + 2
        break
      }
      j++
    }
    if (end === -1) {
      // Could not find a closing `/>` — bail past this prefix to avoid an
      // infinite loop on malformed input.
      i = start + PREFIX.length
      continue
    }
    const block = src.slice(start, end)
    const titleMatch = /title="([^"]+)"/.exec(block)
    // The `code` attribute uses `code={\`…\`}` — walk it manually to capture
    // the body even when nested backticks/escapes are present.
    const codeStart = block.indexOf('code={')
    let codeBody = ''
    if (codeStart !== -1) {
      let k = codeStart + 'code={'.length
      // Skip optional whitespace + opening backtick.
      while (k < block.length && /\s/.test(block[k]!)) k++
      if (block[k] === '`') {
        k++
        const bodyStart = k
        while (k < block.length) {
          const c = block[k]!
          if (c === '\\' && k + 1 < block.length) {
            k += 2
            continue
          }
          if (c === '`') break
          k++
        }
        codeBody = block.slice(bodyStart, k)
      }
    }
    out.push({
      source: block,
      title: titleMatch?.[1] ?? '',
      code: codeBody,
      index: start,
      end,
    })
    i = end
  }
  return out
}

/**
 * Convert the raw playground code string (which uses `h(...)` + `mount(ui, app)`)
 * into a Pyreon component module. Imports are derived from a best-effort
 * symbol scan of the code body.
 */
export function buildExampleModule(args: {
  title: string
  code: string
}): string {
  const used = new Set<string>()
  const REACT_SYMBOLS = ['signal', 'computed', 'effect', 'batch', 'untrack']
  const CORE_SYMBOLS = ['h']
  const RUNTIME_DOM_SYMBOLS = ['mount']
  for (const s of [...REACT_SYMBOLS, ...CORE_SYMBOLS, ...RUNTIME_DOM_SYMBOLS]) {
    // Word-boundary, prefix-match against either bare identifier or
    // identifier followed by `.` / `(`.
    const re = new RegExp(`(^|[^A-Za-z0-9_])${s}(\\b)`, 'm')
    if (re.test(args.code)) used.add(s)
  }
  // The playground's `code={\`...\`}` body had backticks and `${...}`
  // escaped because it sat inside a JSX template literal. Un-escape them
  // now that the code lives in a real `.tsx` file where it's source, not a
  // string. Order matters: do these BEFORE any other transforms so empty-
  // array-signal type-annotation etc. operate on the canonical form.
  let body = args.code
  body = body.replace(/\\`/g, '`')
  body = body.replace(/\\\$\{/g, '${')
  // Remove the iframe-only `document.getElementById('app')` + `mount(ui, app)`
  // boilerplate; the component returns `ui` directly.
  body = body.replace(/const\s+app\s*=\s*document\.getElementById\('app'\)\s*\n?/g, '')
  body = body.replace(/mount\(\s*ui\s*,\s*app\s*\)\s*\n?$/g, '')
  body = body.trimEnd()
  // Replace `const ui = h(` with `return h(` so the function body returns it.
  body = body.replace(/const\s+ui\s*=\s*h\(/, 'return h(')
  // Help TypeScript out: `signal([])` infers as `Signal<never[]>` because the
  // array literal is empty. The original playground was JS-only so this didn't
  // surface; under TS strict mode the consumer can't push strings into it.
  // The pragmatic heuristic — most empty-array signals in our docs are log /
  // history lists holding `string[]`. We type them accordingly; the rare
  // non-string case is a manual touch-up.
  body = body.replace(
    /(\bconst\s+\w+\s*=\s*)signal\(\s*\[\s*\]\s*\)/g,
    '$1signal<string[]>([])',
  )

  const imports: string[] = []
  const reactImports = REACT_SYMBOLS.filter((s) => used.has(s))
  if (reactImports.length > 0) {
    imports.push(`import { ${reactImports.join(', ')} } from '@pyreon/reactivity'`)
  }
  const coreImports = CORE_SYMBOLS.filter((s) => used.has(s))
  if (coreImports.length > 0) {
    imports.push(`import { ${coreImports.join(', ')} } from '@pyreon/core'`)
  }

  let componentName =
    args.title
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join('') || 'PlaygroundExample'
  // JS identifiers can't start with a digit (e.g. `12ColumnGrid`); prefix
  // with `Ex` to recover. Keeps the rest of the title-derived name intact.
  if (/^\d/.test(componentName)) componentName = 'Ex' + componentName

  return `// @ts-nocheck — migrated 1:1 from a JS \`<Playground>\` block. The
// original ran in an iframe with no TS strictness, so several arrow-fn
// params + signal-shape inference are implicit-any here. Refactor to
// fully-typed code in a follow-up; this preserves the documented behavior
// without expanding scope at migration time.
${imports.join('\n')}

/**
 * Migrated from \`<Playground>\` — ${args.title}.
 *
 * The original playground ran inline JS inside an iframe via \`mount(ui, app)\`.
 * This is the same code as a real Pyreon component file: refactor-safe,
 * lint-covered, mounted inline by \`<Example file="...">\`. See \`docs/
 * zero-content\` for the inline-mount + signal-share contract.
 */
export default function ${componentName}() {
${indent(body, 2)}
}
`
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n)
  return s
    .split('\n')
    .map((l) => (l.length === 0 ? '' : pad + l))
    .join('\n')
}

interface MigrationResult {
  file: string
  playgroundCount: number
  emittedExamples: string[]
}

async function migrateFile(
  mdPath: string,
  apply: boolean,
): Promise<MigrationResult> {
  const src = await fs.readFile(mdPath, 'utf8')
  const matches = parsePlaygrounds(src)
  if (matches.length === 0) {
    return { file: mdPath, playgroundCount: 0, emittedExamples: [] }
  }
  const topic = path.basename(mdPath, '.md')
  const topicDir = path.join(EXAMPLES_DIR, topic)
  const emittedExamples: string[] = []
  let next = src
  // Track replacements + apply from the END of the source backward so
  // earlier indices don't shift.
  const ordered = [...matches].sort((a, b) => b.index - a.index)
  const slugCount = new Map<string, number>()
  for (const m of ordered) {
    let slug = slugify(m.title) || 'example'
    const dupNum = slugCount.get(slug) ?? 0
    slugCount.set(slug, dupNum + 1)
    if (dupNum > 0) slug = `${slug}-${dupNum + 1}`
    const examplePath = path.join(topicDir, `${slug}.tsx`)
    const moduleSrc = buildExampleModule({ title: m.title, code: m.code })
    if (apply) {
      await fs.mkdir(topicDir, { recursive: true })
      await fs.writeFile(examplePath, moduleSrc, 'utf8')
    }
    emittedExamples.push(path.relative(REPO_ROOT, examplePath))
    const replacement = `<Example file="./examples/${topic}/${slug}" title="${m.title}" />`
    next = next.slice(0, m.index) + replacement + next.slice(m.end)
  }
  if (apply) {
    await fs.writeFile(mdPath, next, 'utf8')
  }
  return {
    file: path.relative(REPO_ROOT, mdPath),
    playgroundCount: matches.length,
    emittedExamples: emittedExamples.reverse(),
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))
  const only = onlyArg ? onlyArg.slice('--only='.length) : null
  const files = (await fs.readdir(DOCS_DIR))
    .filter((f) => f.endsWith('.md'))
    .filter((f) => only === null || f === `${only}.md`)
    .map((f) => path.join(DOCS_DIR, f))
  // Hand-curated SKIP list: pages where `<Playground>` appears only in
  // prose / code-fences / table cells, not as a real JSX directive.
  const SKIP = new Set([
    path.join(DOCS_DIR, 'zero-content.md'),
    path.join(DOCS_DIR, 'example-dx.md'),
  ])
  const results: MigrationResult[] = []
  for (const f of files) {
    if (SKIP.has(f)) continue
    const r = await migrateFile(f, apply)
    if (r.playgroundCount > 0) results.push(r)
  }
  const total = results.reduce((n, r) => n + r.playgroundCount, 0)
  console.log(
    `${apply ? 'Migrated' : '[dry-run] Would migrate'} ${total} <Playground> instance(s) across ${results.length} file(s):`,
  )
  for (const r of results) {
    console.log(`  ${r.file} — ${r.playgroundCount} instance(s)`)
    for (const e of r.emittedExamples) console.log(`    + ${e}`)
  }
  if (!apply) {
    console.log('\nRe-run with --apply to write the changes.')
  }
}

if (import.meta.main) {
  await main()
}
