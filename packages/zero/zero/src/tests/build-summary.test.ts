import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  collectBuildStats,
  colorizeMode,
  detectColorLevel,
  emberBrand,
  formatBuildSummary,
  formatKB,
} from '../build-summary'
import { formatRouteModeTable } from '../route-modes'

// ─── detectColorLevel ────────────────────────────────────────────────────────

describe('detectColorLevel', () => {
  it('NO_COLOR always wins', () => {
    expect(detectColorLevel({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)).toBe(0)
  })
  it('TERM=dumb is plain', () => {
    expect(detectColorLevel({ TERM: 'dumb' }, true)).toBe(0)
  })
  it('non-TTY is plain unless FORCE_COLOR', () => {
    expect(detectColorLevel({}, false)).toBe(0)
    expect(detectColorLevel({ FORCE_COLOR: '1' }, false)).toBe(1)
  })
  it('COLORTERM=truecolor unlocks the gradient tier', () => {
    expect(detectColorLevel({ COLORTERM: 'truecolor' }, true)).toBe(2)
    expect(detectColorLevel({ COLORTERM: '24bit' }, true)).toBe(2)
  })
  it('plain TTY gets 16-color', () => {
    expect(detectColorLevel({}, true)).toBe(1)
  })
})

// ─── formatKB ────────────────────────────────────────────────────────────────

describe('formatKB', () => {
  it('follows the Vite convention (1000-based)', () => {
    expect(formatKB(999)).toBe('999 B')
    expect(formatKB(1500)).toBe('1.5 kB')
    expect(formatKB(2_345_678)).toBe('2.35 MB')
  })
})

// ─── collectBuildStats (fixture dist tree) ───────────────────────────────────

const dist = mkdtempSync(join(tmpdir(), 'pyreon-build-summary-'))

afterAll(() => {
  rmSync(dist, { recursive: true, force: true })
})

describe('collectBuildStats', () => {
  mkdirSync(join(dist, 'assets'), { recursive: true })
  mkdirSync(join(dist, 'server'), { recursive: true })
  mkdirSync(join(dist, 'about'), { recursive: true })
  // Compressible entry chunk (referenced by index.html) + a lazy chunk + css
  // + a binary asset. Content is repetitive so gzip is measurably smaller.
  writeFileSync(join(dist, 'assets', 'index-Ab12Cd34.js'), 'export const x = 1;\n'.repeat(200))
  writeFileSync(join(dist, 'assets', 'chunk-Ef56Gh78.js'), 'export const y = 2;\n'.repeat(100))
  writeFileSync(join(dist, 'assets', 'index-Ij90Kl12.css'), '.a{color:red}\n'.repeat(50))
  writeFileSync(join(dist, 'assets', 'logo-Mn34Op56.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(
    join(dist, 'index.html'),
    '<html><head><link href="/assets/index-Ij90Kl12.css"></head><body><script src="/assets/index-Ab12Cd34.js"></script></body></html>',
  )
  writeFileSync(join(dist, 'about', 'index.html'), '<html><body>about</body></html>')
  writeFileSync(join(dist, 'server', 'entry-server.js'), 'export default 1\n')
  writeFileSync(join(dist, 'server', 'template.html'), '<html></html>')

  const stats = collectBuildStats(dist)

  it('classifies kinds and computes gzip for compressible assets only', () => {
    const js = stats.clientAssets.filter((a) => a.kind === 'js')
    const css = stats.clientAssets.filter((a) => a.kind === 'css')
    const other = stats.clientAssets.filter((a) => a.kind === 'other')
    expect(js).toHaveLength(2)
    expect(css).toHaveLength(1)
    expect(other).toHaveLength(1)
    for (const a of [...js, ...css]) {
      expect(a.gzipBytes).not.toBeNull()
      expect(a.gzipBytes as number).toBeLessThan(a.bytes)
    }
    expect(other[0]?.gzipBytes).toBeNull()
  })

  it('marks the chunks referenced by index.html as entry', () => {
    const entryNames = stats.clientAssets.filter((a) => a.entry).map((a) => a.file)
    expect(entryNames).toContain('assets/index-Ab12Cd34.js')
    expect(entryNames).toContain('assets/index-Ij90Kl12.css')
    expect(entryNames).not.toContain('assets/chunk-Ef56Gh78.js')
  })

  it('counts prerendered html EXCLUDING dist/server (template.html is not a page)', () => {
    expect(stats.prerendered.count).toBe(2) // index.html + about/index.html
    expect(stats.prerendered.bytes).toBeGreaterThan(0)
  })

  it('lists the server bundle files', () => {
    expect(stats.server.map((f) => f.file).sort()).toEqual([
      'server/entry-server.js',
      'server/template.html',
    ])
  })

  it('tolerates a dist with no assets/ and no server/ (SPA shell)', () => {
    const bare = mkdtempSync(join(tmpdir(), 'pyreon-build-summary-bare-'))
    try {
      writeFileSync(join(bare, 'index.html'), '<html></html>')
      const s = collectBuildStats(bare)
      expect(s.clientAssets).toEqual([])
      expect(s.server).toEqual([])
      expect(s.prerendered.count).toBe(1)
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})

// ─── formatBuildSummary ──────────────────────────────────────────────────────

describe('formatBuildSummary', () => {
  const stats = collectBuildStats(dist)

  it('plain (color 0) output carries the brand, entries, totals, server + pages + time', () => {
    const text = formatBuildSummary(stats, { color: 0, elapsedMs: 965 }).join('\n')
    expect(text).toContain('▲ pyreon zero')
    expect(text).toContain('Client assets')
    expect(text).toContain('entry')
    expect(text).toContain('index-Ab12Cd34.js')
    expect(text).toContain('gzip')
    expect(text).toContain('Σ') // totals row
    expect(text).toContain('2 js')
    expect(text).toContain('1 css')
    expect(text).toContain('Server bundle')
    expect(text).toContain('server/entry-server.js')
    expect(text).toContain('2 prerendered pages')
    expect(text).toContain('Build complete')
    expect(text).toContain('965 ms')
    // Plain tier: no ANSI escapes at all.
    expect(text).not.toContain('\x1b[')
  })

  it('seconds formatting above 1s', () => {
    const text = formatBuildSummary(stats, { color: 0, elapsedMs: 1080 }).join('\n')
    expect(text).toContain('1.08 s')
  })

  it('collapses the tail past maxRows', () => {
    const text = formatBuildSummary(stats, { color: 0, maxRows: 1 }).join('\n')
    expect(text).toContain('+ 3 more')
  })

  it('truecolor tier paints the ember gradient', () => {
    const text = formatBuildSummary(stats, { color: 2, elapsedMs: 10 }).join('\n')
    expect(text).toContain('\x1b[38;2;255;31;140m') // ember-plasma
    expect(text).toContain('\x1b[38;2;') // truecolor escapes present
  })

  it('16-color tier uses basic ANSI only', () => {
    const text = formatBuildSummary(stats, { color: 1, elapsedMs: 10 }).join('\n')
    expect(text).toContain('\x1b[')
    expect(text).not.toContain('\x1b[38;2;')
  })
})

// ─── emberBrand / colorizeMode / mode-table color param ──────────────────────

describe('branding helpers', () => {
  it('emberBrand degrades to plain text at level 0', () => {
    expect(emberBrand(0)).toBe('▲ pyreon zero')
  })

  it('colorizeMode is identity at level 0 and for unknown modes', () => {
    expect(colorizeMode(0, 'ssr', 'λ ssr')).toBe('λ ssr')
    expect(colorizeMode(2, 'nope', 'x')).toBe('x')
  })

  it('formatRouteModeTable default (no color arg) is byte-identical to the pre-color output', () => {
    const entries = [
      { pattern: '/a', mode: 'ssr' as const, declared: false },
      { pattern: '/b', mode: 'ssg' as const, declared: true },
    ]
    const plain = formatRouteModeTable(entries, 'ssr')
    expect(plain.join('\n')).not.toContain('\x1b[')
    expect(plain[0]).toContain('[zero] Route modes (app: ssr)')
    const colored = formatRouteModeTable(entries, 'ssr', 40, 2)
    expect(colored.join('\n')).toContain('\x1b[38;2;')
  })
})
