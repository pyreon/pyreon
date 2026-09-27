// @vitest-environment node
// Node env: happy-dom's Headers hide `set-cookie` (a browser-forbidden
// response header), and the preview cookie is minted server-side.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _setRegistry, getCollection } from '../runtime'

const entry = (slug: string, frontmatter: Record<string, unknown> = {}) =>
  async () => ({ slug, frontmatter: { title: slug, ...frontmatter }, headings: [], default: () => null })

afterEach(() => {
  _setRegistry({})
  vi.unstubAllEnvs()
})

describe('preview mode includes drafts in production (getCollection({ request }))', () => {
  const SECRET = 's'.repeat(32)
  const seed = () => _setRegistry({
    docs: { loaders: { published: entry('published'), wip: entry('wip', { draft: true }) } } as never,
  })
  async function previewRequest(valid: boolean): Promise<Request> {
    const { createPreviewHandler, previewMiddleware } = await import('@pyreon/zero/preview')
    const enable = await createPreviewHandler({ secret: SECRET, token: 't'.repeat(32) })({
      req: new Request('https://x.test/api/preview?token=' + 't'.repeat(32)),
      url: new URL('https://x.test/api/preview?token=' + 't'.repeat(32)),
      path: '/api/preview', headers: new Headers(), locals: {},
    }) as Response
    const cookie = enable.headers.getSetCookie()[0]!.split(';')[0]!
    const req = new Request('https://x.test/blog', { headers: { cookie: valid ? cookie : `${cookie}x` } })
    await previewMiddleware({ secret: SECRET })({ req, url: new URL(req.url), path: '/blog', headers: new Headers(), locals: {} })
    return req
  }

  it('a VERIFIED preview request sees drafts; a forged one does not', async () => {
    seed()
    vi.stubEnv('NODE_ENV', 'production')
    expect((await getCollection('docs', { request: await previewRequest(true) })).map((e) => e.slug))
      .toEqual(['published', 'wip'])
    expect((await getCollection('docs', { request: await previewRequest(false) })).map((e) => e.slug))
      .toEqual(['published'])
    // An explicit includeDrafts: false still wins over preview.
    expect((await getCollection('docs', { request: await previewRequest(true), includeDrafts: false })).map((e) => e.slug))
      .toEqual(['published'])
    vi.unstubAllEnvs()
  })
})
