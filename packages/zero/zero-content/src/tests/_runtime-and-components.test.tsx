/**
 * `getCollection()` and the two docs components with optional slots.
 *
 * **Draft filtering is the one with consequences.** A `draft: true` page
 * is staged in source and must not reach a public deploy — but it MUST
 * be visible in dev, or authors cannot preview their own work. That
 * makes the default environment-dependent, which is exactly the kind of
 * rule that gets inverted without anyone noticing: in dev the drafts
 * show either way, and the leak only appears on the deployed site.
 *
 * **An unknown collection** must say what IS available. A bare
 * "collection not defined" leaves the author unable to tell a typo from
 * a config that never loaded — two very different fixes.
 *
 * **`<APICard>`'s optional slots** each render a wrapper element. An
 * unguarded slot emits an empty `<pre>` or `<p>` on every card that
 * omits it, which is invisible in the markup and visible as a gap on
 * the page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { APICard } from '../components/APICard'
import { CodeBlock } from '../components/CodeBlock'
import { _setRegistry, getCollection } from '../runtime'

const render = (node: unknown) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const unmount = mount(node as never, host) as unknown as () => void
  return { host, unmount }
}

// A loaded page module: `frontmatter` is what becomes `entry.data`, so
// a fixture that sets `data` directly leaves it undefined and every
// draft filter throws rather than filtering.
const entry = (slug: string, frontmatter: Record<string, unknown> = {}) =>
  async () => ({
    slug,
    frontmatter: { title: slug, ...frontmatter },
    headings: [],
    default: () => null,
  })

afterEach(() => {
  _setRegistry({})
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('an unknown collection names what IS available', () => {
  it('lists the registered collections in the message', async () => {
    // A bare "not defined" cannot distinguish a typo from a config that
    // never loaded — different fixes entirely.
    _setRegistry({
      docs: { loaders: {} } as never,
      blog: { loaders: {} } as never,
    })
    await expect(getCollection('dcos')).rejects.toThrow(/blog, docs/)
  })

  it('says "(none)" rather than trailing off when nothing is registered', async () => {
    // The no-config case, which is the likeliest cause of this error.
    _setRegistry({})
    await expect(getCollection('docs')).rejects.toThrow(/\(none\)/)
  })
})

describe('drafts are hidden in production and shown in dev', () => {
  const seed = () => _setRegistry({
    docs: { loaders: {
      published: entry('published'),
      wip: entry('wip', { draft: true }),
    } } as never,
  })

  it('SHOWS drafts by default in development', async () => {
    // An author previewing their own work-in-progress. Hiding it makes
    // the file appear not to exist.
    seed()
    vi.stubEnv('NODE_ENV', 'development')
    expect((await getCollection('docs')).map((e) => e.slug)).toEqual(['published', 'wip'])
    vi.unstubAllEnvs()
  })

  it('HIDES drafts by default in production', async () => {
    // The leak this exists to prevent — and one only visible on the
    // deployed site, since dev shows them either way.
    seed()
    vi.stubEnv('NODE_ENV', 'production')
    expect((await getCollection('docs')).map((e) => e.slug)).toEqual(['published'])
    vi.unstubAllEnvs()
  })

  it('honours an EXPLICIT includeDrafts over the environment', async () => {
    // A preview deploy that wants them. The explicit option must win in
    // both directions.
    seed()
    vi.stubEnv('NODE_ENV', 'production')
    expect((await getCollection('docs', { includeDrafts: true })).map((e) => e.slug))
      .toEqual(['published', 'wip'])
    vi.stubEnv('NODE_ENV', 'development')
    expect((await getCollection('docs', { includeDrafts: false })).map((e) => e.slug))
      .toEqual(['published'])
    vi.unstubAllEnvs()
  })

  it('applies a caller filter on top', async () => {
    seed()
    const out = await getCollection('docs', {
      includeDrafts: true,
      filter: (e) => e.slug === 'wip',
    })
    expect(out.map((e) => e.slug)).toEqual(['wip'])
  })

  it('returns entries sorted by slug, so output is stable', async () => {
    // A collection page rendered from this list would otherwise reorder
    // between builds.
    _setRegistry({
      docs: { loaders: { zeta: entry('zeta'), alpha: entry('alpha'), mid: entry('mid') } } as never,
    })
    expect((await getCollection('docs')).map((e) => e.slug)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('returns an empty array for a registered but empty collection', async () => {
    _setRegistry({ docs: { loaders: {} } as never })
    expect(await getCollection('docs')).toEqual([])
  })
})

describe('<APICard> renders each optional slot only when given', () => {
  it('renders every slot when all are supplied', () => {
    // The control.
    const { host } = render(
      <APICard
        name="signal"
        stability="stable"
        since="0.4"
        signature="signal<T>(v: T)"
        summary="Creates a signal."
      >
        <p>body</p>
      </APICard>,
    )
    expect(host.querySelector('.pyreon-apicard__since')?.textContent).toContain('0.4')
    expect(host.querySelector('.pyreon-apicard__signature')?.textContent).toContain('signal<T>')
    expect(host.querySelector('.pyreon-apicard__summary')?.textContent).toBe('Creates a signal.')
    expect(host.querySelector('.pyreon-apicard__body')?.textContent).toContain('body')
  })

  it('omits each wrapper when its slot is absent', () => {
    // An empty `<pre>` or `<p>` is invisible in the markup and visible
    // as a gap on the page.
    const { host } = render(<APICard name="signal" />)
    expect(host.querySelector('.pyreon-apicard__since')).toBeNull()
    expect(host.querySelector('.pyreon-apicard__signature')).toBeNull()
    expect(host.querySelector('.pyreon-apicard__summary')).toBeNull()
    expect(host.querySelector('.pyreon-apicard__body')).toBeNull()
    expect(host.textContent).toContain('signal')
  })

  it('marks the stability level as a modifier class', () => {
    // The class is what the stylesheet colours; the text alone would
    // render every level identically.
    const { host } = render(<APICard name="x" stability="experimental" />)
    expect(host.querySelector('.pyreon-apicard__stability--experimental')).toBeTruthy()
  })
})

describe('<CodeBlock> copy behaviour', () => {
  it('clears its reset timer on unmount', async () => {
    // Navigating away within 2s of a copy otherwise leaves a pending
    // timeout firing against a disposed signal — leak class I.
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const { host, unmount } = render(<CodeBlock source="const a = 1" lang="ts" />)
    const button = host.querySelector<HTMLElement>('button')
    button?.click()
    await new Promise<void>((r) => setTimeout(r, 20))
    unmount()

    expect(writeText, 'the copy path must actually run').toHaveBeenCalledWith('const a = 1')
    expect(clearSpy, 'the pending reset must be cleared').toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does nothing when there is no clipboard', async () => {
    // A non-secure context, or an old browser. A throw here happens on
    // a click and surfaces as a broken page.
    vi.stubGlobal('navigator', {})
    const { host } = render(<CodeBlock source="x" lang="ts" />)
    expect(() => host.querySelector<HTMLElement>('button')?.click()).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('does nothing when the source is not a string', async () => {
    // `clipboard.writeText(undefined)` writes the literal "undefined".
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { host } = render(<CodeBlock source={undefined as never} lang="ts" />)
    host.querySelector<HTMLElement>('button')?.click()
    await new Promise<void>((r) => setTimeout(r, 20))
    expect(writeText).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('emits the highlight attribute only when there are lines', () => {
    // An empty `data-highlight=""` matches a CSS attribute selector and
    // highlights nothing visibly — or everything, depending on the rule.
    const { host: withLines } = render(
      <CodeBlock source="a\nb\nc" lang="ts" highlightLines={[1, 3]} />,
    )
    expect(withLines.innerHTML).toContain('1,3')
    const { host: without } = render(<CodeBlock source="a" lang="ts" />)
    expect(without.innerHTML).not.toContain('data-highlight=""')
  })
})
