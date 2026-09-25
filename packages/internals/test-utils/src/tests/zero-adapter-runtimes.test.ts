import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  renderProblems,
  runtimeProblems,
  vercelOutputProblems,
} from '../../../../../scripts/zero-adapter-runtimes'

const EOL = { runtimes: { 'nodejs20.x': '2026-04-30', 'nodejs22.x': '2027-04-30' } }
const TODAY = new Date('2026-09-24')

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function vercelTree(opts: { runtime?: string; routes?: unknown[]; handler?: boolean } = {}): string {
  const out = mkdtempSync(join(tmpdir(), 'vercel-out-'))
  dirs.push(out)
  const fn = join(out, 'functions', 'ssr.func')
  mkdirSync(fn, { recursive: true })
  mkdirSync(join(out, 'static'), { recursive: true })
  if (opts.handler !== false) writeFileSync(join(fn, 'index.js'), 'export default () => {}')
  writeFileSync(
    join(fn, '.vc-config.json'),
    JSON.stringify({ runtime: opts.runtime ?? 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs' }),
  )
  writeFileSync(
    join(out, 'config.json'),
    JSON.stringify({
      version: 3,
      routes: opts.routes ?? [{ src: '/assets/(.*)', headers: { 'Cache-Control': 'x' } }, { src: '/(.*)', dest: '/ssr' }],
    }),
  )
  return out
}

describe('zero-adapter-runtimes — runtime end of life', () => {
  it('flags a past-EOL runtime and an unknown one', () => {
    expect(runtimeProblems('nodejs20.x', EOL, TODAY)).toEqual(['runtime "nodejs20.x" reached end of life on 2026-04-30'])
    expect(runtimeProblems('nodejs22.x', EOL, TODAY)).toEqual([])
    expect(runtimeProblems('nodejs99.x', EOL, TODAY)[0]).toContain('not in scripts/runtime-eol.json')
  })
})

describe('zero-adapter-runtimes — Vercel Build Output API v3', () => {
  it('accepts a well-formed tree', () => {
    expect(vercelOutputProblems(vercelTree(), EOL, TODAY)).toEqual([])
  })

  it('rejects an EOL runtime, a missing handler, and a dest with no function', () => {
    expect(vercelOutputProblems(vercelTree({ runtime: 'nodejs20.x' }), EOL, TODAY).join()).toContain('end of life')
    expect(vercelOutputProblems(vercelTree({ handler: false }), EOL, TODAY).join()).toContain('does not exist')
    const p = vercelOutputProblems(vercelTree({ routes: [{ src: '/(.*)', dest: '/api' }] }), EOL, TODAY)
    expect(p.join()).toContain('route dest "/api" has no function')
  })

  it('rejects unknown route keys and invalid regexes', () => {
    const p = vercelOutputProblems(vercelTree({ routes: [{ src: '(', destination: '/ssr' }] }), EOL, TODAY)
    expect(p.join()).toContain('not a valid regex')
    expect(p.join()).toContain('unknown key "destination"')
  })
})

describe('zero-adapter-runtimes — render assertions', () => {
  it('reports every failing render check', () => {
    expect(renderProblems(500, '<!--pyreon-app-->')).toEqual([
      'status200',
      'routerView',
      'loaderData',
      'noUnfilledShell',
      'hashedClientEntry',
    ])
  })
})
