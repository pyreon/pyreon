import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePreviewTarget, startRunner } from './preview'

let root: string
const make = (files: Record<string, string>) => {
  root = mkdtempSync(join(tmpdir(), 'zero-preview-'))
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('zero preview target', () => {
  it('an SSR build with the node runner runs the real server, not a static shell', () => {
    const dir = make({ 'dist/index.js': '', 'dist/server/entry-server.js': '', 'dist/client/index.html': '' })
    expect(resolvePreviewTarget(dir)).toEqual({ kind: 'runner', runtime: 'node', entry: join(dir, 'dist/index.js') })
  })

  it('the bun runner is used when that is what the adapter emitted', () => {
    const dir = make({ 'dist/index.ts': '', 'dist/server/entry-server.js': '' })
    expect(resolvePreviewTarget(dir)).toMatchObject({ kind: 'runner', runtime: 'bun' })
  })

  it('a static build stays static', () => {
    const dir = make({ 'dist/index.html': '' })
    expect(resolvePreviewTarget(dir)).toEqual({ kind: 'static', outDir: undefined, serverBuildWithoutRunner: false })
  })

  it('a platform server build without a runner is flagged (preview cannot serve SSR/API)', () => {
    const dir = make({ 'dist/server/entry-server.js': '', 'dist/index.html': '' })
    expect(resolvePreviewTarget(dir)).toMatchObject({ kind: 'static', serverBuildWithoutRunner: true })
  })

  it('startRunner launches the runner on the requested PORT (shipped entry)', async () => {
    const dir = make({
      'dist/server/entry-server.js': '',
      'dist/index.js':
        "import { createServer } from 'node:http'\ncreateServer((q, s) => s.end('runner:' + process.env.NODE_ENV)).listen(Number(process.env.PORT))\n",
      'package.json': '{"type":"module"}',
    })
    const target = resolvePreviewTarget(dir)
    if (target.kind !== 'runner') throw new Error('expected runner')
    const port = 40000 + Math.floor(Math.random() * 20000)
    const child = startRunner(target, port, dir, 'ignore')
    try {
      let body = ''
      for (let i = 0; i < 100 && !body; i++) {
        body = await fetch(`http://127.0.0.1:${port}/api/x`).then((r) => r.text(), () => '')
        if (!body) await new Promise((r) => setTimeout(r, 50))
      }
      expect(body).toBe('runner:production')
    } finally {
      child.kill()
    }
  })
})
