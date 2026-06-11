// @vitest-environment node
/**
 * Phase 6 — SSG page enhancements (pure helpers) + ISR tag invalidation +
 * the filesystem store.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFsStore, createISRHandler } from '../isr'
import {
  extractStylerStyleTag,
  hashCss,
  injectSpeculationRules,
  injectViewTransitions,
} from '../ssg-enhance'

const PAGE = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>'

describe('injectSpeculationRules', () => {
  it('injects a prefetch document-rules block before </head>', () => {
    const out = injectSpeculationRules(PAGE, 'prefetch')
    expect(out).toContain('<script type="speculationrules">')
    expect(out).toContain('"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]')
    expect(out.indexOf('speculationrules')).toBeLessThan(out.indexOf('</head>'))
  })

  it('prerender mode uses the prerender key', () => {
    expect(injectSpeculationRules(PAGE, 'prerender')).toContain('"prerender":[')
  })

  it('no </head> → unchanged (body-only fragments)', () => {
    expect(injectSpeculationRules('<div>x</div>', 'prefetch')).toBe('<div>x</div>')
  })
})

describe('injectViewTransitions', () => {
  it('injects the cross-document opt-in', () => {
    expect(injectViewTransitions(PAGE)).toContain('@view-transition{navigation:auto}')
  })
})

describe('extractStylerStyleTag', () => {
  it('pulls the styler tag out and returns the bare CSS', () => {
    const head = '<style data-pyreon-styler="x">.a{color:red}</style>\n<title>t</title>'
    const out = extractStylerStyleTag(head)
    expect(out).toEqual({ css: '.a{color:red}', head: '<title>t</title>' })
  })

  it('returns null when no styler tag exists', () => {
    expect(extractStylerStyleTag('<title>t</title>')).toBeNull()
  })

  it('does not confuse OTHER style tags with the styler tag', () => {
    const head = '<style>.user{}</style><title>t</title>'
    expect(extractStylerStyleTag(head)).toBeNull()
  })

  it('hashCss is stable + content-sensitive', () => {
    expect(hashCss('.a{}')).toBe(hashCss('.a{}'))
    expect(hashCss('.a{}')).not.toBe(hashCss('.b{}'))
    expect(hashCss('.a{}')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('ISR — revalidateTag', () => {
  function makeHandler(tags: (req: Request) => string[]) {
    let renders = 0
    const handler = createISRHandler(
      async (req: Request) => {
        renders++
        return new Response(`render ${renders} of ${new URL(req.url).pathname}`, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      },
      { revalidate: 3600, tagsForRequest: tags },
    )
    return { handler, renders: () => renders }
  }

  it('drops every entry carrying the tag; untagged entries survive', async () => {
    const { handler, renders } = makeHandler((req) => {
      const p = new URL(req.url).pathname
      return p.startsWith('/posts') ? ['posts'] : []
    })
    await handler(new Request('http://x/posts/1'))
    await handler(new Request('http://x/posts/2'))
    await handler(new Request('http://x/about'))
    expect(renders()).toBe(3)
    // All cached now.
    await handler(new Request('http://x/posts/1'))
    expect(renders()).toBe(3)

    const result = await handler.revalidateTag('posts')
    expect(result.dropped).toBe(2)

    // Tagged entries re-render; untagged stays cached.
    await handler(new Request('http://x/posts/1'))
    await handler(new Request('http://x/about'))
    expect(renders()).toBe(4)
  })

  it('throws a clear error when the store lacks tag support', async () => {
    const handler = createISRHandler(async () => new Response('x'), {
      revalidate: 60,
      store: { get: () => undefined, set: () => {} }, // no setTags/keysByTag
      tagsForRequest: () => ['t'],
    })
    await expect(handler.revalidateTag('t')).rejects.toThrow(/setTags\/keysByTag/)
  })

  it('a throwing tagsForRequest never breaks caching (entry cached untagged)', async () => {
    let renders = 0
    const handler = createISRHandler(
      async () => {
        renders++
        return new Response('ok', { status: 200 })
      },
      {
        revalidate: 3600,
        tagsForRequest: () => {
          throw new Error('boom')
        },
      },
    )
    await handler(new Request('http://x/a'))
    await handler(new Request('http://x/a'))
    expect(renders).toBe(1) // cached despite the tagging throw
  })
})

describe('createFsStore', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('round-trips entries across store instances (restart survival)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-isr-fs-'))
    const a = createFsStore(dir)
    await a.set('/posts/1?x=1', { html: '<p>hi</p>', headers: {}, timestamp: 1 })
    // A NEW instance (fresh process) reads the same entry.
    const b = createFsStore(dir)
    const entry = await b.get('/posts/1?x=1')
    expect(entry).toEqual({ html: '<p>hi</p>', headers: {}, timestamp: 1 })
    await b.delete?.('/posts/1?x=1')
    expect(await b.get('/posts/1?x=1')).toBeUndefined()
  })

  it('tag index persists across instances', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-isr-fs-'))
    const a = createFsStore(dir)
    await a.set('/p/1', { html: 'a', headers: {}, timestamp: 1 })
    await a.setTags?.('/p/1', ['posts'])
    const b = createFsStore(dir)
    expect(await b.keysByTag?.('posts')).toEqual(['/p/1'])
  })

  it('reads against a missing dir degrade to miss, never throw', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-isr-fs-'))
    const store = createFsStore(join(dir, 'never-created'))
    expect(await store.get('/x')).toBeUndefined()
    expect(await store.keysByTag?.('t')).toEqual([])
  })

  it('caches entries with a VERY long key (>255-byte filename) via hashing — no silent ENAMETOOLONG drop', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-isr-fs-'))
    const store = createFsStore(dir)
    // 300-char query string — the encoded filename would exceed NAME_MAX and
    // the pre-fix store silently swallowed the ENAMETOOLONG write.
    const key = `/search?${'q=react&'.repeat(40)}` // ~320 chars
    await store.set(key, { html: '<p>long</p>', headers: {}, timestamp: 7 })
    const back = createFsStore(dir)
    expect(await back.get(key)).toEqual({ html: '<p>long</p>', headers: {}, timestamp: 7 })
  })
})
