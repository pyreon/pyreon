/**
 * The build summary must report what PRERENDERED, not what is on disk.
 *
 * When a path fails to prerender the untouched client shell stays in `dist`,
 * so a filesystem walk counts it as a rendered page. A build that rendered
 * four of five printed
 *
 *     ○ 5 prerendered pages (2.20 MB html)
 *
 * and exited 0, with the failure visible only in a console.error above the
 * summary and in `dist/_pyreon-ssg-errors.json`. That combination is worse
 * than a plain crash: the last thing on screen said success.
 *
 * Continuing past a failed path stays deliberate — these specs assert the
 * REPORT, not the policy.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectBuildStats, formatBuildSummary } from '../build-summary'
import { readSsgOutcome, recordSsgOutcome, resetSsgOutcome } from '../ssg-outcome'

afterEach(() => resetSsgOutcome())

/** A dist with `pages` HTML files, one of which may be a failed shell. */
function dist(pages: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'zero-ssg-summary-'))
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="app"></div>')
  for (let i = 1; i < pages; i += 1) {
    mkdirSync(join(dir, `p${i}`), { recursive: true })
    writeFileSync(join(dir, `p${i}`, 'index.html'), `<!doctype html><main>page ${i}</main>`)
  }
  return dir
}

const dirs: string[] = []
const distAt = (n: number): string => {
  const d = dist(n)
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const plain = (stats: Parameters<typeof formatBuildSummary>[0]) =>
  formatBuildSummary(stats, { color: 0, elapsedMs: 10 }).join('\n')

describe('collectBuildStats — the recorded outcome wins over the filesystem', () => {
  it('reports RENDERED pages, not HTML files, when a path failed', () => {
    // The exact shape of the bug: five files on disk, four actually rendered.
    const d = distAt(5)
    recordSsgOutcome({ rendered: 4, failed: 1, errorArtifact: 'see dist/_pyreon-ssg-errors.json' })
    const stats = collectBuildStats(d, 'assets')
    expect(stats.prerendered.count).toBe(4)
    expect(stats.prerendered.failed).toBe(1)
  })

  it('still measures BYTES from disk — those files really are there', () => {
    const d = distAt(5)
    recordSsgOutcome({ rendered: 4, failed: 1 })
    expect(collectBuildStats(d, 'assets').prerendered.bytes).toBeGreaterThan(0)
  })

  it('falls back to the filesystem when no outcome was recorded', () => {
    // A pure-SPA build never runs the prerender pass; it must not report 0.
    const d = distAt(3)
    expect(collectBuildStats(d, 'assets').prerendered.count).toBe(3)
  })

  it('carries no failure marker on a clean build', () => {
    const d = distAt(3)
    recordSsgOutcome({ rendered: 3, failed: 0 })
    const stats = collectBuildStats(d, 'assets')
    expect(stats.prerendered.count).toBe(3)
    expect(stats.prerendered.failed).toBeUndefined()
  })
})

describe('formatBuildSummary — a failure is the last thing you read', () => {
  it('says how many FAILED, and that those URLs serve an empty page', () => {
    const d = distAt(5)
    recordSsgOutcome({ rendered: 4, failed: 1, errorArtifact: 'see dist/_pyreon-ssg-errors.json' })
    const out = plain(collectBuildStats(d, 'assets'))
    expect(out).toContain('4 prerendered pages')
    expect(out).toContain('1 page FAILED to prerender')
    expect(out).toContain('dist/_pyreon-ssg-errors.json')
    // The consequence, not just the count — an empty page is the thing the
    // reader has to act on.
    expect(out).toMatch(/empty page/)
  })

  it('never claims the failed count as rendered', () => {
    const d = distAt(5)
    recordSsgOutcome({ rendered: 4, failed: 1 })
    expect(plain(collectBuildStats(d, 'assets'))).not.toContain('5 prerendered')
  })

  it('stays quiet on a clean build', () => {
    const d = distAt(3)
    recordSsgOutcome({ rendered: 3, failed: 0 })
    const out = plain(collectBuildStats(d, 'assets'))
    expect(out).toContain('3 prerendered pages')
    expect(out).not.toContain('FAILED')
  })

  it('reports a total failure rather than printing nothing', () => {
    // count === 0 used to skip the block entirely, so a build where EVERY
    // page failed said nothing at all about prerendering.
    const d = distAt(1)
    recordSsgOutcome({ rendered: 0, failed: 2, errorArtifact: 'see dist/_pyreon-ssg-errors.json' })
    const out = plain(collectBuildStats(d, 'assets'))
    expect(out).toContain('0 prerendered pages')
    expect(out).toContain('2 pages FAILED to prerender')
  })
})

describe('the outcome is per-build state', () => {
  it('resets, so a second build in the same process cannot inherit the first', () => {
    recordSsgOutcome({ rendered: 4, failed: 1 })
    expect(readSsgOutcome()?.failed).toBe(1)
    resetSsgOutcome()
    expect(readSsgOutcome()).toBeUndefined()
  })
})
