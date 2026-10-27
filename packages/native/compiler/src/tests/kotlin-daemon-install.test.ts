// The kotlin daemon's server/stubs jars are built under os.tmpdir() and
// installed into the verdict cache, which CI restores onto a different
// mount. rename(2) cannot cross devices, so a bare tmpdir -> cache rename
// failed with EXDEV on every cold CI run and silently disabled the daemon
// ("server did not compile: EXDEV: cross-device link"). That cannot be
// reproduced on one filesystem, so this file gives renameSync the real
// cross-device semantics: a rename between two different directories
// throws EXDEV, a rename within one directory succeeds.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const renameSync = (from: string, to: string) => {
    if (dirname(String(from)) !== dirname(String(to))) {
      const err = new Error(`EXDEV: cross-device link not permitted, rename '${from}' -> '${to}'`)
      ;(err as NodeJS.ErrnoException).code = 'EXDEV'
      throw err
    }
    return real.renameSync(from, to)
  }
  return { ...real, renameSync, default: { ...real, renameSync } }
})

const { installArtefact } = await import('../kotlin-daemon')

const dirs: string[] = []
const fresh = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('installArtefact (kotlin daemon jars)', () => {
  it('installs a jar built in another directory without a cross-directory rename', () => {
    const work = fresh('pyreon-build-')
    const cache = fresh('pyreon-cache-')
    const built = join(work, 'server.jar')
    writeFileSync(built, 'JARBYTES')
    const dest = join(cache, 'kotlin-daemon-abc.jar')
    installArtefact(built, dest)
    expect(readFileSync(dest, 'utf8')).toBe('JARBYTES')
    // No staged temp file is left behind in the cache.
    expect(readdirSync(cache)).toEqual(['kotlin-daemon-abc.jar'])
  })

  it('creates the destination directory when it does not exist yet', () => {
    const work = fresh('pyreon-build-')
    const built = join(work, 'stubs.jar')
    writeFileSync(built, 'STUBS')
    const dest = join(fresh('pyreon-cache-'), 'nested', 'kotlin-stubs-x.jar')
    installArtefact(built, dest)
    expect(readFileSync(dest, 'utf8')).toBe('STUBS')
  })
})
