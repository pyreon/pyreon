/**
 * Branch-coverage specs for `src/content-audit.ts`, driven entirely through
 * the module's PUBLIC exports (`auditContent`, `findContentConfigs`,
 * `parseContentConfig`, `readFrontmatter`, `readTitleFromFrontmatter`,
 * `deriveSlug`, `extractInternalLinks`, `formatContentFindings`).
 *
 * Every spec pairs the input that TAKES an arm with the neighbouring input
 * that must NOT — a config shape the parser accepts beside the one it
 * declines, a finding that fires beside the corrected form that stays quiet.
 * Fixtures are real on-disk temp trees (the audit is a filesystem walker;
 * a synthesized AST would test the guard, not the walker).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  auditContent,
  type ContentAuditResult,
  deriveSlug,
  extractInternalLinks,
  findContentConfigs,
  formatContentFindings,
  parseContentConfig,
  readFrontmatter,
  readTitleFromFrontmatter,
} from '../content-audit'

/** ESC, built at runtime so this file carries no control bytes. */
const ESC = String.fromCharCode(27)

const cleanups: string[] = []
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true })
})

/**
 * A temp tree OUTSIDE the repo, so `findMonorepoRoot` can be steered: pass
 * `withPackagesSentinel: false` and no ancestor of the tree carries a
 * `packages/` directory (verified: `/`, `/private`, `/private/tmp` and
 * `os.tmpdir()`'s chain have none), which is the only way to reach the
 * "walked to the filesystem root, found nothing" arm.
 */
function makeTree(withPackagesSentinel = true) {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-cov-content-'))
  cleanups.push(root)
  if (withPackagesSentinel) mkdirSync(join(root, 'packages'), { recursive: true })
  return {
    root,
    write(rel: string, body: string) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, body, 'utf8')
      return abs
    },
  }
}

function codes(r: ContentAuditResult) {
  return r.findings.map((f) => f.code).sort()
}

// ═══════════════════════════════════════════════════════════════════════════
// findMonorepoRoot — the `packages/` sentinel and its two failure arms
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — monorepo-root discovery', () => {
  it('claims a directory whose `packages` entry is a DIRECTORY', () => {
    const t = makeTree(true)
    t.write('content.config.ts', 'export default defineConfig({ collections: {} })')
    expect(auditContent(t.root).root).toBe(t.root)
  })

  it('does NOT claim a directory whose `packages` entry is a FILE — walks past it', () => {
    // statSync succeeds but isDirectory() is false: the arm a try/catch on
    // statSync alone would never reach.
    const t = makeTree(false)
    t.write('packages', 'this is a file, not a directory\n')
    const r = auditContent(t.root)
    // No ancestor carries a real `packages/` dir, so the walk hits the
    // filesystem root and falls back to startDir.
    expect(r.root).toBe(t.root)
  })

  it('falls back to startDir when NO ancestor carries a packages/ dir', () => {
    const t = makeTree(false)
    t.write('content.config.ts', 'export default defineConfig({ collections: {} })')
    const r = auditContent(t.root)
    expect(r.root).toBe(t.root)
    expect(r.summary.configFilesScanned).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// findContentConfigs — the walker's skip / depth / cap arms
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — findContentConfigs walker', () => {
  it('lets `.pyreon` past the dotfile guard, then drops it via SKIP_DIRS', () => {
    // The dotfile guard carves `.pyreon` out explicitly (`name !== '.pyreon'`),
    // but SKIP_DIRS ALSO lists `.pyreon` one line later — so the carve-out is
    // reached and immediately overridden. Both dot-directories end up skipped;
    // the sibling ordinary directory is the control that proves the walk ran.
    const t = makeTree()
    t.write('.pyreon/content.config.ts', 'export default {}')
    t.write('.hidden/content.config.ts', 'export default {}')
    t.write('site/content.config.ts', 'export default {}')
    const found = findContentConfigs(t.root)
    expect(found.some((p) => p.includes('.pyreon'))).toBe(false)
    expect(found.some((p) => p.includes('.hidden'))).toBe(false)
    expect(found.some((p) => p.includes('site'))).toBe(true)
  })

  it('skips SKIP_DIRS (node_modules) but not a sibling ordinary directory', () => {
    const t = makeTree()
    t.write('node_modules/pkg/content.config.ts', 'export default {}')
    t.write('apps/site/content.config.ts', 'export default {}')
    const found = findContentConfigs(t.root)
    expect(found.some((p) => p.includes('node_modules'))).toBe(false)
    expect(found.some((p) => p.includes(join('apps', 'site')))).toBe(true)
  })

  it('stops at `max` depth — a config one level deeper is invisible', () => {
    const t = makeTree()
    t.write('a/content.config.ts', 'export default {}')
    t.write('a/b/content.config.ts', 'export default {}')
    // max = 1: walk(root, 0) descends to a/ at depth 1, but a/b/ is depth 2.
    const shallow = findContentConfigs(t.root, 1)
    expect(shallow.some((p) => p.endsWith(join('a', 'content.config.ts')))).toBe(true)
    expect(shallow.some((p) => p.includes(join('a', 'b')))).toBe(false)
    // Default max reaches both.
    expect(findContentConfigs(t.root)).toHaveLength(2)
  })

  it('caps the result set at 64 configs for huge monorepos', () => {
    const t = makeTree()
    // 4 recognized filenames per directory x 20 dirs = 80 candidates.
    for (let i = 0; i < 20; i++) {
      for (const name of [
        'content.config.ts',
        'content.config.mts',
        'content.config.js',
        'content.config.mjs',
      ]) {
        t.write(`app${i}/${name}`, 'export default {}')
      }
    }
    const found = findContentConfigs(t.root)
    expect(found.length).toBeGreaterThanOrEqual(64)
    expect(found.length).toBeLessThan(80)
  })

  it('ignores a file that is not one of the four recognized config names', () => {
    const t = makeTree()
    t.write('content.config.cts', 'export default {}')
    expect(findContentConfigs(t.root)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// parseContentConfig — every declined shape beside the accepted one
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — parseContentConfig shape handling', () => {
  function parse(body: string) {
    const t = makeTree()
    return parseContentConfig(t.write('content.config.ts', body))
  }

  it('skips a non-PropertyAssignment (spread) at config top level, keeps the real key', () => {
    const decls = parse(`export default defineConfig({
  ...base,
  collections: { docs: { type: 'pages', path: 'src/content/docs' } },
})`)
    expect(decls.map((d) => d.name)).toEqual(['docs'])
  })

  it('skips config keys other than `collections`', () => {
    const decls = parse(`export default defineConfig({
  outDir: 'dist',
  collections: { docs: { type: 'pages', path: 'c' } },
})`)
    expect(decls.map((d) => d.name)).toEqual(['docs'])
  })

  it('declines a `collections` value that is not an object literal', () => {
    expect(parse(`export default defineConfig({ collections: sharedCollections })`)).toEqual([])
  })

  it('skips a spread INSIDE collections but keeps the sibling entry', () => {
    const decls = parse(`export default defineConfig({
  collections: { ...inherited, blog: { type: 'data', path: 'c' } },
})`)
    expect(decls.map((d) => d.name)).toEqual(['blog'])
  })

  it('skips a COMPUTED collection key (readPropName gives null) but keeps a literal sibling', () => {
    const decls = parse(`export default defineConfig({
  collections: {
    [dynamicName]: { type: 'pages', path: 'a' },
    docs: { type: 'pages', path: 'b' },
  },
})`)
    expect(decls.map((d) => d.name)).toEqual(['docs'])
  })

  it('accepts a string-literal collection key alongside an identifier one', () => {
    // NOTE a template-literal property key (`\u0060k\u0060: v`) is not valid
    // syntax — TS parses it as a TaggedTemplateExpression, never a
    // PropertyName — so `readPropName`'s NoSubstitutionTemplateLiteral arm is
    // unreachable through any parseable config.
    const decls = parse(`export default defineConfig({
  collections: {
    'my-docs': { type: 'pages', path: 'a' },
    docs: { type: 'pages', path: 'b' },
  },
})`)
    expect(decls.map((d) => d.name).sort()).toEqual(['docs', 'my-docs'])
  })

  it('declines a collection initializer that is neither defineCollection() nor an object', () => {
    const decls = parse(`export default defineConfig({
  collections: { docs: sharedDocs, blog: { type: 'pages', path: 'b' } },
})`)
    expect(decls.map((d) => d.name)).toEqual(['blog'])
  })

  it('skips a spread inside a collection body and still reads path/type', () => {
    const decls = parse(`export default defineConfig({
  collections: { docs: defineCollection({ ...shared, type: 'pages', path: 'here' }) },
})`)
    expect(decls[0]?.type).toBe('pages')
    expect(decls[0]?.contentDir.endsWith('here')).toBe(true)
  })

  it('falls back to src/content/<name> when the collection declares no `path`', () => {
    const decls = parse(`export default defineConfig({
  collections: { docs: defineCollection({ type: 'pages' }) },
})`)
    expect(decls[0]?.contentDir.endsWith(join('src', 'content', 'docs'))).toBe(true)
  })

  it('types an unrecognized `type` value as `unknown`, a known one verbatim', () => {
    const weird = parse(`export default defineConfig({
  collections: { docs: { type: 'weird', path: 'a' } },
})`)
    expect(weird[0]?.type).toBe('unknown')
    const data = parse(`export default defineConfig({
  collections: { docs: { type: 'data', path: 'a' } },
})`)
    expect(data[0]?.type).toBe('data')
    const none = parse(`export default defineConfig({
  collections: { docs: { path: 'a' } },
})`)
    expect(none[0]?.type).toBe('unknown')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Markdown-file walker + slug derivation
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — markdown walk + deriveSlug', () => {
  it('collects .mdx alongside .md and ignores other extensions + dotfiles', () => {
    const t = makeTree()
    t.write(
      'content.config.ts',
      `export default defineConfig({ collections: { docs: { type: 'data', path: 'c' } } })`,
    )
    t.write('c/a.md', 'a')
    t.write('c/b.mdx', 'b')
    t.write('c/notes.txt', 'ignored')
    t.write('c/.secret.md', 'ignored')
    expect(auditContent(t.root).summary.mdFilesScanned).toBe(2)
  })

  it('stops the markdown walk past depth 32', () => {
    const t = makeTree()
    t.write(
      'content.config.ts',
      `export default defineConfig({ collections: { docs: { type: 'data', path: 'c' } } })`,
    )
    // depth 0 = `c` itself; a file 33 directories below is past the cap.
    const deep = Array.from({ length: 33 }, () => 'd').join('/')
    t.write(`c/${deep}/too-deep.md`, 'x')
    t.write('c/shallow.md', 'x')
    expect(auditContent(t.root).summary.mdFilesScanned).toBe(1)
  })

  it('keeps a dot-less basename intact (lastDot <= 0) but strips a real extension', () => {
    expect(deriveSlug('/c/README', '/c')).toBe('README')
    expect(deriveSlug('/c/guide.md', '/c')).toBe('guide')
    expect(deriveSlug('/c/a/index.md', '/c')).toBe('a')
    expect(deriveSlug('/c/index.md', '/c')).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Frontmatter + links (already-public pure helpers)
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — frontmatter + link extraction edges', () => {
  it('accepts a CRLF frontmatter opener, rejects a body with no opener', () => {
    expect(readFrontmatter('---\r\ntitle: a\n---\nbody').startLine).toBe(1)
    expect(readFrontmatter('no frontmatter').startLine).toBe(0)
  })

  it('reads the FIRST title-prefixed line and skips non-title lines', () => {
    expect(readTitleFromFrontmatter('draft: true\ntitle: Real\nother: x')).toBe('Real')
    expect(readTitleFromFrontmatter('draft: true')).toBeNull()
  })

  it('closes and RE-opens a fence, so links after the closing fence are seen', () => {
    const links = extractInternalLinks(
      ['```', '[in](/fenced)', '```', '[out](/live)'].join('\n'),
    )
    expect(links.map((l) => l.url)).toEqual(['/live'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Detector arms: `data` collections, unknown-typed collections
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — missing-title applies to pages + unknown, never to data', () => {
  function withType(type: string | null) {
    const t = makeTree()
    const typeProp = type === null ? '' : `type: '${type}', `
    t.write(
      'content.config.ts',
      `export default defineConfig({ collections: { docs: { ${typeProp}path: 'c' } } })`,
    )
    t.write('c/a.md', 'no frontmatter here\n')
    return auditContent(t.root)
  }

  it('fires for a `pages` collection', () => {
    expect(codes(withType('pages'))).toContain('missing-frontmatter-title')
  })

  it('fires for an `unknown`-typed collection (no `type` declared)', () => {
    expect(codes(withType(null))).toContain('missing-frontmatter-title')
  })

  it('stays QUIET for a `data` collection — data entries need no page title', () => {
    expect(codes(withType('data'))).not.toContain('missing-frontmatter-title')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Formatter — colour on / colour off, related present / absent
// ═══════════════════════════════════════════════════════════════════════════

describe('content-audit — formatContentFindings', () => {
  function brokenLinkResult() {
    const t = makeTree()
    t.write(
      'content.config.ts',
      `export default defineConfig({ collections: { docs: { type: 'pages', path: 'c' } } })`,
    )
    t.write('c/a.md', '---\ntitle: A\n---\n\n[gone](/docs/missing)\n')
    return auditContent(t.root)
  }

  it('emits ANSI escapes by DEFAULT and plain text with `color: false`', () => {
    const r = brokenLinkResult()
    expect(codes(r)).toContain('broken-internal-link')
    const colored = formatContentFindings(r)
    expect(colored).toContain(`${ESC}[31m`)
    expect(colored).toContain(`${ESC}[36m`)
    // The `related` pointer back to the config declaration is dimmed.
    expect(colored).toContain(`${ESC}[2m`)
    expect(colored).toContain('declared at')

    const plain = formatContentFindings(r, { color: false })
    expect(plain).not.toContain(ESC)
    expect(plain).toContain('broken-internal-link')
    expect(plain).toContain('declared at')
  })

  it('omits the `declared at` block for a finding with no `related` (orphan)', () => {
    const t = makeTree()
    t.write(
      'content.config.ts',
      `export default defineConfig({ collections: { docs: { type: 'data', path: 'elsewhere' } } })`,
    )
    t.write('src/content/stray.md', '---\ntitle: Stray\n---\n')
    const r = auditContent(t.root)
    expect(codes(r)).toEqual(['orphaned-md-file'])
    const out = formatContentFindings(r)
    expect(out).toContain('orphaned-md-file')
    expect(out).not.toContain('declared at')
  })

  it('reports the clean case without any finding blocks', () => {
    const t = makeTree()
    const clean = auditContent(t.root)
    expect(clean.findings).toEqual([])
    expect(formatContentFindings(clean)).toContain('No content audit findings')
  })
})
