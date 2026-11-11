/**
 * #4259 — no prerendered route may be written under a top-level name the
 * build or the deploy adapter owns in the output dir. The real-build proof is
 * `integration/reserved-route-names.test.ts`; this file pins the rule for
 * every adapter, format and mode without a Vite build.
 */
import { join } from 'node:path'
import { bunAdapter } from '../adapters/bun'
import { cloudflareAdapter } from '../adapters/cloudflare'
import {
  ADAPTER_RESERVED_OUTPUTS,
  CLOUDFLARE_ADAPTER_OUTPUT,
  DENO_ADAPTER_OUTPUT,
  HYBRID_BUILD_OUTPUTS,
  NETLIFY_ADAPTER_OUTPUT,
  NODE_ADAPTER_OUTPUT,
} from '../adapters/contract'
import { denoAdapter } from '../adapters/deno'
import { netlifyAdapter } from '../adapters/netlify'
import { nodeAdapter } from '../adapters/node'
import { staticAdapter } from '../adapters/static'
import { vercelAdapter } from '../adapters/vercel'
import { _internal } from '../ssg-plugin'

const DIST = join('/app', 'dist')
const { findReservedOutputCollisions, assertNoReservedOutputCollisions } = _internal

describe('findReservedOutputCollisions', () => {
  it('flags a route at or under a reserved name, in directory form', () => {
    const hits = findReservedOutputCollisions(DIST, ['/', '/server', '/server/x', '/servers'], 'directory', ['server'])
    expect(hits).toEqual([
      { path: '/server', target: 'server/index.html', name: 'server' },
      { path: '/server/x', target: 'server/x/index.html', name: 'server' },
    ])
  })

  it("is format-aware: 'file' writes server.html, which nothing owns; 'both' still collides", () => {
    expect(findReservedOutputCollisions(DIST, ['/server'], 'file', ['server'])).toEqual([])
    expect(findReservedOutputCollisions(DIST, ['/server'], 'both', ['server']).map((c) => c.target)).toEqual([
      'server/index.html',
    ])
    expect(findReservedOutputCollisions(DIST, ['/client/a.html'], 'file', ['client'])).toHaveLength(1)
  })

  it('compares case-insensitively (macOS and Windows merge Server/ and server/)', () => {
    expect(findReservedOutputCollisions(DIST, ['/Server'], 'directory', ['server'])[0]?.name).toBe('server')
  })

  it('never reserves the root page (index.html is the shell; #4265 owns that case)', () => {
    expect(findReservedOutputCollisions(DIST, ['/'], 'directory', [...HYBRID_BUILD_OUTPUTS, 'index.html'])).toEqual(
      [{ path: '/', target: 'index.html', name: 'index.html' }],
    )
    expect(findReservedOutputCollisions(DIST, ['/'], 'directory', HYBRID_BUILD_OUTPUTS)).toEqual([])
  })
})

describe('assertNoReservedOutputCollisions', () => {
  const run = (paths: string[], hybrid: boolean, adapter: Parameters<typeof assertNoReservedOutputCollisions>[4]) =>
    () => assertNoReservedOutputCollisions(DIST, paths, 'directory', hybrid, adapter)

  it("a hybrid build reserves zero's own outputs whatever the adapter", () => {
    for (const name of ['server', 'server-edge', '.zero-ssg-server', '.vite']) {
      expect(run([`/${name}`], true, staticAdapter()), name).toThrow(`under "${name}"`)
    }
  })

  it.each([
    ['node', nodeAdapter(), ['client', 'index.js', 'package.json']],
    ['bun', bunAdapter(), ['client', 'index.ts']],
    ['deno', denoAdapter(), ['client', 'main.js']],
    ['netlify', netlifyAdapter(), ['publish', 'netlify', 'netlify.toml']],
    ['cloudflare', cloudflareAdapter(), ['_server', '_worker.js', '_routes.json']],
  ] as const)('a hybrid build under the %s adapter reserves its staged names', (name, adapter, names) => {
    for (const n of names) {
      expect(run([`/${n}`], true, adapter), n).toThrow(`(the ${name} adapter's deploy output)`)
    }
  })

  it('vercel and static stage nothing inside the output dir', () => {
    expect(vercelAdapter().reservedOutputs).toBeUndefined()
    expect(staticAdapter().reservedOutputs).toBeUndefined()
    expect(run(['/client', '/publish', '/_server'], true, vercelAdapter())).not.toThrow()
  })

  it('a custom adapter declares its own names', () => {
    expect(run(['/out'], true, { name: 'mine', reservedOutputs: ['out'] })).toThrow(
      `(the mine adapter's deploy output)`,
    )
  })

  it('a pure SSG build has no server bundle, so only the renderer dir is reserved', () => {
    expect(run(['/server', '/client'], false, nodeAdapter())).not.toThrow()
    expect(run(['/.zero-ssg-server'], false, nodeAdapter())).toThrow('the prerender renderer')
  })

  it('names every colliding route, the file it would write and how to fix it', () => {
    expect(run(['/', '/server', '/client/about'], true, nodeAdapter())).toThrow(
      /^\[Pyreon\] 2 prerendered route\(s\).*'\/server' → dist\/server\/index\.html is under "server" \(the SSR server bundle\).*'\/client\/about' → dist\/client\/about\/index\.html is under "client" \(the node adapter's deploy output\).*Rename the route.*renderMode 'ssr'/s,
    )
  })
})

describe('the reserved lists follow the adapter output contract', () => {
  it('derive from the same constants the adapters stage with', () => {
    expect(ADAPTER_RESERVED_OUTPUTS.node).toContain(NODE_ADAPTER_OUTPUT.clientDir)
    expect(ADAPTER_RESERVED_OUTPUTS.node).toContain(NODE_ADAPTER_OUTPUT.runnerEntry)
    expect(ADAPTER_RESERVED_OUTPUTS.deno).toContain(DENO_ADAPTER_OUTPUT.serverDir)
    expect(ADAPTER_RESERVED_OUTPUTS.netlify).toContain(NETLIFY_ADAPTER_OUTPUT.publishDir)
    expect(ADAPTER_RESERVED_OUTPUTS.netlify).toContain(NETLIFY_ADAPTER_OUTPUT.functionsDir.split('/')[0])
    expect(ADAPTER_RESERVED_OUTPUTS.cloudflare).toContain(CLOUDFLARE_ADAPTER_OUTPUT.workerFile)
    expect(nodeAdapter().reservedOutputs).toBe(ADAPTER_RESERVED_OUTPUTS.node)
  })
})
