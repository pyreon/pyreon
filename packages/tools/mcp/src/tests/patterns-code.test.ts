import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { loadPatternRegistry } from '../patterns'

// Code-quality test for the patterns corpus. Every ```ts / ```tsx /
// ```js / ```jsx fenced code block is parsed by the TypeScript
// compiler and any SYNTAX errors fail the build.
//
// What this catches: typos, unterminated strings, unbalanced braces,
// bad JSX closing tags, missing commas, broken template literals —
// the kinds of bugs review usually catches but sometimes doesn't.
//
// What this does NOT catch: semantic errors (type mismatches, unknown
// identifiers, import resolution). A pattern snippet intentionally
// uses `props` or `items` as stand-ins without declaring them — a
// full type-check would produce false positives on every such block.
// If that stricter gate is ever wanted, wrap each block in a
// synthetic `function _()` harness with a compiler host that stubs
// the unresolved symbols.
//
// If you add a block that needs to be excluded (illustrating a
// syntax ERROR on purpose, say), give its language tag a suffix —
// e.g. ```tsx-broken — which the test ignores.

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → mcp/ → tools/ → packages/ → repo root (5 ups)
const REPO_ROOT = resolve(HERE, '../../../../../')

// Language tags treated as TS/TSX-like (parsed with TSX script kind).
const TS_LANGS = new Set(['ts', 'tsx', 'typescript'])
const JS_LANGS = new Set(['js', 'jsx', 'javascript'])

interface CodeBlock {
  lang: string
  source: string
  startLine: number // 1-based line in the source markdown
}

function extractCodeBlocks(markdown: string): CodeBlock[] {
  const lines = markdown.split('\n')
  const blocks: CodeBlock[] = []
  let inside: { lang: string; startLine: number; buf: string[] } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = /^```(.*)$/.exec(line)
    if (fence) {
      if (inside === null) {
        // Opening fence; capture the language tag.
        inside = { lang: fence[1]!.trim(), startLine: i + 2, buf: [] }
      } else {
        // Closing fence; flush.
        blocks.push({ lang: inside.lang, source: inside.buf.join('\n'), startLine: inside.startLine })
        inside = null
      }
    } else if (inside !== null) {
      inside.buf.push(line)
    }
  }
  return blocks
}

function isRelevantBlock(block: CodeBlock): boolean {
  return TS_LANGS.has(block.lang) || JS_LANGS.has(block.lang)
}

function scriptKindFor(lang: string): ts.ScriptKind {
  if (lang === 'tsx' || lang === 'typescript') return ts.ScriptKind.TSX
  if (lang === 'ts') return ts.ScriptKind.TSX // treat `ts` blocks as TSX too — patterns often
                                              // include inline JSX in "ts" blocks by convention
  if (lang === 'jsx') return ts.ScriptKind.JSX
  if (lang === 'js' || lang === 'javascript') return ts.ScriptKind.JSX // same rationale
  return ts.ScriptKind.TSX
}

interface SyntaxFailure {
  pattern: string
  blockStartLine: number
  lang: string
  diagnostic: string
  blockLine: number // line WITHIN the block (1-based)
}

// `SourceFile.parseDiagnostics` is an internal TS field — not on the
// public .d.ts surface, but available at runtime after `createSourceFile`
// with setParentNodes=true. Using a structural cast keeps the test
// syntax-only (no Program / no type resolution) without pulling in a
// heavier `transpileModule` pipeline.
interface SourceFileWithParseDiagnostics extends ts.SourceFile {
  readonly parseDiagnostics: readonly ts.Diagnostic[]
}

function checkBlock(
  patternName: string,
  block: CodeBlock,
): SyntaxFailure[] {
  const sf = ts.createSourceFile(
    `${patternName}-block.tsx`,
    block.source,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindFor(block.lang),
  ) as SourceFileWithParseDiagnostics
  const failures: SyntaxFailure[] = []
  for (const d of sf.parseDiagnostics) {
    const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0)
    const message =
      typeof d.messageText === 'string'
        ? d.messageText
        : ts.flattenDiagnosticMessageText(d.messageText, '\n')
    failures.push({
      pattern: patternName,
      blockStartLine: block.startLine,
      lang: block.lang,
      diagnostic: message,
      blockLine: line + 1,
    })
  }
  return failures
}

describe('patterns content — every code block is syntactically valid', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it.each(registry.patterns.map((p) => [p.name, p.path]))(
    '%s code blocks parse without syntax errors',
    (name, path) => {
      const body = readFileSync(path, 'utf8')
      const blocks = extractCodeBlocks(body).filter(isRelevantBlock)
      expect(blocks.length).toBeGreaterThan(0) // every pattern has at least 1 code example

      const failures: SyntaxFailure[] = []
      for (const block of blocks) {
        failures.push(...checkBlock(name, block))
      }

      if (failures.length > 0) {
        // Render a readable failure message pointing at the exact
        // line inside the pattern file so fixing is trivial.
        const lines = failures.map(
          (f) =>
            `  ${f.pattern}:${f.blockStartLine + f.blockLine - 1} (${f.lang} block, line ${f.blockLine} of block): ${f.diagnostic}`,
        )
        throw new Error(`Syntax errors in pattern code blocks:\n${lines.join('\n')}`)
      }
    },
  )
})

describe('extractCodeBlocks — parser contract', () => {
  it('extracts every fenced block with its language tag', () => {
    const md = `# Title

Prose.

\`\`\`ts
const x: number = 1
\`\`\`

Some text.

\`\`\`tsx
const X = () => <div />
\`\`\`

\`\`\`bash
echo hi
\`\`\`
`
    const blocks = extractCodeBlocks(md)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]!.lang).toBe('ts')
    expect(blocks[1]!.lang).toBe('tsx')
    expect(blocks[2]!.lang).toBe('bash')
  })

  it('carries the correct startLine for each block (1-based into source)', () => {
    const md = `line 1
line 2
\`\`\`ts
content line A
content line B
\`\`\`
`
    const blocks = extractCodeBlocks(md)
    expect(blocks).toHaveLength(1)
    // Opening fence on line 3 → content starts at line 4
    expect(blocks[0]!.startLine).toBe(4)
  })

  it('is idempotent when run twice on the same input', () => {
    const md = '```ts\nconst x = 1\n```\n'
    expect(extractCodeBlocks(md)).toEqual(extractCodeBlocks(md))
  })
})

describe('isRelevantBlock filter', () => {
  it('includes ts, tsx, typescript, js, jsx, javascript', () => {
    for (const lang of ['ts', 'tsx', 'typescript', 'js', 'jsx', 'javascript']) {
      expect(isRelevantBlock({ lang, source: '', startLine: 1 })).toBe(true)
    }
  })

  it('excludes bash, html, md, and untagged blocks', () => {
    for (const lang of ['bash', 'html', 'md', '', 'sh', 'json']) {
      expect(isRelevantBlock({ lang, source: '', startLine: 1 })).toBe(false)
    }
  })

  it('excludes explicit -broken suffixes (intentional error demos)', () => {
    expect(isRelevantBlock({ lang: 'tsx-broken', source: '', startLine: 1 })).toBe(false)
    expect(isRelevantBlock({ lang: 'ts-broken', source: '', startLine: 1 })).toBe(false)
  })
})
