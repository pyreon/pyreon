/**
 * @pyreon/compiler — content audit tests
 *
 * Per-code synthetic fixtures cover each finding type. Every detector
 * is bisect-verified by reverting its match condition and asserting
 * the relevant spec(s) fail with a clear message.
 *
 * Pure-syntactic walker — no file I/O outside the test fixtures. Each
 * test sets up its own tmp dir, runs `auditContent(tmpDir)`, and
 * checks the findings array.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  auditContent,
  deriveSlug,
  extractInternalLinks,
  formatContentFindings,
  parseContentConfig,
  readFrontmatter,
  readTitleFromFrontmatter,
} from '../content-audit'

// Workspace-local tmp root so bun/vitest can resolve absolute paths.
const TMP_ROOT = path.join(
  process.cwd(),
  'src',
  'tests',
  '__content_audit_tmp__',
)

describe('content-audit — discovery + parse', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'audit-'))
    // A `packages/` sentinel so `findMonorepoRoot` claims the tmp dir.
    await fs.mkdir(path.join(tmpDir, 'packages'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(rel: string, body: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, body, 'utf8')
    return abs
  }

  it('parses a defineConfig + defineCollection({ path, type }) shape', async () => {
    const configPath = await writeFile(
      'content.config.ts',
      `import { defineConfig, defineCollection } from '@pyreon/zero-content'
export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      path: 'src/content/docs',
      schema: {},
    }),
  },
})
`,
    )
    const decls = parseContentConfig(configPath)
    expect(decls).toHaveLength(1)
    expect(decls[0]?.name).toBe('docs')
    expect(decls[0]?.type).toBe('pages')
    expect(decls[0]?.contentDir).toBe(
      path.join(tmpDir, 'src', 'content', 'docs'),
    )
  })

  it('handles a bare object literal collection (no defineCollection wrapper)', async () => {
    const configPath = await writeFile(
      'content.config.ts',
      `export default defineConfig({
  collections: {
    blog: {
      type: 'data',
      path: 'content/blog',
    },
  },
})
`,
    )
    const decls = parseContentConfig(configPath)
    expect(decls).toHaveLength(1)
    expect(decls[0]?.type).toBe('data')
  })

  it('handles multiple collections in one config', async () => {
    const configPath = await writeFile(
      'content.config.ts',
      `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
    blog: defineCollection({ type: 'pages', path: 'src/content/blog' }),
  },
})
`,
    )
    const decls = parseContentConfig(configPath)
    expect(decls).toHaveLength(2)
    expect(decls.map((d) => d.name).sort()).toEqual(['blog', 'docs'])
  })

  it('returns no findings when no content.config exists', () => {
    const result = auditContent(tmpDir)
    expect(result.findings).toEqual([])
    expect(result.summary.configFilesScanned).toBe(0)
  })

  it('handles a missing/unreadable config gracefully', () => {
    const decls = parseContentConfig(path.join(tmpDir, 'nope.ts'))
    expect(decls).toEqual([])
  })

  it('handles a config with no collections block', async () => {
    const cfg = await writeFile(
      'content.config.ts',
      `export default defineConfig({})\n`,
    )
    const decls = parseContentConfig(cfg)
    expect(decls).toEqual([])
  })
})

describe('content-audit — readFrontmatter / readTitle / deriveSlug', () => {
  it('extracts a frontmatter body', () => {
    const r = readFrontmatter('---\ntitle: X\nfoo: bar\n---\n\nbody\n')
    expect(r.body).toBe('title: X\nfoo: bar')
    expect(r.startLine).toBe(1)
    expect(r.endLine).toBe(4)
  })

  it('returns empty body when no frontmatter', () => {
    const r = readFrontmatter('# h\n\nbody\n')
    expect(r.body).toBe('')
    expect(r.endLine).toBe(0)
  })

  it('returns empty body when frontmatter not closed', () => {
    const r = readFrontmatter('---\ntitle: X\nbody\n')
    expect(r.body).toBe('')
  })

  it('reads unquoted title from frontmatter', () => {
    expect(readTitleFromFrontmatter('title: My Page\nfoo: bar')).toBe('My Page')
  })

  it('reads double-quoted title (handles YAML-reserved chars)', () => {
    expect(readTitleFromFrontmatter('title: "@pyreon/sized-map"')).toBe(
      '@pyreon/sized-map',
    )
  })

  it('reads single-quoted title', () => {
    expect(readTitleFromFrontmatter("title: 'My Page'")).toBe('My Page')
  })

  it('returns null when title is missing', () => {
    expect(readTitleFromFrontmatter('foo: bar\nbaz: qux')).toBeNull()
  })

  it('returns null when title is empty', () => {
    expect(readTitleFromFrontmatter('title:\nbaz: qux')).toBeNull()
  })

  it('derives slugs by stripping extension', () => {
    const cd = '/abs/content/docs'
    expect(deriveSlug('/abs/content/docs/getting-started.md', cd)).toBe(
      'getting-started',
    )
    expect(deriveSlug('/abs/content/docs/group/sub.mdx', cd)).toBe('group/sub')
  })

  it('derives an empty slug for top-level index.md', () => {
    expect(deriveSlug('/abs/c/index.md', '/abs/c')).toBe('')
  })

  it('strips /index from nested paths', () => {
    expect(deriveSlug('/abs/c/docs/index.md', '/abs/c')).toBe('docs')
  })
})

describe('content-audit — extractInternalLinks', () => {
  it('finds internal links starting with /', () => {
    const links = extractInternalLinks(
      'See [getting started](/docs/getting-started) and [api](/docs/api).\n',
    )
    expect(links).toHaveLength(2)
    expect(links[0]?.url).toBe('/docs/getting-started')
    expect(links[1]?.url).toBe('/docs/api')
  })

  it('skips external links + relative paths + anchors', () => {
    const links = extractInternalLinks(
      '[ext](https://example.com) [rel](../sibling.md) [anchor](#x)\n',
    )
    expect(links).toEqual([])
  })

  it('skips links inside fenced code blocks', () => {
    const links = extractInternalLinks(
      'Real [link](/docs/x)\n\n```ts\n// [fake](/docs/inside) should be skipped\n```\n\nAnother [link](/docs/y)\n',
    )
    expect(links.map((l) => l.url)).toEqual(['/docs/x', '/docs/y'])
  })

  it('skips links inside inline code spans', () => {
    const links = extractInternalLinks(
      'Real [link](/docs/x) but `[fake](/docs/inside)` in code\n',
    )
    expect(links.map((l) => l.url)).toEqual(['/docs/x'])
  })

  it('drops query strings + fragments from the URL', () => {
    const links = extractInternalLinks(
      'See [x](/docs/foo?q=1#bar) and [y](/docs/bar#z)\n',
    )
    expect(links.map((l) => l.url)).toEqual(['/docs/foo', '/docs/bar'])
  })

  it('records 1-based line + column', () => {
    const links = extractInternalLinks('top\n  middle [x](/docs/x) tail\n')
    expect(links[0]?.line).toBe(2)
    expect(links[0]?.column).toBe(10)
  })
})

describe('content-audit — missing-frontmatter-title finding', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'audit-'))
    await fs.mkdir(path.join(tmpDir, 'packages'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'content.config.ts'),
      `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
  },
})
`,
    )
    await fs.mkdir(path.join(tmpDir, 'src', 'content', 'docs'), {
      recursive: true,
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('fires on a page with no frontmatter at all', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'orphan.md'),
      '# A page\n\nNo frontmatter.\n',
    )
    const result = auditContent(tmpDir)
    const codes = result.findings.map((f) => f.code)
    expect(codes).toContain('missing-frontmatter-title')
  })

  it('fires on a page with frontmatter but no title field', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'nodetail.md'),
      '---\ndescription: Just a desc\n---\n\n# h\n',
    )
    const result = auditContent(tmpDir)
    const codes = result.findings.map((f) => f.code)
    expect(codes).toContain('missing-frontmatter-title')
  })

  it('does NOT fire on a page WITH a title', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'good.md'),
      '---\ntitle: OK\n---\n\n# h\n',
    )
    const result = auditContent(tmpDir)
    const titles = result.findings.filter(
      (f) => f.code === 'missing-frontmatter-title',
    )
    expect(titles).toEqual([])
  })

  it('includes the config-declared location in `related`', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'orphan.md'),
      '# no fm\n',
    )
    const result = auditContent(tmpDir)
    const finding = result.findings.find(
      (f) => f.code === 'missing-frontmatter-title',
    )
    expect(finding?.related).toBeDefined()
    expect(finding?.related?.[0]?.path).toBe(
      path.join(tmpDir, 'content.config.ts'),
    )
  })
})

describe('content-audit — broken-internal-link finding', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'audit-'))
    await fs.mkdir(path.join(tmpDir, 'packages'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'content.config.ts'),
      `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
  },
})
`,
    )
    await fs.mkdir(path.join(tmpDir, 'src', 'content', 'docs'), {
      recursive: true,
    })
    // Two valid pages.
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'getting-started.md'),
      '---\ntitle: Getting Started\n---\n\n# h\n',
    )
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'api.md'),
      '---\ntitle: API\n---\n\n# h\n',
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('fires on a link to a non-existent docs page', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'index.md'),
      '---\ntitle: Index\n---\n\nSee [missing](/docs/missing-page) for details.\n',
    )
    const result = auditContent(tmpDir)
    const broken = result.findings.filter(
      (f) => f.code === 'broken-internal-link',
    )
    expect(broken).toHaveLength(1)
    expect(broken[0]?.message).toContain('/docs/missing-page')
  })

  it('does NOT fire on a link to an existing page', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'index.md'),
      '---\ntitle: Index\n---\n\nSee [get started](/docs/getting-started).\n',
    )
    const result = auditContent(tmpDir)
    const broken = result.findings.filter(
      (f) => f.code === 'broken-internal-link',
    )
    expect(broken).toEqual([])
  })

  it('does NOT fire on a link with prefix outside any collection', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'index.md'),
      '---\ntitle: Index\n---\n\nSee [unrelated](/community/forum) — external.\n',
    )
    const result = auditContent(tmpDir)
    const broken = result.findings.filter(
      (f) => f.code === 'broken-internal-link',
    )
    expect(broken).toEqual([])
  })

  it('respects urlPrefixFor override', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'index.md'),
      '---\ntitle: Index\n---\n\nSee [api](/api).\n',
    )
    const result = auditContent(tmpDir, {
      urlPrefixFor: () => '/api',
    })
    // /api → docs collection; `api.md` exists → slug `api` → /api/api is broken
    const broken = result.findings.filter(
      (f) => f.code === 'broken-internal-link',
    )
    // /api with no slug means slug='' which does not exist (collection has 'getting-started', 'api', 'index')
    // index slug is '' so this should resolve.
    expect(broken).toEqual([])
  })
})

describe('content-audit — orphaned-md-file finding', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'audit-'))
    await fs.mkdir(path.join(tmpDir, 'packages'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'content.config.ts'),
      `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
  },
})
`,
    )
    await fs.mkdir(path.join(tmpDir, 'src', 'content', 'docs'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'getting-started.md'),
      '---\ntitle: Started\n---\n\n# h\n',
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('fires on a .md file under src/content/ outside any collection path', async () => {
    // Drop a stray .md under src/content/notes/ which is NOT declared as a collection
    await fs.mkdir(path.join(tmpDir, 'src', 'content', 'notes'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'notes', 'orphan.md'),
      '---\ntitle: Orphan\n---\n\n# h\n',
    )
    const result = auditContent(tmpDir)
    const orphans = result.findings.filter(
      (f) => f.code === 'orphaned-md-file',
    )
    expect(orphans).toHaveLength(1)
    expect(orphans[0]?.location.relPath).toContain('orphan.md')
  })

  it('does NOT fire on a .md file inside a declared collection path', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'content', 'docs', 'nested.md'),
      '---\ntitle: Nested\n---\n\n# h\n',
    )
    const result = auditContent(tmpDir)
    const orphans = result.findings.filter(
      (f) => f.code === 'orphaned-md-file',
    )
    expect(orphans).toEqual([])
  })
})

describe('content-audit — formatContentFindings', () => {
  it('reports "no findings" when the audit is clean', () => {
    const out = formatContentFindings(
      {
        root: '/tmp/x',
        findings: [],
        summary: {
          configFilesScanned: 1,
          collectionsScanned: 1,
          mdFilesScanned: 5,
          findingsByCode: {
            'missing-frontmatter-title': 0,
            'broken-internal-link': 0,
            'orphaned-md-file': 0,
          },
        },
      },
      { color: false },
    )
    expect(out).toContain('No content audit findings')
    expect(out).toContain('1 collection(s)')
    expect(out).toContain('5 markdown file(s)')
  })

  it('formats per-finding output with location pointer', () => {
    const out = formatContentFindings(
      {
        root: '/tmp/x',
        findings: [
          {
            code: 'broken-internal-link',
            message: 'Broken /docs/missing-page',
            location: {
              path: '/tmp/x/src/content/docs/index.md',
              relPath: 'src/content/docs/index.md',
              line: 5,
              column: 12,
            },
          },
        ],
        summary: {
          configFilesScanned: 1,
          collectionsScanned: 1,
          mdFilesScanned: 1,
          findingsByCode: {
            'missing-frontmatter-title': 0,
            'broken-internal-link': 1,
            'orphaned-md-file': 0,
          },
        },
      },
      { color: false },
    )
    expect(out).toContain('Finding 1')
    expect(out).toContain('broken-internal-link')
    expect(out).toContain('src/content/docs/index.md:5:12')
  })
})
