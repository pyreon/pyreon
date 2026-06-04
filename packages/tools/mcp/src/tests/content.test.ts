/**
 * @pyreon/mcp — content tool tests
 *
 * Synthetic fixtures cover the `get_content_collection` and
 * `get_content_entry` functions. Each test sets up its own tmp dir
 * with a `content.config.ts` + a content tree, runs the lookup, and
 * asserts the returned shape.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getContentCollection,
  getContentCollections,
  getContentEntry,
} from '../content'

const TMP_ROOT = path.join(
  process.cwd(),
  'src',
  'tests',
  '__content_tmp__',
)

async function setupProject(tmpDir: string) {
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
}

async function writeMd(tmpDir: string, slug: string, body: string) {
  const abs = path.join(tmpDir, 'src', 'content', 'docs', `${slug}.md`)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, body, 'utf8')
}

describe('mcp/content — getContentCollections', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'content-'))
    await setupProject(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('lists the declared collections', async () => {
    await writeMd(tmpDir, 'getting-started', '---\ntitle: Started\n---\n\n# h\n')
    await writeMd(tmpDir, 'api', '---\ntitle: API\n---\n\n# h\n')
    const all = getContentCollections(tmpDir)
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('docs')
    expect(all[0]?.type).toBe('pages')
    expect(all[0]?.entries).toHaveLength(2)
    expect(all[0]?.entries.map((e) => e.slug).sort()).toEqual([
      'api',
      'getting-started',
    ])
  })

  it('returns titles per entry', async () => {
    await writeMd(tmpDir, 'getting-started', '---\ntitle: Start Here\n---\n\n# h\n')
    const all = getContentCollections(tmpDir)
    expect(all[0]?.entries[0]?.title).toBe('Start Here')
  })

  it('returns null title when frontmatter is missing', async () => {
    await writeMd(tmpDir, 'no-fm', '# no frontmatter\n')
    const all = getContentCollections(tmpDir)
    expect(all[0]?.entries[0]?.title).toBeNull()
  })

  it('returns an empty list when no content.config exists', async () => {
    const empty = path.join(tmpDir, 'empty')
    await fs.mkdir(empty, { recursive: true })
    expect(getContentCollections(empty)).toEqual([])
  })

  it('sorts entries by slug for stable agent output', async () => {
    await writeMd(tmpDir, 'zebra', '---\ntitle: Z\n---\n\n# h\n')
    await writeMd(tmpDir, 'alpha', '---\ntitle: A\n---\n\n# h\n')
    await writeMd(tmpDir, 'mango', '---\ntitle: M\n---\n\n# h\n')
    const all = getContentCollections(tmpDir)
    const slugs = all[0]?.entries.map((e) => e.slug)
    expect(slugs).toEqual(['alpha', 'mango', 'zebra'])
  })
})

describe('mcp/content — getContentCollection (single by name)', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'content-'))
    await setupProject(tmpDir)
    await writeMd(tmpDir, 'getting-started', '---\ntitle: Start\n---\n\n# h\n')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns the requested collection', () => {
    const c = getContentCollection(tmpDir, 'docs')
    expect(c?.name).toBe('docs')
    expect(c?.entries[0]?.slug).toBe('getting-started')
  })

  it('returns null for an unknown collection name', () => {
    expect(getContentCollection(tmpDir, 'nope')).toBeNull()
  })
})

describe('mcp/content — getContentEntry', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(TMP_ROOT, 'content-'))
    await setupProject(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns frontmatter + headings for an existing entry', async () => {
    await writeMd(
      tmpDir,
      'getting-started',
      `---
title: Getting Started
description: Install + run
sidebar:
  order: 1
---

# Top H1

## Section 1

text

### Subsection

more text

## Section 2

end
`,
    )
    const e = getContentEntry(tmpDir, 'docs', 'getting-started')
    expect(e?.title).toBe('Getting Started')
    expect(e?.frontmatter.title).toBe('Getting Started')
    expect(e?.frontmatter.description).toBe('Install + run')
    expect(e?.headings).toEqual([
      { level: 1, text: 'Top H1' },
      { level: 2, text: 'Section 1' },
      { level: 3, text: 'Subsection' },
      { level: 2, text: 'Section 2' },
    ])
    expect(e?.bytes).toBeGreaterThan(0)
  })

  it('returns null for an unknown slug', async () => {
    await writeMd(tmpDir, 'real', '---\ntitle: Real\n---\n\n# h\n')
    expect(getContentEntry(tmpDir, 'docs', 'fake')).toBeNull()
  })

  it('returns null for an unknown collection', async () => {
    expect(getContentEntry(tmpDir, 'unknown', 'x')).toBeNull()
  })

  it('skips fenced code-block heading-shaped lines', async () => {
    await writeMd(
      tmpDir,
      'page',
      `---
title: P
---

# Real H1

\`\`\`md
## Fake H2 in code
\`\`\`

## Real H2
`,
    )
    const e = getContentEntry(tmpDir, 'docs', 'page')
    expect(e?.headings).toEqual([
      { level: 1, text: 'Real H1' },
      { level: 2, text: 'Real H2' },
    ])
  })

  it('strips quoted frontmatter values', async () => {
    await writeMd(
      tmpDir,
      'page',
      `---
title: "@pyreon/sized-map"
description: 'Single quoted'
---

# h
`,
    )
    const e = getContentEntry(tmpDir, 'docs', 'page')
    expect(e?.frontmatter.title).toBe('@pyreon/sized-map')
    expect(e?.frontmatter.description).toBe('Single quoted')
  })

  it('handles an entry whose path is "" (index.md)', async () => {
    await writeMd(tmpDir, 'index', '---\ntitle: Home\n---\n\n# h\n')
    const e = getContentEntry(tmpDir, 'docs', '')
    expect(e?.title).toBe('Home')
    expect(e?.slug).toBe('')
  })
})
