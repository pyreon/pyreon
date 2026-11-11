import { describe, expect, it } from 'vitest'
import {
  bar,
  CLI_PALETTE,
  type ColorLevel,
  columns,
  createTerm,
  detectColorLevel,
  detectTheme,
  detectUnicode,
  fileUrl,
  finding,
  formatCounts,
  formatElapsed,
  frame,
  header,
  hexToRgb,
  formatLocation,
  interrupted,
  nothingTo,
  detectWidth,
  meta,
  padEndVisible,
  padStartVisible,
  plural,
  RULES,
  severityMark,
  severityStyle,
  stripAnsi,
  SYMBOLS,
  term,
  type ThemeName,
  verdict,
  visibleWidth,
  wrap,
} from '../index'

const ESC = String.fromCharCode(27)
/** Make escape codes visible in snapshots. */
const show = (s: string): string => s.split(ESC).join('␛')

describe('detectColorLevel', () => {
  it('is plain on a pipe, 16 colours on a TTY, 256 or truecolor when advertised', () => {
    expect(detectColorLevel({}, false)).toBe(0)
    expect(detectColorLevel({}, true)).toBe(1)
    expect(detectColorLevel({ TERM: 'xterm' }, true)).toBe(1)
    expect(detectColorLevel({ COLORTERM: 'truecolor' }, true)).toBe(3)
    expect(detectColorLevel({ COLORTERM: '24bit' }, true)).toBe(3)
    expect(detectColorLevel({ TERM: 'xterm-direct' }, true)).toBe(3)
    expect(detectColorLevel({ WT_SESSION: 'x' }, true)).toBe(3)
    expect(detectColorLevel({ TERM: 'xterm-256color' }, true)).toBe(2)
    expect(detectColorLevel({ TERM: 'tmux-256color' }, true)).toBe(2)
    expect(detectColorLevel({ TERM: 'xterm-256color', COLORTERM: 'truecolor' }, true)).toBe(3)
  })

  it('NO_COLOR, TERM=dumb and FORCE_COLOR=0 turn colour off, even on a TTY', () => {
    expect(detectColorLevel({ NO_COLOR: '1' }, true)).toBe(0)
    expect(detectColorLevel({ NO_COLOR: '1', FORCE_COLOR: '3' }, true)).toBe(0)
    expect(detectColorLevel({ TERM: 'dumb' }, true)).toBe(0)
    expect(detectColorLevel({ FORCE_COLOR: '0' }, true)).toBe(0)
    expect(detectColorLevel({ FORCE_COLOR: 'false' }, true)).toBe(0)
  })

  it('an empty NO_COLOR does not count (no-color.org)', () => {
    expect(detectColorLevel({ NO_COLOR: '' }, true)).toBe(1)
  })

  it('FORCE_COLOR reaches a pipe and is a floor: 2 forces 256, 3 forces truecolor', () => {
    expect(detectColorLevel({ FORCE_COLOR: '1' }, false)).toBe(1)
    expect(detectColorLevel({ FORCE_COLOR: 'true' }, false)).toBe(1)
    expect(detectColorLevel({ FORCE_COLOR: '1', COLORTERM: 'truecolor' }, false)).toBe(3)
    expect(detectColorLevel({ FORCE_COLOR: '2' }, false)).toBe(2)
    expect(detectColorLevel({ FORCE_COLOR: '2' }, true)).toBe(2)
    expect(detectColorLevel({ FORCE_COLOR: '2', COLORTERM: 'truecolor' }, true)).toBe(3)
    expect(detectColorLevel({ FORCE_COLOR: '3' }, false)).toBe(3)
    expect(detectColorLevel({ FORCE_COLOR: '3', TERM: 'xterm-256color' }, true)).toBe(3)
    expect(detectColorLevel({ FORCE_COLOR: '' }, false)).toBe(0)
  })
})

describe('detectWidth', () => {
  it('caps the window at 100 and uses 100 when the stream reports none', () => {
    expect(detectWidth({}, undefined)).toBe(100)
    expect(detectWidth({}, 180)).toBe(100)
    expect(detectWidth({}, 72)).toBe(72)
  })
  it('never lays out narrower than 40', () => {
    expect(detectWidth({}, 20)).toBe(40)
    expect(detectWidth({}, 0)).toBe(100)
  })
  it('PYREON_CLI_WIDTH wins, and a bad value is ignored', () => {
    expect(detectWidth({ PYREON_CLI_WIDTH: '50' }, 200)).toBe(50)
    expect(detectWidth({ PYREON_CLI_WIDTH: 'wide' }, 72)).toBe(72)
  })
})

describe('detectTheme', () => {
  it('defaults to dark', () => {
    expect(detectTheme({})).toBe('dark')
  })
  it('PYREON_CLI_THEME wins', () => {
    expect(detectTheme({ PYREON_CLI_THEME: 'light', COLORFGBG: '15;0' })).toBe('light')
    expect(detectTheme({ PYREON_CLI_THEME: 'DARK', COLORFGBG: '0;15' })).toBe('dark')
  })
  it('reads the background from COLORFGBG', () => {
    expect(detectTheme({ COLORFGBG: '0;15' })).toBe('light')
    expect(detectTheme({ COLORFGBG: '0;7' })).toBe('light')
    expect(detectTheme({ COLORFGBG: '15;0' })).toBe('dark')
    expect(detectTheme({ COLORFGBG: '15;default;8' })).toBe('dark')
    expect(detectTheme({ COLORFGBG: 'default;default' })).toBe('dark')
    expect(detectTheme({ PYREON_CLI_THEME: 'sepia' })).toBe('dark')
  })
})

describe('detectUnicode', () => {
  it('follows the first locale variable that is set', () => {
    expect(detectUnicode({ LANG: 'en_US.UTF-8' }, 'darwin')).toBe(true)
    expect(detectUnicode({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }, 'linux')).toBe(false)
    expect(detectUnicode({ LC_CTYPE: 'C.utf8' }, 'linux')).toBe(true)
    expect(detectUnicode({ LANG: 'POSIX' }, 'linux')).toBe(false)
  })
  it('with no locale, only the Linux console is ASCII', () => {
    expect(detectUnicode({}, 'linux')).toBe(true)
    expect(detectUnicode({ TERM: 'linux' }, 'linux')).toBe(false)
  })
  it('PYREON_CLI_SYMBOLS wins', () => {
    expect(detectUnicode({ PYREON_CLI_SYMBOLS: 'ascii', LANG: 'en_US.UTF-8' }, 'darwin')).toBe(false)
    expect(detectUnicode({ PYREON_CLI_SYMBOLS: 'unicode', LANG: 'C' }, 'linux')).toBe(true)
  })
  it('on Windows, only terminals known to render Unicode', () => {
    expect(detectUnicode({}, 'win32')).toBe(false)
    expect(detectUnicode({ WT_SESSION: 'x' }, 'win32')).toBe(true)
    expect(detectUnicode({ TERM_PROGRAM: 'vscode' }, 'win32')).toBe(true)
    expect(detectUnicode({ TERM: 'xterm' }, 'win32')).toBe(true)
    expect(detectUnicode({ CI: 'true' }, 'win32')).toBe(true)
  })
})

describe('palette', () => {
  it('every role has dark, light and a 16-colour code', () => {
    for (const c of Object.values(CLI_PALETTE)) {
      expect(c.dark).toMatch(/^#[0-9A-F]{6}$/)
      expect(c.light).toMatch(/^#[0-9A-F]{6}$/)
      expect([31, 32, 33, 36, 90]).toContain(c.sgr16)
    }
  })
  it('every symbol has an ASCII fallback', () => {
    for (const [, ascii] of Object.values(SYMBOLS)) {
      expect(ascii).toMatch(/^[\x20-\x7e]+$/)
    }
  })
  it('hexToRgb', () => {
    expect(hexToRgb('#FF5E1A')).toEqual([255, 94, 26])
  })
  it('six rules', () => {
    expect(RULES).toHaveLength(6)
  })
})

describe('createTerm', () => {
  it('detects from the given env when nothing is forced', () => {
    const t = createTerm({ env: { COLORTERM: 'truecolor', COLORFGBG: '0;15', LANG: 'C' }, isTTY: true, platform: 'linux' })
    expect([t.level, t.theme, t.unicode, t.color, t.width]).toEqual([3, 'light', false, true, 100])
    const t256 = createTerm({ env: { TERM: 'xterm-256color', LANG: 'en_US.UTF-8' }, isTTY: true, columns: 58 })
    expect([t256.level, t256.width]).toEqual([2, 58])
  })
  it('the default term never colours a non-TTY test run', () => {
    // vitest's stdout is not a TTY and the gates do not set FORCE_COLOR.
    if (!process.env.FORCE_COLOR) expect(term.level).toBe(0)
  })
  it('emits truecolor per theme, the 256 index per theme, and the 16-colour code', () => {
    const dark = createTerm({ level: 3, theme: 'dark', unicode: true })
    const light = createTerm({ level: 3, theme: 'light', unicode: true })
    const dark256 = createTerm({ level: 2, theme: 'dark', unicode: true })
    const light256 = createTerm({ level: 2, theme: 'light', unicode: true })
    const c16 = createTerm({ level: 1, theme: 'light', unicode: true })
    expect(show(dark.err('x'))).toBe('␛[38;2;248;113;113mx␛[39m')
    expect(show(light.err('x'))).toBe('␛[38;2;185;28;28mx␛[39m')
    expect(show(dark256.err('x'))).toBe('␛[38;5;203mx␛[39m')
    expect(show(light256.err('x'))).toBe('␛[38;5;124mx␛[39m')
    expect(show(dark256.ember('plasma', 'x'))).toBe('␛[38;5;198mx␛[39m')
    expect(show(c16.err('x'))).toBe('␛[31mx␛[39m')
    expect(show(c16.dim('x'))).toBe('␛[90mx␛[39m')
  })
  it('never wraps an empty string', () => {
    expect(createTerm({ level: 3 }).ok('')).toBe('')
    expect(createTerm({ level: 2 }).ok('')).toBe('')
  })
  it('level 0 emits no escape at all, links included', () => {
    const t = createTerm({ level: 0, unicode: true })
    expect(t.bold(t.err('x'))).toBe('x')
    expect(t.link('a', 'file:///a')).toBe('a')
    expect(t.ember('plasma', 'p')).toBe('p')
  })
})

describe('width helpers', () => {
  const t = createTerm({ level: 3, unicode: true })
  it('strip SGR and OSC 8', () => {
    const s = t.link(t.bold(t.info('src/a.ts')), fileUrl('/abs/src/a.ts', 3))
    expect(stripAnsi(s)).toBe('src/a.ts')
    expect(visibleWidth(s)).toBe(8)
    expect(visibleWidth('✓ █░')).toBe(4)
  })
  it('pad by visible width', () => {
    expect(stripAnsi(padEndVisible(t.ok('ab'), 4))).toBe('ab  ')
    expect(stripAnsi(padStartVisible(t.ok('ab'), 4))).toBe('  ab')
    expect(padEndVisible('abcdef', 2)).toBe('abcdef')
  })
  it('fileUrl', () => {
    expect(fileUrl('/a/b.ts')).toBe('file:///a/b.ts')
    expect(fileUrl('/a/b.ts', 4)).toBe('file:///a/b.ts#L4')
  })
})

describe('layout helpers (plain)', () => {
  const t = createTerm({ level: 0, unicode: true })
  it('plural and elapsed', () => {
    expect(plural(1, 'error')).toBe('1 error')
    expect(plural(2, 'error')).toBe('2 errors')
    expect(plural(2, 'entry', 'entries')).toBe('2 entries')
    expect(formatElapsed(6.4)).toBe('6 ms')
    expect(formatElapsed(999)).toBe('999 ms')
    expect(formatElapsed(1400)).toBe('1.4 s')
  })
  it('counts leave out zeros', () => {
    expect(formatCounts(t, { errors: 1, warnings: 5, infos: 2 })).toBe('1 error, 5 warnings, 2 info')
    expect(formatCounts(t, { warnings: 1 })).toBe('1 warning')
    expect(formatCounts(t, {})).toBe('')
  })
  it('meta drops empty parts', () => {
    expect(meta(t, ['a', false, '', null, undefined, 'b'])).toBe(' · a · b')
    expect(meta(t, [])).toBe('')
  })
  it('severity', () => {
    expect(severityStyle('warn').word).toBe('warning')
    expect(severityStyle('warning').symbol).toBe('warn')
    expect(severityMark(t, 'error')).toBe('✗')
  })
  it('columns pad, right-align and trim', () => {
    expect(
      columns(
        [
          ['label', '1', 'x'],
          ['a', '100', ''],
        ],
        { align: ['left', 'right'] },
      ),
    ).toEqual(['  label    1  x', '  a      100'])
  })
  it('columns stack the whole table when a row does not fit, and never cut a cell', () => {
    const path = 'packages/zero/zero/src/routes/blog/[slug]/index.tsx'
    const rows = [
      ['route', 'mode', 'js (gz)'],
      [path, 'ssg', '18.4 kB'],
      ['/', 'spa', ''],
    ]
    expect(columns(rows, { align: ['left', 'left', 'right'], width: 100 })[1]).toBe(`  ${path}  ssg   18.4 kB`)
    expect(columns(rows, { align: ['left', 'left', 'right'], width: 50 })).toEqual([
      '  route',
      '    mode  js (gz)',
      `  ${path}`,
      '    ssg  18.4 kB',
      '  /',
      '    spa',
    ])
  })
  it('interrupted and nothingTo carry a symbol and a word', () => {
    expect(interrupted(t, ['3 of 13 gates', '2.1 s'])).toBe('! interrupted · 3 of 13 gates · 2.1 s')
    expect(nothingTo(t, 'no changed files', 'pass paths: pyreon check src/')).toBe(
      'ℹ no changed files · pass paths: pyreon check src/',
    )
    expect(nothingTo(createTerm({ level: 0, unicode: false }), 'nothing to check')).toBe('i nothing to check')
  })
  it('bar clamps', () => {
    expect(bar(t, 50, 100, 'ok', 4)).toBe('██░░')
    expect(bar(t, 150, 100, 'ok', 4)).toBe('████')
    expect(bar(t, 1, 0, 'ok', 4)).toBe('░░░░')
  })
  it('wrap breaks at spaces only and never splits a path', () => {
    const path = `packages/${'x'.repeat(30)}/src/index.ts`
    expect(wrap(`see ${path} now`, 20, 20, '  ')).toEqual(['see', `  ${path}`, '  now'])
    expect(wrap('a b c', 3)).toEqual(['a b', 'c'])
    expect(wrap('one\ntwo', 100, 100, '>')).toEqual(['one', '>two'])
    expect(wrap('', 10)).toEqual([''])
  })
  it('finding wraps the message with a hanging indent', () => {
    const lines = finding(
      t,
      { severity: 'warning', source: 'lint', message: 'word '.repeat(30).trim(), fix: 'do it' },
      { width: 60 },
    )
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(60)
    expect(lines[1]?.startsWith('     word')).toBe(true)
    expect(lines.at(-1)).toBe('     fix: do it')
  })
  it('location without line', () => {
    expect(formatLocation(t, { path: 'a.ts' })).toBe('a.ts')
    expect(formatLocation(t, { path: 'a.ts', line: 3 })).toBe('a.ts:3')
  })
})

/**
 * Every helper, rendered at every colour level, on both backgrounds, with
 * Unicode and with the ASCII fallback. The snapshot is the contract: a
 * palette or symbol change shows up here as a reviewable diff.
 */
const specimen = (level: ColorLevel, theme: ThemeName, unicode: boolean): string => {
  const t = createTerm({ level, theme, unicode })
  const lines: string[] = []
  lines.push(`roles: ${(Object.keys(CLI_PALETTE) as Array<keyof typeof CLI_PALETTE>).map((r) => t.paint(r, r)).join(' ')}`)
  lines.push(`styles: ${t.bold('bold')} ${t.underline('underline')} ${t.ember('plasma', 'plasma')} ${t.ember('core', 'core')} ${t.ember('warm', 'warm')}`)
  lines.push(`symbols: ${(Object.keys(SYMBOLS) as Array<keyof typeof SYMBOLS>).map((s) => t.sym(s)).join(' ')}`)
  lines.push(`header: ${header(t, 'pyreon doctor', 'project health audit')}`)
  lines.push(`header (bare): ${header(t, 'lathe check')}`)
  lines.push(`counts: ${formatCounts(t, { errors: 1, warnings: 5, infos: 2 })}`)
  lines.push(`verdict ok: ${verdict(t, 'ok', 'built in 3.8 s', ['4 routes', '13 pages prerendered'])}`)
  lines.push(`verdict err: ${verdict(t, 'err', formatCounts(t, { errors: 1, warnings: 2 }))}`)
  lines.push(`verdict none: ${verdict(t, null, 'ready', [formatElapsed(3000)])}`)
  lines.push('columns:')
  lines.push(
    ...columns(
      [
        [t.underline('route'), t.underline('mode'), t.underline('js (gz)')],
        ['/', t.info('ssg'), '18.4 kB'],
        ['/app/*', 'spa', '141.2 kB'],
      ],
      { align: ['left', 'left', 'right'] },
    ),
  )
  lines.push(`bar 94: ${bar(t, 94, 100, 'ok')}`)
  lines.push(`bar 84: ${bar(t, 84, 100, 'warn')}`)
  lines.push('finding:')
  lines.push(
    ...finding(t, {
      severity: 'error',
      source: 'audit-tests',
      message: 'Browser package has no real-Chromium smoke test',
      location: { path: 'packages/ui/src/index.ts', abs: '/repo/packages/ui/src/index.ts' },
      related: [{ path: 'src/a.ts', line: 3, label: 'declared here' }],
      fix: 'add src/tests/ui.browser.test.tsx',
    }),
  )
  lines.push(
    ...finding(t, {
      severity: 'info',
      source: 'lint',
      message: '<For> without `by` recreates every row on reorder',
      location: { path: 'src/routes/inbox.tsx', line: 42, column: 7 },
    }),
  )
  lines.push('frame:')
  lines.push(
    ...frame(t, {
      title: formatLocation(t, { path: 'src/Inbox.tsx', line: 31, column: 9 }),
      lines: ["<canvas> is web-only and won't be emitted for iOS or Android", `${t.dim('hint:')} use <Chart>`],
    }),
  )
  lines.push(...frame(t, { lines: ['untitled'] }, 2))
  return show(lines.join('\n'))
}

describe('specimen snapshots', () => {
  for (const level of [0, 1, 2, 3] as const) {
    for (const theme of ['dark', 'light'] as const) {
      for (const unicode of [true, false]) {
        it(`level ${level} · ${theme} · ${unicode ? 'utf-8' : 'ascii'}`, () => {
          expect(specimen(level, theme, unicode)).toMatchSnapshot()
        })
      }
    }
  }

  it('level 0 output equals the stripped output of every coloured level', () => {
    for (const theme of ['dark', 'light'] as const) {
      const plain = specimen(0, theme, true)
      for (const level of [1, 2, 3] as const) {
        expect(stripAnsi(specimen(level, theme, true).split('␛').join(ESC))).toBe(plain)
      }
    }
  })
})
