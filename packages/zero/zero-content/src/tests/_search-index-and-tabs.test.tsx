/**
 * Search-index chunk emission, and the two Tabs authoring forms.
 *
 * **The base prefix.** A site deployed under a subpath (`/pyreon/`)
 * serves its search chunks from there too. The catalog embeds the URL
 * the runtime fetches, so a missing prefix makes every Cmd+K request 404
 * on the deployed site while working perfectly in dev — the classic
 * subpath bug, and one nobody notices until after a deploy. A DOUBLED
 * slash is the same failure in the other direction, and both come out of
 * the same three-line normalisation.
 *
 * **The size guards.** An index past the error ceiling is a real
 * problem: the runtime downloads the whole chunk before the first query,
 * so a 2MB index means Cmd+K hangs on a slow connection. Failing the
 * build is deliberate; warning at the lower bound is the early signal.
 *
 * **Tabs' two forms.** `items` is programmatic; `labels` + `children` is
 * what an author writes in markdown. The second has to pair each label
 * with the child at the SAME index, and a single child arrives unwrapped
 * rather than as a one-element array — so the non-array case is the
 * common one for a two-tab block where one tab is empty.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { buildSearchIndex, isSearchable, makeSearchDoc } from '../search/index-builder'
import { Tabs } from '../components/Tabs'

const TMP = path.join(process.cwd(), 'src', 'tests', '__index_tmp__')
let root: string

const entry = (slug: string, over: Record<string, unknown> = {}) =>
  ({ slug, title: `T ${slug}`, headings: [], body: 'body', url: `/docs/${slug}`, ...over }) as never

const CONFIG = {
  collections: {
    docs: { type: 'pages', path: 'src/content/docs', schema: {} },
    data: { type: 'data', path: 'src/content/data', schema: {} },
  },
} as never

beforeEach(async () => {
  root = path.join(TMP, `r-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(root, { recursive: true })
})
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

/**
 * `BuildIndexResult.files` maps a collection name (plus `__main__` for
 * the catalog) to the PATH written, not to its content — so the catalog
 * has to be read back off disk, which is also what the deploy does.
 */
const readCatalog = async (): Promise<{ collections: { name: string; url: string }[] }> =>
  JSON.parse(await fs.readFile(path.join(root, 'dist', 'search-index.json'), 'utf8'))

const build = (over: Record<string, unknown> = {}) =>
  buildSearchIndex({
    root,
    outDir: path.join(root, 'dist'),
    config: CONFIG,
    entries: { docs: [entry('a')] },
    ...over,
  } as never)

describe('the catalog URL carries the deploy base prefix', () => {
  it('emits a root-relative URL when there is no base', async () => {
    // The control. Every prefix spec below is worthless against a
    // builder that emits nothing.
    await build()
    const catalog = await readCatalog()
    expect(catalog.collections[0]!.url).toBe('/search-index-docs.json')
  })

  for (const [label, base, expected] of [
    ['a trailing slash', '/pyreon/', '/pyreon/search-index-docs.json'],
    ['no trailing slash', '/pyreon', '/pyreon/search-index-docs.json'],
    ['no leading slash', 'pyreon/', '/pyreon/search-index-docs.json'],
    ['neither slash', 'pyreon', '/pyreon/search-index-docs.json'],
    ['a nested base', '/a/b/', '/a/b/search-index-docs.json'],
  ] as Array<[string, string, string]>) {
    it(`normalises ${label}`, async () => {
      // Every one of these is a real Vite `base` value. A missing prefix
      // 404s on the deployed site while dev is fine; a doubled slash
      // does the same, and both fall out of one normalisation.
      await build({ base })
      const catalog = await readCatalog()
      expect(catalog.collections[0]!.url, label).toBe(expected)
      expect(catalog.collections[0]!.url, label).not.toContain('//')
    })
  }

  for (const base of ['/', '', undefined]) {
    it(`treats ${JSON.stringify(base)} as no prefix`, async () => {
      await build({ base })
      expect((await readCatalog()).collections[0]!.url).toBe('/search-index-docs.json')
    })
  }
})

describe('only searchable, non-empty collections get a chunk', () => {
  it('defaults searchability to the pages type', () => {
    // A `data` collection is structured records, not prose — indexing it
    // fills the palette with rows nobody can navigate to.
    expect(isSearchable({ type: 'pages' } as never)).toBe(true)
    expect(isSearchable({ type: 'data' } as never)).toBe(false)
    expect(isSearchable({ type: 'data', searchable: true } as never)).toBe(true)
    expect(isSearchable({ type: 'pages', searchable: false } as never)).toBe(false)
  })

  it('writes NO catalog at all when nothing was indexed', async () => {
    // Not merely an empty catalog — no file. Which means the runtime
    // fetches a URL that does not exist, and on every SPA host that is a
    // 200 carrying `index.html`. See the runtime spec below: this is why
    // the loader has to explain what actually arrived.
    const r = await build({ entries: {} })
    expect(r.files.__main__, 'no catalog for an empty build').toBeUndefined()
    expect(r.files.docs, 'and no chunk for an empty collection').toBeUndefined()
    await expect(readCatalog()).rejects.toThrow(/ENOENT/)
  })

  it('writes the chunk files to disk, not just to the result', async () => {
    // The result object is what tests see; the deploy reads the files.
    await build()
    const written = await fs.readdir(path.join(root, 'dist'))
    expect(written).toContain('search-index.json')
    expect(written).toContain('search-index-docs.json')
  })
})

describe('an oversized index warns, then fails the build', () => {
  const many = Array.from({ length: 40 }, (_, i) => entry(`p${i}`, { body: 'x'.repeat(200) }))

  it('warns past the soft bound and still emits', async () => {
    // The early signal — the site works, but the first query now pulls a
    // large chunk.
    const r = await build({ entries: { docs: many }, chunkWarnBytes: 100 })
    expect(r.warnings.join(' ')).toContain('docs')
    expect(r.files.docs, 'the chunk is still emitted').toBeTruthy()
  })

  it('THROWS past the hard bound rather than shipping it', async () => {
    // A multi-megabyte index means Cmd+K hangs before the first
    // keystroke does anything. Failing the build is the point.
    await expect(build({ entries: { docs: many }, chunkErrorBytes: 100 }))
      .rejects.toThrow(/docs/)
  })

  it('stays quiet under both bounds', async () => {
    const r = await build()
    expect(r.warnings).toEqual([])
  })
})

describe('a search document carries only the fields the runtime reads', () => {
  it('includes a description when the entry has one', () => {
    expect(makeSearchDoc('docs', entry('a', { description: 'D' })).description).toBe('D')
  })

  it('omits it entirely when absent — every entry pays for an empty key', () => {
    expect('description' in makeSearchDoc('docs', entry('a'))).toBe(false)
  })
})

describe('Tabs pairs each label with the child at its index', () => {
  const render = (node: unknown) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    mount(node as never, host)
    return host
  }

  it('renders the programmatic items form', () => {
    // The control.
    const host = render(<Tabs items={[{ label: 'A', content: 'one' }, { label: 'B', content: 'two' }]} />)
    expect([...host.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['A', 'B'])
  })

  it('pairs labels with an ARRAY of children by index', () => {
    // The markdown authoring form. An off-by-one puts the wrong panel
    // under every tab.
    const host = render(<Tabs labels={['A', 'B']}>{['one', 'two'] as never}</Tabs>)
    expect([...host.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['A', 'B'])
    expect(host.textContent).toContain('one')
  })

  it('accepts a SINGLE child that is not an array', () => {
    // A two-label block where the second tab is empty. JSX hands one
    // child unwrapped; treating it as an array would index into a string.
    const host = render(<Tabs labels={['Only']}>{'solo' as never}</Tabs>)
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1)
    expect(host.textContent).toContain('solo')
  })

  it('renders a label with NO matching child as an empty panel', () => {
    // More labels than children — the author added a tab and has not
    // written it yet. Must not throw or drop the tab.
    const host = render(<Tabs labels={['A', 'B', 'C']}>{['one'] as never}</Tabs>)
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3)
  })

  it('renders nothing rather than throwing with no labels and no items', () => {
    expect(() => render(<Tabs />)).not.toThrow()
  })

  it('clamps an out-of-range initial index', () => {
    // `initial: 5` on a two-tab block would otherwise select nothing and
    // the block renders with no visible panel.
    for (const initial of [-1, 5]) {
      const host = render(
        <Tabs initial={initial} items={[{ label: 'A', content: 'x' }, { label: 'B', content: 'y' }]} />,
      )
      const selected = host.querySelectorAll('[role="tab"][aria-selected="true"]')
      expect(selected.length, String(initial)).toBe(1)
    }
  })
})
