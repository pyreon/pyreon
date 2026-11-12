/**
 * The human output of `pyreon-native` in the shared terminal theme, as a
 * specimen per terminal: colour level 0 / 1 / 2, dark and light, Unicode
 * and ASCII. ESC is made visible as `␛` so the snapshot shows exactly what
 * reaches the terminal. Data is fixed (paths under `/app`, fixed timings);
 * the CLI-level specs prove the real commands feed these renderers.
 */
import { describe, expect, it } from 'vitest'
import type { CheckResult } from '../check'
import {
  buildAllVerdict,
  buildHeader,
  buildTargetLines,
  checkHeader,
  checkReport,
  commandHeader,
  devHeader,
  devVerdict,
  devWarnings,
  displayPath,
  failure,
  flowContext,
  joinLines,
  mergeFindings,
  okVerdict,
  outFor,
  type Out,
  type RenderOptions,
  stepDetail,
  stepRow,
  warningLine,
  wireReport,
} from '../render'

const ESC = String.fromCharCode(27)
const visible = (s: string): string => s.split(ESC).join('␛')

const CHECK: CheckResult = {
  filesChecked: 3,
  skippedWebEntries: ['/app/src/entry.tsx'],
  errorCount: 3,
  warningCount: 2,
  findings: [
    {
      file: '/app/src/Broken.tsx',
      target: 'swift',
      kind: 'error',
      message: '/app/src/Broken.tsx:1:42: Unexpected token',
      position: { line: 1, column: 42 },
    },
    {
      file: '/app/src/Broken.tsx',
      target: 'kotlin',
      kind: 'error',
      message: '/app/src/Broken.tsx:1:42: Unexpected token',
      position: { line: 1, column: 42 },
    },
    {
      file: '/app/src/Inbox.tsx',
      target: 'swift',
      kind: 'warning',
      message: '<canvas> is web-only and is not emitted for iOS or Android',
    },
    {
      file: '/app/src/Inbox.tsx',
      target: 'kotlin',
      kind: 'warning',
      message: '<canvas> is web-only and is not emitted for iOS or Android',
    },
    {
      file: '/app/src/Typed.tsx',
      target: 'swift',
      kind: 'typecheck-error',
      message: '/tmp/x.swift:3:5: error: cannot convert value of type String to Int',
      position: { line: 3, column: 5 },
    },
    {
      file: '/app/src/Router.tsx',
      target: 'swift',
      kind: 'typecheck-skipped',
      message: 'references PyreonRuntime/PyreonRouter — type-check skipped (module not on search path)',
    },
  ],
}

const CLEAN: CheckResult = { filesChecked: 2, skippedWebEntries: [], errorCount: 0, warningCount: 0, findings: [] }

function specimen(o: Out): string {
  const t = o.t
  const sections: string[] = []
  const add = (title: string, text: string) => sections.push(`── ${title}\n${text}`)

  add(
    'check',
    joinLines([
      ...checkHeader(o, { source: '/app/src', targets: ['swift', 'kotlin'], typecheck: true }),
      ...checkReport(o, CHECK, { source: '/app/src', targets: ['swift', 'kotlin'], typecheck: true, elapsedMs: 13 }),
    ]),
  )
  add(
    'check --watch (clean)',
    joinLines([
      ...checkHeader(o, { source: '/app/src', targets: ['swift'], watching: true }),
      ...checkReport(o, CLEAN, { source: '/app/src', targets: ['swift'], watching: true, elapsedMs: 4 }),
    ]),
  )
  const warnings = [{ file: '/app/src/Inbox.tsx', warning: '<canvas> is web-only and is not emitted for iOS or Android' }]
  add(
    'build',
    joinLines([
      ...buildHeader(o, { platforms: 'ios', source: '/app/src', out: '/app/generated' }),
      ...buildTargetLines(
        o,
        { target: 'swift', outDir: '/app/generated', filesCompiled: 12, warnings, skippedWebEntries: ['/app/src/entry.tsx'], elapsedMs: 41 },
        false,
      ),
    ]),
  )
  add(
    'build --target=all (one fails)',
    joinLines([
      ...buildHeader(o, { platforms: 'ios + android', source: '/app/src', out: '/app/generated' }),
      ...buildTargetLines(
        o,
        { target: 'swift', outDir: '/app/generated/ios', filesCompiled: 12, warnings, skippedWebEntries: [], elapsedMs: 1400 },
        true,
      ),
      ...buildTargetLines(
        o,
        {
          target: 'kotlin',
          outDir: '/app/generated/android',
          filesCompiled: 0,
          warnings: [],
          skippedWebEntries: [],
          elapsedMs: 3,
          error: '/app/src/Broken.tsx:1:42: Unexpected token',
        },
        true,
      ),
      ...buildAllVerdict(
        o,
        [
          { target: 'swift', outDir: '', filesCompiled: 12, warnings, skippedWebEntries: [], elapsedMs: 1400 },
          { target: 'kotlin', outDir: '', filesCompiled: 0, warnings: [], skippedWebEntries: [], elapsedMs: 3, error: 'x' },
        ],
        1410,
      ),
    ]),
  )
  add(
    'assets',
    joinLines([
      ...commandHeader(o, 'assets', flowContext(o, 'ios', '/app/assets', '/app/ios')),
      okVerdict(o, `materialized 4 assets (9 files) ${t.sym('arrow')} ios`, 22),
    ]),
  )
  add(
    'stage-web',
    joinLines([
      ...commandHeader(o, 'stage-web', flowContext(o, 'android', '/app/web', '/app/android/app/src/main')),
      ...warningLine(o, "skipped nested directory 'img' (flat-only v1)"),
      { to: 'log', text: '' },
      okVerdict(o, `staged 3 web-bundle files ${t.sym('arrow')} android/app/src/main/assets`, 5, ['1 warning']),
    ]),
  )
  add('failure', joinLines(failure(o, 'assets', "[Pyreon] assets: source directory '/app/nope' does not exist", 1)))
  add(
    'wire',
    joinLines(
      wireReport(o, {
        appDir: '/app',
        androidSrcDirs: ['/app/node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin'],
        iosSpmPackages: [{ module: 'PyreonRuntime', path: '/app/node_modules/@pyreon/native-runtime-swift' }],
        iosTargetSources: [{ module: 'Feat', dirs: ['/app/node_modules/feat/native/swift'] }],
        brokenDeclarations: [{ package: '@acme/gone', target: 'kotlin', dir: '/app/node_modules/@acme/gone/native/kotlin' }],
        list: true,
        elapsedMs: 3,
      }),
    ),
  )
  add(
    'wire --android-out --ios-out',
    joinLines(
      wireReport(o, {
        appDir: '/app',
        androidSrcDirs: ['a', 'b'],
        iosSpmPackages: [],
        iosTargetSources: [],
        brokenDeclarations: [],
        androidOut: '/app/android/srcdirs.txt',
        ios: { dir: '/app/ios', staged: 1, linked: 2 },
        list: false,
        elapsedMs: 2,
      }),
    ),
  )
  const W = 'run scripts/build-ios.sh'.length
  add(
    'dev',
    [
      devHeader(t, 'iOS · Demo (com.example.Demo)'),
      '',
      ...devWarnings(o, 'swift', warnings),
      stepRow(t, { label: 'compile shared source', status: 'ok', elapsedMs: 6, note: '12 files' }, W),
      stepRow(t, { label: 'device', status: 'ok', elapsedMs: 120, note: 'IPHONE-16' }, W),
      stepRow(t, { label: 'run scripts/build-ios.sh', status: 'ok', elapsedMs: 400 }, W),
      stepRow(t, { label: 'build + install', status: 'ok', elapsedMs: 2100 }, W),
      stepRow(t, { label: 'launch', status: 'ok', elapsedMs: 500 }, W),
      '',
      devVerdict(t, 'ok', 'ready in 3.1 s', ['app relaunched', 'in-memory state reset']),
      stepRow(t, { label: 'build + install', status: 'skip' }, W),
      devVerdict(t, 'ok', 'up to date in 5 ms', ['emitted code is unchanged, native build skipped']),
      stepRow(t, { label: 'build + install', status: 'err', elapsedMs: 900 }, W),
      ...stepDetail(t, 'xcodebuild failed (exit 65)\nerror: boom'),
      devVerdict(t, 'err', 'failed after 0.9 s', ['the next save retries']),
    ].join('\n'),
  )
  return visible(sections.join('\n\n'))
}

const VARIANTS: Array<[string, RenderOptions]> = [
  ['level 0 (NO_COLOR)', { color: 0, theme: 'dark', unicode: true }],
  ['level 1 (16 colours)', { color: 1, theme: 'dark', unicode: true }],
  ['level 2 dark', { color: 2, theme: 'dark', unicode: true }],
  ['level 2 light', { color: 2, theme: 'light', unicode: true }],
  ['level 3 dark', { color: 3, theme: 'dark', unicode: true }],
  ['level 3 light', { color: 3, theme: 'light', unicode: true }],
  ['level 0 ASCII', { color: 0, theme: 'dark', unicode: false }],
]

describe('human output specimen', () => {
  for (const [name, opts] of VARIANTS) {
    it(name, () => {
      expect(specimen(outFor({ ...opts, cwd: '/app' }))).toMatchSnapshot()
    })
  }

  it('level 0 carries no escape at all, links included', () => {
    expect(specimen(outFor({ color: 0, cwd: '/app' }))).not.toContain('␛')
  })
})

describe('render details', () => {
  it('merges a finding that is identical on both targets and keeps the target-specific ones apart', () => {
    const merged = mergeFindings(CHECK.findings)
    expect(merged.map((f) => [f.kind, f.targets.join('+')])).toEqual([
      ['error', 'swift+kotlin'],
      ['warning', 'swift+kotlin'],
      ['typecheck-error', 'swift'],
      ['typecheck-skipped', 'swift'],
    ])
    // The duplicated `<file>:<line>:<col>: ` prefix moves to the ↳ line.
    expect(merged[0]!.message).toBe('Unexpected token')
    // A position that is not the file's own (swiftc's temp file) stays in the message.
    expect(merged[2]!.message).toContain('/tmp/x.swift:3:5')
  })

  it('errors go to stderr, warnings and skips to the warn channel, header and verdict to stdout', () => {
    const o = outFor({ color: 0, cwd: '/app' })
    const lines = checkReport(o, CHECK, { source: '/app/src', targets: ['swift', 'kotlin'], elapsedMs: 1 })
    const on = (to: string) => lines.filter((l) => l.to === to).map((l) => l.text).join('\n')
    expect(on('error')).toContain('✗ error · swift + kotlin · Unexpected token')
    expect(on('error')).toContain('✗ type error · swift · ')
    expect(on('warn')).toContain('! warning · swift + kotlin · ')
    expect(on('warn')).toContain('ℹ skipped · swift · ')
    expect(lines.at(-1)).toEqual({ to: 'log', text: expect.stringMatching(/^✗ 3 errors, 2 warnings · 3 files checked · /) })
  })

  it('never truncates a path: one outside cwd is shown whole', () => {
    expect(displayPath('/elsewhere/deep/file.tsx', '/app')).toBe('/elsewhere/deep/file.tsx')
    expect(displayPath('/app/src/a.tsx', '/app')).toBe('src/a.tsx')
    expect(displayPath('/app', '/app')).toBe('.')
    expect(displayPath('relative/x.tsx', '/app')).toBe('relative/x.tsx')
  })

  it('a build error without a leading location prints the message alone', () => {
    const o = outFor({ color: 0, cwd: '/app' })
    const text = joinLines(
      buildTargetLines(
        o,
        { target: 'swift', outDir: '/app/out', filesCompiled: 0, warnings: [], skippedWebEntries: [], elapsedMs: 2, error: 'boom' },
        false,
      ),
    )
    expect(text).toBe('✗ build failed · 2 ms\n  boom')
  })

  it('a clean single-target build is one verdict line', () => {
    const o = outFor({ color: 0, cwd: '/app' })
    const lines = buildTargetLines(
      o,
      { target: 'kotlin', outDir: '/app/out', filesCompiled: 1, warnings: [], skippedWebEntries: [], elapsedMs: 1200 },
      false,
    )
    expect(joinLines(lines)).toBe('✓ compiled 1 file → out · 1.2 s')
  })

  it('a wire run with nothing broken and no co-located sources says so in its verdict', () => {
    const o = outFor({ color: 0, cwd: '/app' })
    const text = joinLines(
      wireReport(o, {
        appDir: '/app',
        androidSrcDirs: [],
        iosSpmPackages: [],
        iosTargetSources: [],
        brokenDeclarations: [],
        list: true,
        elapsedMs: 1,
      }),
    )
    expect(text.split('\n').at(-1)).toBe('✓ resolved native sources · 0 Android srcDirs · 0 SwiftPM packages · 1 ms')
  })
})
