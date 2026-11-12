import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import channelGate, { redirectPage } from '../../vite-plugins/channel-gate'
import { channelOf, gateChannels, openChannels, SITE_LINKS, type SiteLinkKey } from '../site-links'

/**
 * The channel rule: while a channel's address is `null`, no page of the site
 * links to it or names it; once the address is set, every link comes back
 * from the content with no code change.
 */
const CLOSED: Record<SiteLinkKey, string | null> = { discord: null, newsletter: null }
const OPEN: Record<SiteLinkKey, string | null> = { discord: 'https://discord.gg/abc123', newsletter: 'https://buttondown.com/pyreon' }

const contentDir = resolve(__dirname, '../site/content')
const blogDir = resolve(__dirname, '../content/blog')

function jsonFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...jsonFiles(full))
    else if (name.endsWith('.json')) out.push(full)
  }
  return out
}

/** Every content file, gated with the given addresses, keyed by its path under content/. */
function gatedContent(links: Record<SiteLinkKey, string | null>): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const file of jsonFiles(contentDir)) {
    const rel = relative(contentDir, file)
    out.set(rel, gateChannels(JSON.parse(readFileSync(file, 'utf8')) as unknown, rel, links))
  }
  return out
}

/** Every `href` value and every Markdown link target in a value. */
function linksIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) linksIn(item, out)
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'href' && typeof value === 'string') out.push(value)
      linksIn(value, out)
    }
  } else if (typeof node === 'string') for (const m of node.matchAll(/\]\(\s*([^)\s]+)/g)) out.push(m[1] as string)
  return out
}

/** Every string a page can print (not `sources`, which are never rendered). */
function textIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) textIn(item, out)
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) if (key !== 'sources' && key !== 'source') textIn(value, out)
  } else if (typeof node === 'string') out.push(node)
  return out
}

// Content that names Discord without meaning the channel: @pyreon/document
// renders to Discord's embed format (product pages, the docs overviews), and
// the redirect pages' own copy (built only while their channel is open).
const NOT_THE_CHANNEL = [/^products\//, /^_docs/, /^_products\.json$/, /^pages\/channels\/(discord|newsletter)\.json$/]
const CHANNEL_WORD = /\b(discord|newsletter)\b/i

describe('the channel rule (gateChannels)', () => {
  it('knows the stable addresses, relative and absolute', () => {
    expect(channelOf('/discord')).toBe('discord')
    expect(channelOf('https://pyreon.dev/newsletter')).toBe('newsletter')
    expect(channelOf('/newsletter/?ref=x')).toBe('newsletter')
    expect(channelOf('/discord#top')).toBe('discord')
    expect(channelOf('/discordant')).toBeUndefined()
    expect(channelOf('/blog')).toBeUndefined()
    expect(channelOf('https://discord.gg/abc')).toBeUndefined()
  })

  it('opens exactly the channels with an address', () => {
    expect(openChannels(CLOSED)).toEqual([])
    expect(openChannels({ discord: 'https://discord.gg/abc123', newsletter: null })).toEqual(['discord'])
    expect(openChannels(OPEN)).toEqual(['discord', 'newsletter'])
  })

  it('drops list items that link a closed channel and keeps them once it opens', () => {
    const data = { links: [{ label: 'GitHub', href: 'https://github.com/pyreon/pyreon' }, { label: 'Discord', href: '/discord' }, { route: '/newsletter' }] }
    expect(gateChannels(data, 't', CLOSED)).toEqual({ links: [{ label: 'GitHub', href: 'https://github.com/pyreon/pyreon' }] })
    expect(gateChannels(data, 't', OPEN)).toEqual(data)
    expect(data.links).toHaveLength(3) // the input is not modified
  })

  it('merges withChannel copy only while the channel is open, and always drops the key', () => {
    const data = { text: 'Open an issue.', withChannel: { discord: { text: 'Ask on Discord.' } } }
    expect(gateChannels(data, 't', CLOSED)).toEqual({ text: 'Open an issue.' })
    expect(gateChannels(data, 't', OPEN)).toEqual({ text: 'Ask on Discord.' })
  })

  it('fails on a closed-channel link it cannot drop, and on an unknown channel', () => {
    expect(() => gateChannels({ cta: { label: 'Join', href: '/discord' } }, 'x.json', CLOSED)).toThrow(/x\.json: \$\.cta\.href links to \/discord/)
    expect(() => gateChannels({ text: 'Say hi on [Discord](https://pyreon.dev/discord).' }, 'x.json', CLOSED)).toThrow(/inside its text/)
    expect(() => gateChannels({ a: 1, withChannel: { slack: { a: 2 } } }, 'x.json', CLOSED)).toThrow(/names no channel/)
    expect(gateChannels({ cta: { label: 'Join', href: '/discord' } }, 'x.json', OPEN)).toEqual({ cta: { label: 'Join', href: '/discord' } })
  })
})

describe('the site content with both channels closed', () => {
  const gated = gatedContent(CLOSED)

  it('links neither /discord nor /newsletter from any page', () => {
    const found: string[] = []
    for (const [file, data] of gated) for (const href of linksIn(data)) if (channelOf(href)) found.push(`${file}: ${href}`)
    expect(found).toEqual([])
  })

  it('lists no /discord or /newsletter row in the sitemap', () => {
    for (const file of ['_sitemap.json', 'pages/_sitemap.json']) {
      const routes = (gated.get(file) as { sections: { pages: { route: string }[] }[] }).sections.flatMap((s) => s.pages.map((p) => p.route))
      expect(routes, file).toContain('/community')
      expect(routes.filter((r) => channelOf(r)), file).toEqual([])
    }
  })

  it('names neither channel in any copy a page prints', () => {
    const found: string[] = []
    for (const [file, data] of gated) {
      if (NOT_THE_CHANNEL.some((re) => re.test(file))) continue
      // The two redirect pages' copy inside _channels.json is not shown while closed.
      const shown = file === '_channels.json' ? { ...(data as Record<string, unknown>), discord: null, newsletter: null } : data
      for (const s of textIn(shown)) if (CHANNEL_WORD.test(s)) found.push(`${file}: ${s}`)
    }
    expect(found).toEqual([])
  })

  it('has no blog post that links or names a closed channel', () => {
    const found: string[] = []
    for (const f of readdirSync(blogDir).filter((n) => n.endsWith('.md'))) {
      const md = readFileSync(join(blogDir, f), 'utf8')
      for (const m of md.matchAll(/\]\(\s*([^)\s]+)/g)) if (channelOf(m[1] as string)) found.push(`${f}: ${m[1]}`)
      for (const line of md.split('\n')) if (CHANNEL_WORD.test(line)) found.push(`${f}: ${line}`)
    }
    expect(found).toEqual([])
  })

  it('is what the committed config ships (both addresses are null today)', () => {
    // When an address is set this test is the one to update: the rule then
    // keeps that channel's links (the next test).
    expect(SITE_LINKS).toEqual(CLOSED)
  })
})

describe('the site content once an address is set', () => {
  it('brings back every link to the channel, and its copy', () => {
    const gated = gatedContent(OPEN)
    const nav = gated.get('_nav.json') as { actions: { kind: string }[]; footer: { columns: { links: { href: string }[] }[] }; mobile: { sheet: { footer: { href: string }[] } } }
    expect(nav.actions.map((a) => a.kind)).toContain('discord')
    const footer = nav.footer.columns.flatMap((c) => c.links.map((l) => l.href))
    expect(footer).toEqual(expect.arrayContaining(['/discord', '/newsletter']))
    expect(nav.mobile.sheet.footer.map((l) => l.href)).toEqual(expect.arrayContaining(['/discord', '/newsletter']))

    const blog = gated.get('pages/channels/blog.json') as { hero: { actions: { href: string }[] }; subscribe: { links: { href: string }[] } }
    expect(blog.hero.actions.map((a) => a.href)).toContain('/newsletter')
    expect(blog.subscribe.links.map((a) => a.href)).toContain('/newsletter')

    const community = gated.get('pages/project/community.json') as { end: { cta: { label: string; href: string } } }
    expect(community.end.cta).toEqual({ label: 'Join the Discord', href: 'https://pyreon.dev/discord' })
    expect(JSON.stringify(community)).toContain('tell us on Discord')

    // Opening only one channel brings back that one.
    const onlyDiscord = gatedContent({ discord: OPEN.discord, newsletter: null })
    const links = linksIn([...onlyDiscord.values()]).map(channelOf)
    expect(links).toContain('discord')
    expect(links).not.toContain('newsletter')
  })
})

describe('the /discord and /newsletter pages', () => {
  /** The files the plugin writes into the client build. */
  function emitted(links: Record<SiteLinkKey, string | null>): Map<string, string> {
    const plugin = channelGate(links)
    const files = new Map<string, string>()
    ;(plugin.configResolved as (c: unknown) => void)({ build: { ssr: false } })
    ;(plugin.generateBundle as (this: unknown) => void).call({
      emitFile: (f: { fileName: string; source: string }) => files.set(f.fileName, f.source),
    })
    return files
  }

  it('are not written while their channel is closed', () => {
    expect([...emitted(CLOSED).keys()]).toEqual([])
  })

  it('are written as static redirects once the address is set', () => {
    const files = emitted({ discord: OPEN.discord, newsletter: null })
    expect([...files.keys()]).toEqual(['discord/index.html'])
    const html = files.get('discord/index.html') as string
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://discord.gg/abc123">')
    expect(html).toContain('<link rel="canonical" href="https://discord.gg/abc123">')
    expect(html).toContain('<meta name="robots" content="noindex">')
    expect(html).toContain('<a href="https://discord.gg/abc123">Continue to the Pyreon Discord</a>')
  })

  it('escape the copy and the address', () => {
    const html = redirectPage(
      { route: '/discord', destination: 'a <b>', meta: { title: 'T & co', description: '"d"' }, redirect: { title: 'To {destination}', text: 'x', cta: 'Go' } },
      'https://example.com/?a=1&b=</script>',
    )
    expect(html).toContain('<h1>To a &lt;b&gt;</h1>')
    expect(html).toContain('<title>T &amp; co</title>')
    expect(html).toContain('content="0; url=https://example.com/?a=1&amp;b=&lt;/script&gt;"')
    expect(html).not.toContain('b=</script>')
  })

  it('are written by no server (SSR) build', () => {
    const plugin = channelGate(OPEN)
    const files: string[] = []
    ;(plugin.configResolved as (c: unknown) => void)({ build: { ssr: true } })
    ;(plugin.generateBundle as (this: unknown) => void).call({ emitFile: (f: { fileName: string }) => files.push(f.fileName) })
    expect(files).toEqual([])
  })
})
