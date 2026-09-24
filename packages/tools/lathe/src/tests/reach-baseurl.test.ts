/**
 * Which operations lathe reports as reaching native.
 *
 * PMTC bakes the request URL at COMPILE time, so an operation whose base
 * URL is relative — or missing entirely — cannot lower however simple
 * the endpoint is. Reporting it as native tells the author their client
 * runs on iOS, and they find out otherwise at a build failure with no
 * line pointing back at the spec.
 *
 * The reason is the actionable half. "web-only" alone leaves the author
 * looking at the operation; naming the baseUrl points them at the one
 * config value that changes the answer for every operation at once.
 */
import { describe, expect, it } from 'vitest'
import { generate } from '../core/generate'

const SPEC = (servers?: unknown[]) => JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  ...(servers ? { servers } : {}),
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } },
      },
    },
  },
})

const reachOf = (spec: string, config: Record<string, unknown> = {}) => {
  const out = generate(spec, {
    input: 'spec.json', output: 'out', target: 'multiplatform',
    plugins: ['types', 'client'], ...config,
  } as never)
  return out.reach?.get('listUsers')
}

describe('a relative or missing baseUrl makes every operation web-only', () => {
  it('reports web-only with NO server, naming the cause', () => {
    // The author has to learn it is the baseUrl and not the operation —
    // one config value changes the answer for all of them at once.
    const r = reachOf(SPEC())
    expect(r?.reach).toBe('web-only')
    expect(r?.reason).toContain('baseUrl')
    expect(r?.reason, 'and why it matters').toMatch(/compile time|absolute/)
  })

  it('reports web-only for a RELATIVE server url', () => {
    // `/api` is a legal OpenAPI server. It just cannot be baked.
    const r = reachOf(SPEC([{ url: '/api' }]))
    expect(r?.reach).toBe('web-only')
    expect(r?.reason).toContain('/api')
  })

  it('reports NATIVE reach for an absolute one', () => {
    // The control. Without it every web-only assertion above passes
    // against an analysis that never reports native.
    expect(reachOf(SPEC([{ url: 'https://api.example.com' }]))?.reach).not.toBe('web-only')
  })

  it('lets a CONFIG baseUrl rescue a spec with no server', () => {
    // The documented override. Reporting web-only anyway would tell the
    // author the fix they just applied did not work.
    const r = reachOf(SPEC(), { baseUrl: 'https://api.example.com' })
    expect(r?.reach).not.toBe('web-only')
  })

  it('lets a config baseUrl OVERRIDE an absolute spec server', () => {
    // The reach analysis and the emitted client must agree on which URL
    // is baked; disagreeing puts two answers on one page.
    expect(reachOf(SPEC([{ url: 'https://spec.example.com' }]), {
      baseUrl: 'ftp://not-http',
    })?.reach).toBe('web-only')
  })
})
