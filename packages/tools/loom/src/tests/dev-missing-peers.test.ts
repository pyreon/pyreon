/**
 * `loom dev` without its OPTIONAL peers — the first thing a new consumer is
 * likely to hit.
 *
 * `vite` and `@pyreon/vite-plugin` are optional peers: `loom scan` (the CLI
 * half a CI job binds to) does not need them, and the observatory does. In a
 * repo that installed `@pyreon/loom` for its scan gate, `loom dev` therefore
 * fails by design — and what it says at that moment is the whole experience.
 * A raw `ERR_MODULE_NOT_FOUND` reads as a broken package; a sentence naming
 * the install command and confirming `loom scan` still works reads as a tool
 * that knows its own shape.
 *
 * The path was correct but untested before the package's first publish, which
 * is the wrong order for the error a stranger meets first.
 */
import { describe, expect, it, vi } from 'vitest'

describe('loom dev without its optional peers', () => {
  it('names the missing dependency, the install command, and what still works', async () => {
    vi.resetModules()
    vi.doMock('vite', () => {
      throw new Error("Cannot find package 'vite'")
    })
    const { startDevServer } = await import('../dev/server')
    await expect(startDevServer({ cwd: process.cwd() })).rejects.toThrow(
      /loom dev needs Vite, which is not installed/,
    )
    // The actionable half: what to run, and the reassurance that the CI-facing
    // command is unaffected. Asserted because a message is the deliverable here.
    await expect(startDevServer({ cwd: process.cwd() })).rejects.toThrow(
      /bun add -d vite @pyreon\/vite-plugin/,
    )
    await expect(startDevServer({ cwd: process.cwd() })).rejects.toThrow(
      /`loom scan` does not need Vite/,
    )
    vi.doUnmock('vite')
    vi.resetModules()
  })

  it('distinguishes a missing @pyreon/vite-plugin from a missing vite', async () => {
    // Vite present, plugin absent — the half-installed state. Reporting "Vite
    // is not installed" here would send someone to reinstall what they have.
    vi.resetModules()
    vi.doMock('vite', () => ({ createServer: async () => ({ listen: async () => {}, close: async () => {} }) }))
    vi.doMock('@pyreon/vite-plugin', () => {
      throw new Error("Cannot find package '@pyreon/vite-plugin'")
    })
    const { startDevServer } = await import('../dev/server')
    await expect(startDevServer({ cwd: process.cwd() })).rejects.toThrow(
      /@pyreon\/vite-plugin is not installed/,
    )
    vi.doUnmock('vite')
    vi.doUnmock('@pyreon/vite-plugin')
    vi.resetModules()
  })
})
