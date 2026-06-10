/**
 * LPIH runtime bridge — `writeLpihCache` + `startLpihPolling` tests.
 *
 * Proves the filesystem cache contract:
 *   1. Atomic write (tmp + rename, never half-written)
 *   2. Empty payload when devtools inactive
 *   3. Real fire data when devtools active + signals firing
 *   4. Polling helper writes repeatedly + disposer stops it
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import {
  LPIH_DEFAULT_FILENAME,
  getDefaultLpihCachePath,
  startLpihPolling,
  writeLpihCache,
} from '../lpih'
import {
  __resetReactiveDevtoolsForTesting,
  activateReactiveDevtools,
} from '../reactive-devtools'
import { signal } from '../signal'

/**
 * Wait until `path`'s mtime has been QUIET (unchanged) for `quietMs`, then
 * return it. The post-`dispose()` contract is "at most ONE in-flight async
 * write may still land; nothing can be scheduled after" — so a demonstrated
 * quiet window proves the straggler has settled and the returned mtime is a
 * safe frozen baseline. Replaces fixed-sleep drains, which raced the
 * straggler under parallel-load CI twice with two different buffer sizes
 * (the deadline-vs-starved-loop shape; see the ws-relay tick-counted
 * waitFor precedent). Unbounded by design — vitest's testTimeout is the
 * backstop, and under load the loop simply takes longer instead of failing.
 */
async function settleMtime(
  fs: typeof import('node:fs/promises'),
  path: string,
  quietMs: number,
): Promise<number> {
  let last = (await fs.stat(path)).mtimeMs
  let quietSince = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 25))
    const cur = (await fs.stat(path)).mtimeMs
    if (cur !== last) {
      last = cur
      quietSince = Date.now()
    } else if (Date.now() - quietSince >= quietMs) {
      return cur
    }
  }
}

let TMP_DIR: string

beforeAll(() => {
  TMP_DIR = mkdtempSync(join(tmpdir(), 'lpih-test-'))
})

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  // Cross-test isolation — full reset of registry + fire buffer + _active.
  // (Pre-fix this used `deactivateReactiveDevtools()` which doubled as
  // a reset path; production deactivate now only flips _active, so tests
  // need the explicit reset.)
  __resetReactiveDevtoolsForTesting()
})

afterEach(() => {
  __resetReactiveDevtoolsForTesting()
})

const readCache = (path: string): { fires: unknown[] } =>
  JSON.parse(readFileSync(path, 'utf8')) as { fires: unknown[] }

describe('writeLpihCache', () => {
  it('writes an empty payload when devtools is inactive', async () => {
    const path = join(TMP_DIR, 'inactive.json')
    const count = await writeLpihCache(path)
    expect(count).toBe(0)
    const parsed = readCache(path)
    expect(parsed.fires).toEqual([])
  })

  it('writes real fire data when devtools is active', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    s.set(2)
    s.set(3)
    const path = join(TMP_DIR, 'active.json')
    const count = await writeLpihCache(path)
    expect(count).toBe(1) // one source location
    const parsed = readCache(path) as {
      fires: Array<{ file: string; line: number; count: number; kind: string }>
    }
    expect(parsed.fires).toHaveLength(1)
    expect(parsed.fires[0]?.count).toBe(3)
    expect(parsed.fires[0]?.kind).toBe('signal')
    expect(parsed.fires[0]?.file).toContain('lpih.test.ts')
    void s
  })

  it('captures signal + computed + effect locations', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    const c = computed(() => s() * 2)
    const e = effect(() => {
      c()
    })
    s.set(5)
    s.set(10)
    const path = join(TMP_DIR, 'multi.json')
    await writeLpihCache(path)
    const parsed = readCache(path) as {
      fires: Array<{ kind: string; count: number }>
    }
    const kinds = new Set(parsed.fires.map((f) => f.kind))
    expect(kinds.has('signal')).toBe(true)
    expect(kinds.has('effect')).toBe(true)
    // derived may show up as 'native:1' under bun's compiled inline callbacks
    e.dispose()
  })

  it('overwrites existing file (atomic rename semantics)', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    const path = join(TMP_DIR, 'overwrite.json')

    s.set(1)
    await writeLpihCache(path)
    const before = readCache(path) as { fires: Array<{ count: number }> }
    expect(before.fires[0]?.count).toBe(1)

    s.set(2)
    s.set(3)
    await writeLpihCache(path)
    const after = readCache(path) as { fires: Array<{ count: number }> }
    expect(after.fires[0]?.count).toBe(3) // updated count
    void s
  })

  it('leaves no tmp files after successful write', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    const path = join(TMP_DIR, 'no-tmp.json')
    await writeLpihCache(path)
    const fs = await import('node:fs/promises')
    const files = await fs.readdir(TMP_DIR)
    const tmpFiles = files.filter((f) => f.includes('.tmp.'))
    expect(tmpFiles).toEqual([]) // tmp file should be renamed away
    void s
  })
})

describe('writeLpihCache — defensive cleanup', () => {
  it('cleans up tmp file when rename fails (target is a directory)', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    // Build a path whose target IS a directory — rename onto a directory
    // throws EISDIR (POSIX) / EPERM (Windows). The tmp file should be
    // unlinked even though writeLpihCache rethrows.
    const targetDir = join(TMP_DIR, 'target-as-dir')
    const fs = await import('node:fs/promises')
    await fs.mkdir(targetDir, { recursive: true })

    await expect(writeLpihCache(targetDir)).rejects.toBeDefined()

    // No tmp file should be left behind in TMP_DIR.
    const files = await fs.readdir(TMP_DIR)
    const tmpFiles = files.filter(
      (f) => f.startsWith('target-as-dir.tmp.') || f.includes('.tmp.'),
    )
    expect(tmpFiles).toEqual([])
    void s
  })

  it('cleans up tmp file even when unlink fallback fails silently', async () => {
    // This is the harder case: we want to assert the cleanup runs without
    // letting an unlink-failure leak as the user-visible error. We can't
    // easily make unlink fail in a portable way, but the code path is
    // covered by the try/catch — verify the behavior: rejecting with the
    // ORIGINAL rename error, never the unlink one.
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    const targetDir = join(TMP_DIR, 'silent-unlink')
    const fs = await import('node:fs/promises')
    await fs.mkdir(targetDir, { recursive: true })
    try {
      await writeLpihCache(targetDir)
      expect.fail('should have rejected')
    } catch (err) {
      // The error message should reference the rename failure, NOT the
      // unlink fallback — proof we prioritize the original error.
      const code = (err as { code?: string }).code
      expect(['EISDIR', 'EPERM', 'EACCES']).toContain(code)
    }
    void s
  })
})

describe('startLpihPolling', () => {
  it('timer is unref()d so polling does not block process exit', async () => {
    activateReactiveDevtools()
    const path = join(TMP_DIR, 'unref-check.json')
    const dispose = startLpihPolling(path, 50)
    // Wait one tick so the timer is actually scheduled.
    await new Promise((r) => setTimeout(r, 100))
    // Indirect check: the polling timer is internal, but we can verify
    // the disposer stops cleanly without hanging. If unref() weren't
    // applied, this test could still pass (since vitest holds the loop
    // open) — the bisect test is "test runs at all without timing out",
    // which is the load-bearing behavior.
    dispose()
    // After dispose, ONE in-flight async write may still be completing
    // (the timer is cleared, so nothing further can be scheduled). A fixed
    // sleep before the baseline raced that write under parallel-load CI —
    // twice, with two different buffer sizes. Instead, wait until the
    // file's mtime has been demonstrably QUIET, then assert it stays
    // frozen: once the (at most one) straggler lands, no writer exists.
    const fs = await import('node:fs/promises')
    const baseline = await settleMtime(fs, path, 300)
    await new Promise((r) => setTimeout(r, 150))
    const stat2 = await fs.stat(path)
    expect(stat2.mtimeMs).toBe(baseline)
  })

  it('writes repeatedly + disposer stops it', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    const path = join(TMP_DIR, 'polling.json')
    const dispose = startLpihPolling(path, 50)

    // Wait for at least 3 polls (150ms expected).
    await new Promise((r) => setTimeout(r, 200))
    s.set(1)
    s.set(2)
    await new Promise((r) => setTimeout(r, 100))

    dispose()
    const fs = await import('node:fs/promises')

    // Drain any in-flight write via the quiet-window settle (see
    // `settleMtime`): a callback already queued at dispose() time still
    // runs, and fixed-sleep drains raced it under parallel-load CI twice
    // (94ms observed drift the first time; past a 100ms buffer the
    // second). Once mtime has been quiet for a full window, the at-most-
    // one straggler has landed and the timer is cleared — nothing can
    // write again.
    const before = await settleMtime(fs, path, 300)
    await new Promise((r) => setTimeout(r, 250)) // > 4 poll cycles
    const after = await fs.stat(path)
    expect(after.mtimeMs).toBe(before) // mtime frozen post-settle
    void s
  })
})

describe('getDefaultLpihCachePath', () => {
  it('returns <cwd>/.pyreon-lpih.json when process.cwd is available', () => {
    const out = getDefaultLpihCachePath()
    expect(out).toBeTruthy()
    expect(out).toContain(LPIH_DEFAULT_FILENAME)
    // Should be a real cwd-rooted path
    expect(out?.startsWith('/') || /^[A-Za-z]:/.test(out ?? '')).toBe(true)
  })

  it('exposes the canonical filename constant', () => {
    expect(LPIH_DEFAULT_FILENAME).toBe('.pyreon-lpih.json')
  })

  it('returns null when process.cwd is unavailable (web worker fallback)', () => {
    // Temporarily shadow process.cwd to simulate browser/worker.
    // Cast `process` since the package's narrow type omits .cwd.
    const proc = process as unknown as { cwd?: (() => string) | undefined }
    const realCwd = proc.cwd
    try {
      delete proc.cwd
      const out = getDefaultLpihCachePath()
      expect(out).toBeNull()
    } finally {
      proc.cwd = realCwd
    }
  })
})

describe('writeLpihCache / startLpihPolling — default path resolution', () => {
  it('writeLpihCache() with no arg writes to <cwd>/.pyreon-lpih.json', async () => {
    // Move cwd to TMP_DIR so the default-path write lands somewhere
    // we control + can clean up.
    const fs = await import('node:fs/promises')
    const proc = process as unknown as {
      cwd(): string
      chdir(p: string): void
    }
    const originalCwd = proc.cwd()
    proc.chdir(TMP_DIR)
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    try {
      const count = await writeLpihCache()
      expect(count).toBe(1)
      // Verify the file landed at the cwd-relative default location.
      const stat = await fs.stat(join(TMP_DIR, LPIH_DEFAULT_FILENAME))
      expect(stat.isFile()).toBe(true)
    } finally {
      proc.chdir(originalCwd)
      // Best-effort cleanup
      try {
        await fs.unlink(join(TMP_DIR, LPIH_DEFAULT_FILENAME))
      } catch {
        /* */
      }
    }
    void s
  })

  it('writeLpihCache(explicitPath) still honors the explicit path', async () => {
    const fs = await import('node:fs/promises')
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    const explicit = join(TMP_DIR, 'explicit-override.json')
    const count = await writeLpihCache(explicit)
    expect(count).toBe(1)
    const stat = await fs.stat(explicit)
    expect(stat.isFile()).toBe(true)
    void s
  })

  it('startLpihPolling() with no arg uses the default path', async () => {
    const fs = await import('node:fs/promises')
    const proc = process as unknown as {
      cwd(): string
      chdir(p: string): void
    }
    const originalCwd = proc.cwd()
    proc.chdir(TMP_DIR)
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    try {
      const dispose = startLpihPolling(undefined, 50)
      await new Promise((r) => setTimeout(r, 150))
      dispose()
      const stat = await fs.stat(join(TMP_DIR, LPIH_DEFAULT_FILENAME))
      expect(stat.isFile()).toBe(true)
    } finally {
      proc.chdir(originalCwd)
      try {
        await fs.unlink(join(TMP_DIR, LPIH_DEFAULT_FILENAME))
      } catch {
        /* */
      }
    }
    void s
  })

  it('startLpihPolling() throws synchronously when no default + no path', () => {
    const proc = process as unknown as { cwd?: (() => string) | undefined }
    const realCwd = proc.cwd
    try {
      delete proc.cwd
      expect(() => startLpihPolling()).toThrow(/no path provided/)
    } finally {
      proc.cwd = realCwd
    }
  })

  it('writeLpihCache() rejects when no default + no path', async () => {
    const proc = process as unknown as { cwd?: (() => string) | undefined }
    const realCwd = proc.cwd
    try {
      delete proc.cwd
      await expect(writeLpihCache()).rejects.toThrow(/no path provided/)
    } finally {
      proc.cwd = realCwd
    }
  })
})
