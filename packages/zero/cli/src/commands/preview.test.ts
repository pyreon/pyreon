import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const startFixture = (entry: string) => {
  const dir = make({
    'dist/server/entry-server.js': '',
    'dist/index.js': entry,
    'package.json': '{"type":"module"}',
  })
  const target = resolvePreviewTarget(dir)
  if (target.kind !== 'runner') throw new Error('expected runner')
  // Let the OS allocate a port; selecting a random port races other processes.
  return { dir, child: startRunner(target, 0, dir, 'ignore') }
}

const serverEntry = (response: string) => `
import { createServer } from 'node:http'
import { renameSync, writeFileSync } from 'node:fs'
const server = createServer((request, response) => { ${response} })
server.listen(Number(process.env.PORT), '127.0.0.1', () => {
  writeFileSync('runner-ready.tmp', String(server.address().port))
  renameSync('runner-ready.tmp', 'runner-ready')
})
`

async function readyPort(child: ChildProcess, dir: string): Promise<number> {
  let spawnError: Error | undefined
  const onError = (error: Error) => { spawnError = error }
  child.on('error', onError)
  try {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Preview runner exited before ready: ${child.exitCode ?? child.signalCode}`)
      }
      const path = join(dir, 'runner-ready')
      if (existsSync(path)) return Number(readFileSync(path, 'utf8'))
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error('Preview runner did not become ready within 5 seconds')
  } finally {
    child.off('error', onError)
  }
}

async function readRunner(port: number, timeout = 1_000): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/x`, {
    signal: AbortSignal.timeout(timeout),
  })
  return response.text()
}

async function stopRunner(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = once(child, 'close')
  child.kill()
  const deadline = setTimeout(() => child.kill('SIGKILL'), 1_000)
  try {
    await closed
  } finally {
    clearTimeout(deadline)
  }
}

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
    const { dir, child } = startFixture(serverEntry(
      'response.end(JSON.stringify({ port: process.env.PORT, mode: process.env.NODE_ENV }))',
    ))
    try {
      const port = await readyPort(child, dir)
      expect(port).toBeGreaterThan(0)
      expect(JSON.parse(await readRunner(port))).toEqual({ port: '0', mode: 'production' })
    } finally {
      await stopRunner(child)
    }
  })

  it('bounds a runner that sends headers but never finishes its response body', async () => {
    const { dir, child } = startFixture(serverEntry("response.writeHead(200); response.write('partial')"))
    try {
      const port = await readyPort(child, dir)
      await expect(readRunner(port, 100)).rejects.toThrow(/abort|timeout/i)
    } finally {
      await stopRunner(child)
    }
  })

  it('reports a runner that exits before readiness', async () => {
    const { dir, child } = startFixture('process.exit(23)')
    try {
      await expect(readyPort(child, dir)).rejects.toThrow('Preview runner exited before ready: 23')
    } finally {
      await stopRunner(child)
    }
  })
})
