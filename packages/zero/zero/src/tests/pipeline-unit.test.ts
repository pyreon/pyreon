/**
 * `pipeline.ts` helpers the end-to-end `request-pipeline.test.ts` does not
 * reach through `createServer`: the non-GET page answer the dev server uses,
 * the first-Response-wins runner, and the endpoint classifier.
 */
import type { MiddlewareContext } from '@pyreon/server'
import { describe, expect, it } from 'vitest'
import {
  createRequestPipeline,
  matchPattern,
  pageMethodResponse,
  runRequestPipeline,
  trimTrailingSlashes,
} from '../pipeline'

const ctx = (url: string) =>
  ({ req: new Request(url), url: new URL(url), locals: {}, headers: new Headers() }) as unknown as MiddlewareContext

describe('pageMethodResponse', () => {
  it('leaves GET and HEAD to the page renderer', () => {
    expect(pageMethodResponse('GET')).toBeUndefined()
    expect(pageMethodResponse('HEAD')).toBeUndefined()
  })

  it('answers OPTIONS 204 and any other method 405, both with Allow', () => {
    const options = pageMethodResponse('OPTIONS')!
    expect(options.status).toBe(204)
    expect(options.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
    const post = pageMethodResponse('POST')!
    expect(post.status).toBe(405)
    expect(post.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
  })
})

describe('runRequestPipeline', () => {
  it('stops at the first middleware that returns a Response', async () => {
    const seen: string[] = []
    const pipeline = {
      middleware: [
        () => {
          seen.push('a')
        },
        () => {
          seen.push('b')
          return new Response('b')
        },
        () => {
          seen.push('c')
          return new Response('c')
        },
      ],
      isEndpoint: () => false,
    }
    const res = await runRequestPipeline(pipeline, ctx('http://h/'))
    expect(await res!.text()).toBe('b')
    expect(seen).toEqual(['a', 'b'])
  })

  it('is undefined when nothing answers', async () => {
    expect(await runRequestPipeline({ middleware: [() => undefined], isEndpoint: () => false }, ctx('http://h/'))).toBeUndefined()
  })
})

describe('createRequestPipeline', () => {
  it('classifies framework and API paths as endpoints, pages as not', () => {
    const { isEndpoint } = createRequestPipeline({
      routes: [],
      config: {},
      apiRoutes: [{ pattern: '/api/posts/:id', module: {} } as never],
    })
    expect(isEndpoint('/_pyreon/data')).toBe(true)
    expect(isEndpoint('/_zero/actions/x')).toBe(true)
    expect(isEndpoint('/api/posts/1')).toBe(true)
    expect(isEndpoint('/posts/1')).toBe(false)
  })

  it('mounts no action middleware with actions: false', () => {
    const on = createRequestPipeline({ routes: [], config: {} })
    const off = createRequestPipeline({ routes: [], config: {}, actions: false })
    expect(on.middleware.length - off.middleware.length).toBe(2)
  })
})

describe('trimTrailingSlashes / matchPattern', () => {
  it('strips every trailing slash and nothing else', () => {
    expect(trimTrailingSlashes('/docs///')).toBe('/docs')
    expect(trimTrailingSlashes('///')).toBe('')
    expect(trimTrailingSlashes('/a/b')).toBe('/a/b')
  })

  it('matches static, :param and :param* segments', () => {
    expect(matchPattern('/users/:id', '/users/1')).toBe(true)
    expect(matchPattern('/users/:id', '/users/1/edit')).toBe(false)
    expect(matchPattern('/users/:id', '/users')).toBe(false)
    expect(matchPattern('/docs/:rest*', '/docs/a/b')).toBe(true)
    expect(matchPattern('/docs/:rest*', '/other/a')).toBe(false)
  })
})
