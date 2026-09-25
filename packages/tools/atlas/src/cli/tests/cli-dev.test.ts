/**
 * `atlas dev`'s CLI half, with the server mocked: the real one owns the process
 * until interrupted, so what is asserted here is what the command SAYS about
 * the server it started — the empty-workbench notice, the bound URL, the port
 * and `--dir` it forwarded, and a boot failure reported as exit 1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const startDevServer = vi.fn()
vi.mock('../../dev/server', () => ({ startDevServer }))

const { runCli } = await import('../run')

let stdout: string[]
let stderr: string[]

beforeEach(() => {
  stdout = []
  stderr = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    stdout.push(String(c))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
    stderr.push(String(c))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  startDevServer.mockReset()
})

/** Let the command reach its never-resolving wait. */
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('atlas dev', () => {
  it('says the workbench is empty, naming the directory it scanned, and prints the bound URL', async () => {
    startDevServer.mockResolvedValue({ url: 'http://localhost:5211/', components: 0, close: async () => {} })
    void runCli(['dev', 'app', '--dir', 'lib', '--port', '5300'])
    await settle()
    expect(startDevServer).toHaveBeenCalledWith({ cwd: 'app', dir: 'lib', port: 5300 })
    expect(stderr.join('')).toContain('no components found under app/lib')
    expect(stdout.join('')).toBe('atlas dev: 0 component(s) → http://localhost:5211/\n')
  })

  it('defaults to the current directory and `src`, and stays quiet when it found something', async () => {
    startDevServer.mockResolvedValue({ url: 'http://localhost:5210/', components: 3, close: async () => {} })
    void runCli(['dev'])
    await settle()
    expect(startDevServer).toHaveBeenCalledWith({ cwd: '.' })
    expect(stderr.join('')).toBe('')
    expect(stdout.join('')).toContain('3 component(s)')
  })

  it('reports a boot failure and exits 1', async () => {
    startDevServer.mockRejectedValue(new Error('port 5210 is in use'))
    expect(await runCli(['dev'])).toBe(1)
    expect(stderr.join('')).toBe('port 5210 is in use\n')
    startDevServer.mockRejectedValue('bare')
    expect(await runCli(['dev'])).toBe(1)
    expect(stderr.join('')).toContain('bare\n')
  })
})
