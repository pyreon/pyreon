import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateBuildInputs } from '../adapters/validate'

// Coverage gap closed in PR #323. `validateBuildInputs` is the
// adapters' pre-flight check before copying outputs into the
// deployment shape. Pure existence-check; throws with actionable
// messages when either input directory is missing.

let tmp: string
const writeFakeOutputs = (dir: string) => {
  // Create a "client outDir" directory + a "server entry" file
  writeFileSync(join(dir, 'server-entry.js'), '// server')
  // dir itself acts as clientOutDir
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pyreon-validate-'))
  writeFakeOutputs(tmp)
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('adapters/validateBuildInputs', () => {
  it('resolves when both client outDir and server entry exist', async () => {
    await expect(
      validateBuildInputs({
        clientOutDir: tmp,
        serverEntry: join(tmp, 'server-entry.js'),
      } as any),
    ).resolves.toBeUndefined()
  })

  it('throws with actionable message when client outDir is missing', async () => {
    await expect(
      validateBuildInputs({
        clientOutDir: '/nonexistent-pyreon-test-path-XYZ',
        serverEntry: join(tmp, 'server-entry.js'),
      } as any),
    ).rejects.toThrow(/Client build output not found/)
  })

  it('throws with actionable message when server entry is missing', async () => {
    await expect(
      validateBuildInputs({
        clientOutDir: tmp,
        serverEntry: '/nonexistent-pyreon-test-path-XYZ.js',
      } as any),
    ).rejects.toThrow(/Server entry not found/)
  })

  it('error message references the actual missing path', async () => {
    const path = '/some-very-specific-missing-path/dist'
    await expect(
      validateBuildInputs({
        clientOutDir: path,
        serverEntry: join(tmp, 'server-entry.js'),
      } as any),
    ).rejects.toThrow(path)
  })

  it('error message hints at the right vite command', async () => {
    await expect(
      validateBuildInputs({
        clientOutDir: '/nonexistent-XYZ',
        serverEntry: '/nonexistent-XYZ.js',
      } as any),
    ).rejects.toThrow(/vite build/)
  })
})
