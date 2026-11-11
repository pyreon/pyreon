import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildServerReport,
  DEV_OVERLAY_SCRIPT_SRC,
  devOverlayModulePath,
  devOverlayModuleSource,
  loaderErrorRoute,
  renderErrorOverlay,
} from '../error-overlay'

let root: string
let file: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'zero-overlay-'))
  mkdirSync(join(root, 'src/routes'), { recursive: true })
  file = join(root, 'src/routes/account.tsx')
  writeFileSync(
    file,
    [
      "import { useLoaderData } from '@pyreon/router'",
      '',
      'export async function loader() {',
      '  const account = await fetchAccount()',
      '  return { name: account.profile.name }',
      '}',
      '',
      'export default function Account() {',
      '  return <h1>{useLoaderData().name}</h1>',
      '}',
    ].join('\n'),
  )
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function errorAt(message: string, line: number, column: number): Error {
  const e = new TypeError(message)
  e.stack = [
    `TypeError: ${message}`,
    `    at loader (${file}:${line}:${column})`,
    `    at preload (${root}/node_modules/@pyreon/router/lib/index.js:120:7)`,
    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
  ].join('\n')
  return e
}

describe('buildServerReport', () => {
  it('points at the first app frame and reads the code frame from disk', () => {
    const r = buildServerReport(errorAt("Cannot read properties of undefined (reading 'name')", 5, 34), {
      root,
      url: '/account?tab=1',
      kind: 'render',
      route: '/account',
    })
    expect(r.location).toEqual({ file, display: 'src/routes/account.tsx', line: 5, column: 34 })
    expect(r.frame?.lines.map((l) => l.number)).toEqual([2, 3, 4, 5, 6, 7])
    expect(r.frame?.lines.find((l) => l.highlight)?.text).toBe('  return { name: account.profile.name }')
    expect(r.frame?.caret).toBe(34)
    expect(r.route).toBe('/account')
    expect(r.url).toBe('/account?tab=1')
  })

  it('dims library frames and names their package', () => {
    const r = buildServerReport(errorAt('boom', 5, 3), { root })
    expect(r.stack.map((f) => [f.fn, f.library, f.where])).toEqual([
      ['loader', false, 'src/routes/account.tsx:5:3'],
      ['preload', true, '@pyreon/router'],
      ['process.processTicksAndRejections', true, 'node:internal/process/task_queues'],
    ])
  })

  it('a loader error tagged by the router becomes kind "loader" on the tagged route', () => {
    const e = errorAt('boom', 5, 3)
    Object.defineProperty(e, Symbol.for('pyreon.router.loaderErrorRoute'), { value: '/account/:id' })
    expect(loaderErrorRoute(e)).toBe('/account/:id')
    const r = buildServerReport(e, { root, url: '/account/7', kind: 'render', route: '/account/:id' })
    expect(r.kind).toBe('loader')
    expect(r.route).toBe('/account/:id')
  })

  it('a middleware failure stays "middleware" and names the URL', () => {
    const r = buildServerReport(errorAt('denied', 5, 3), { root, url: '/admin', kind: 'middleware' })
    expect(r.kind).toBe('middleware')
    expect(r.route).toBe('/admin')
  })

  it('fills the fix from the diagnose catalog, and leaves it out when nothing matches', () => {
    const known = buildServerReport(errorAt('window is not defined', 5, 3), { root })
    expect(known.fix?.fix).toContain('onMount')
    const unknown = buildServerReport(errorAt('quota exceeded for tenant 42', 5, 3), { root })
    expect(unknown.fix).toBeUndefined()
  })

  it('keeps the location but no code frame when the file cannot be read', () => {
    const e = new Error('gone')
    e.stack = `Error: gone\n    at Page (${root}/src/routes/deleted.tsx:3:1)`
    const r = buildServerReport(e, { root })
    expect(r.location?.display).toBe('src/routes/deleted.tsx')
    expect(r.frame).toBeUndefined()
  })

  it('no app frame: no location, no frame', () => {
    const e = new Error('lib only')
    e.stack = `Error: lib only\n    at x (${root}/node_modules/dep/index.js:1:1)`
    const r = buildServerReport(e, { root })
    expect(r.location).toBeUndefined()
    expect(r.frame).toBeUndefined()
  })
})

describe('renderErrorOverlay', () => {
  it('is a complete, self-contained document: no external stylesheet, script or font', () => {
    const html = renderErrorOverlay(errorAt('boom', 5, 3), { root })
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('</html>')
    expect(html).not.toMatch(/<link\b/)
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toMatch(/@import|url\(/)
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')
  })

  it('shows the chip, route and phase, message, file link and editor button', () => {
    const html = renderErrorOverlay(errorAt('boom', 5, 3), { root, url: '/account', kind: 'render', route: '/account' })
    expect(html).toContain('<span class="pz-chip">Server render failed</span>')
    expect(html).toContain('/account · SSR')
    expect(html).toContain('<h2 class="pz-msg" id="pz-msg">boom</h2>')
    expect(html).toContain('>src/routes/account.tsx:5</a>')
    expect(html).toContain(`/__open-in-editor?file=${encodeURIComponent(`${file}:5:3`)}`)
    expect(html).toContain('Open in editor')
    expect(html).toContain('Copy for your AI assistant')
    expect(html).toContain('Reload')
  })

  it('never claims an MCP hand-off', () => {
    expect(renderErrorOverlay(errorAt('boom', 5, 3), { root })).not.toMatch(/MCP/)
  })

  it('escapes the message and the code', () => {
    const html = renderErrorOverlay(errorAt('<img src=x onerror=alert(1)>', 9, 3), { root })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    // line 9 is `  return <h1>…</h1>` in the fixture file
    expect(html).toContain('&lt;h1&gt;{useLoaderData().name}&lt;/h1&gt;')
  })

  it('carries the copy text, HTML-escaped, in the page', () => {
    const html = renderErrorOverlay(errorAt('a < b', 5, 3), { root })
    expect(html).toMatch(/<textarea hidden aria-hidden="true" tabindex="-1" data-pz-copytext>Pyreon dev error: Server error/)
    expect(html).toContain('a &lt; b')
  })

  it('still renders for an error with no message and no stack', () => {
    const e = new Error()
    e.stack = undefined
    const html = renderErrorOverlay(e)
    expect(html).toContain('Unknown error')
    expect(html).not.toContain('class="pz-stack"')
  })
})

describe('dev overlay module (the in-browser half)', () => {
  it('resolves to zero’s own dev-overlay source next to this module', () => {
    expect(devOverlayModulePath()).toMatch(/\/src\/dev-overlay\.ts$/)
    expect(devOverlayModuleSource()).toContain('installDevOverlay()')
  })

  it('is served by a /@id/ URL Vite can fetch', () => {
    expect(DEV_OVERLAY_SCRIPT_SRC).toBe('/@id/__x00__virtual:zero/dev-overlay')
  })
})
