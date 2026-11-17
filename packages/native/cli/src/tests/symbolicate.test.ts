/**
 * `pyreon-native symbolicate` — the symbol-selection contract and the CLI
 * surface, then the real tools.
 *
 * The dangerous failure here is not "no output", it is a WRONG stack: R8
 * retrace and atos both print plausible frames for a mapping/dSYM from a
 * different build. So most of these specs pin the SELECTION — the report's
 * own identity (R8 map id, dSYM UUID) picks the file, and a mismatch is an
 * exit-2 refusal — with an injected `exec`, so they run on every OS.
 *
 * The last two blocks drive the real `retrace` (Android SDK) and `atos`
 * (Xcode) where installed. The Android fixture is a real capture: the
 * shipped PyreonCrashReporter.kt, R8-minified, threw an uncaught exception
 * on the JVM and persisted `android-report.json`; `android-mapping.txt` is
 * that R8 run's mapping.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'
import { type Exec, findRetrace, mappingIdOf, parseReport, symbolicate } from '../symbolicate'

const FIXTURES = join(import.meta.dirname, 'fixtures/symbolicate')
const ANDROID_REPORT = readFileSync(join(FIXTURES, 'android-report.json'), 'utf8')
const ANDROID_MAPPING = join(FIXTURES, 'android-mapping.txt')
const MAP_ID = '4fb6658390e9a53fc7014a8e321faf461bc1c2f76c73b2c781725a8a491038fb'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-symbolicate-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Lay out `<dir>/symbols/android/<key>/mapping.txt`. */
function retain(key: string, mapping: string): string {
  const target = join(dir, 'symbols/android', key)
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'mapping.txt'), mapping)

  return join(target, 'mapping.txt')
}

const androidReport = () => {
  const r = parseReport(ANDROID_REPORT)
  if (typeof r === 'string') throw new Error(r)
  return r
}

/** A fake exec that records calls and answers retrace with a canned stack. */
function fakeExec(answer: Partial<Record<string, { status: number; stdout?: string; stderr?: string }>> = {}) {
  const calls: Array<{ command: string; args: readonly string[] }> = []
  const exec: Exec = (command, args) => {
    calls.push({ command, args })
    const key = Object.keys(answer).find((k) => command.endsWith(k))
    const a = key ? answer[key]! : { status: 0, stdout: 'RETRACED\n' }

    return { status: a.status, stdout: a.stdout ?? '', stderr: a.stderr ?? '' }
  }

  return { exec, calls }
}

describe('parseReport', () => {
  it('reads the report object and a once-more JSON-encoded report', () => {
    const obj = parseReport(ANDROID_REPORT)
    expect(typeof obj === 'object' && obj.platform).toBe('android')
    const twice = parseReport(JSON.stringify(ANDROID_REPORT))
    expect(typeof twice === 'object' && twice.build?.mappingId).toBe(MAP_ID)
  })

  it('rejects non-JSON, the old array format, and objects without a platform', () => {
    expect(parseReport('not json')).toMatch(/not JSON/)
    expect(parseReport('["m","s",""]')).toMatch(/older array format/)
    expect(parseReport('{"message":"x"}')).toMatch(/no "platform"/)
    expect(parseReport('null')).toMatch(/no "platform"/)
  })
})

describe('mappingIdOf', () => {
  it('reads pg_map_id from the header, lowercased', () => {
    expect(mappingIdOf(readFileSync(ANDROID_MAPPING, 'utf8'))).toBe(MAP_ID)
    expect(mappingIdOf('# compiler: R8\n# pg_map_id: ABC123\nfoo -> a:\n')).toBe('abc123')
  })

  it('stops at the first mapping line — an id further down is not the header', () => {
    expect(mappingIdOf('foo -> a:\n# pg_map_id: abc\n')).toBe('')
    expect(mappingIdOf('')).toBe('')
  })
})

describe('symbolicate — android', () => {
  it('finds the retained mapping by the R8 map id the frames carry, and runs retrace on the stack', () => {
    // Filed under a key that does NOT match the report's version: only the
    // content (pg_map_id) can find it.
    const mapping = retain('renamed', readFileSync(ANDROID_MAPPING, 'utf8'))
    retain('other', '# pg_map_id: 1234567\nfoo -> a:\n')
    const { exec, calls } = fakeExec()
    const r = symbolicate(androidReport(), { symbols: join(dir, 'symbols'), exec, retrace: '/sdk/retrace' })
    expect(r).toEqual({ ok: true, stack: 'RETRACED', symbolsFile: mapping, tool: '/sdk/retrace' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.command).toBe('/sdk/retrace')
    expect(calls[0]!.args[0]).toBe(mapping)
  })

  it('falls back to symbols/android/<version>-<buildNumber>/ when the report names no map id', () => {
    const mapping = retain('1.4.0-42', 'foo -> a:\n')
    const report = { platform: 'android', stack: 'java.lang.Error: x\n\tat a.a(Unknown Source)', build: { version: '1.4.0', buildNumber: '42' } }
    const r = symbolicate(report, { symbols: join(dir, 'symbols'), exec: fakeExec().exec, retrace: 'retrace' })
    expect(r.ok && r.symbolsFile).toBe(mapping)
  })

  it('uses the map id in the stack when the report field is missing (older report)', () => {
    const mapping = retain('x', readFileSync(ANDROID_MAPPING, 'utf8'))
    const report = { ...androidReport(), build: {} }
    const r = symbolicate(report, { symbols: join(dir, 'symbols'), exec: fakeExec().exec, retrace: 'retrace' })
    expect(r.ok && r.symbolsFile).toBe(mapping)
  })

  it('refuses a mapping from a different build instead of printing a wrong stack', () => {
    const wrong = join(dir, 'wrong.txt')
    writeFileSync(wrong, '# pg_map_id: 1234567\nfoo -> a:\n')
    const { exec, calls } = fakeExec()
    const r = symbolicate(androidReport(), { mapping: wrong, exec, retrace: 'retrace' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/different build \(pg_map_id 1234567; the report's frames name 4fb6658390e9\)/)
    expect(calls).toHaveLength(0)
  })

  it('accepts an explicit --mapping whose id matches, including a truncated id', () => {
    const short = join(dir, 'short.txt')
    writeFileSync(short, `# pg_map_id: ${MAP_ID.slice(0, 7)}\nfoo -> a:\n`)
    const r = symbolicate(androidReport(), { mapping: short, exec: fakeExec().exec, retrace: 'retrace' })
    expect(r.ok).toBe(true)
  })

  it('errors clearly when nothing is retained, a --mapping is missing, or the stack is empty', () => {
    const none = symbolicate(androidReport(), { symbols: join(dir, 'nowhere'), exec: fakeExec().exec, retrace: 'r' })
    expect(!none.ok && none.error).toMatch(/no retained R8 mapping matches this report \(pg_map_id 4fb6658390e9, version 1\.4\.0-42\)/)
    expect(!none.ok && none.fix).toMatch(/symbols\/android\/<version>-<buildNumber>\/mapping\.txt/)

    const debug = symbolicate({ platform: 'android', stack: 'java.lang.Error\n\tat Foo.bar(Foo.kt:3)' }, { symbols: join(dir, 'nowhere'), exec: fakeExec().exec, retrace: 'r' })
    expect(!debug.ok && debug.error).not.toMatch(/\(/)
    expect(!debug.ok && debug.fix).toMatch(/unminified \(debug\) build/)

    const missing = symbolicate(androidReport(), { mapping: join(dir, 'nope.txt'), exec: fakeExec().exec, retrace: 'r' })
    expect(!missing.ok && missing.error).toMatch(/--mapping .*nope\.txt does not exist/)

    const empty = symbolicate({ platform: 'android', stack: '  ' }, {})
    expect(!empty.ok && empty.error).toBe('the report has an empty stack')
  })

  it('reports a retrace failure with its first stderr line', () => {
    retain('x', readFileSync(ANDROID_MAPPING, 'utf8'))
    const { exec } = fakeExec({ retrace: { status: 1, stderr: '\nError: Unable to parse mapping file\nat …' } })
    const r = symbolicate(androidReport(), { symbols: join(dir, 'symbols'), exec, retrace: 'retrace' })
    expect(!r.ok && r.error).toBe('retrace failed: Error: Unable to parse mapping file')
    const silent = symbolicate(androidReport(), { symbols: join(dir, 'symbols'), exec: fakeExec({ retrace: { status: 3 } }).exec, retrace: 'retrace' })
    expect(!silent.ok && silent.error).toBe('retrace failed: exit 3')
  })

  it('says how to install retrace when none is found', () => {
    retain('x', readFileSync(ANDROID_MAPPING, 'utf8'))
    const r = symbolicate(androidReport(), { symbols: join(dir, 'symbols'), exec: fakeExec().exec, env: { HOME: dir, PATH: '' }, hostPlatform: 'linux' })
    expect(!r.ok && r.error).toBe('R8 retrace was not found')
    expect(!r.ok && r.fix).toMatch(/cmdline-tools;latest/)
  })
})

describe('findRetrace', () => {
  const sdkWith = (root: string, exe: string) => {
    mkdirSync(join(root, 'cmdline-tools/latest/bin'), { recursive: true })
    writeFileSync(join(root, 'cmdline-tools/latest/bin', exe), '')
    return join(root, 'cmdline-tools/latest/bin', exe)
  }

  it('prefers --retrace, then $PYREON_RETRACE', () => {
    expect(findRetrace('/x/retrace', { PYREON_RETRACE: '/y' }, 'linux')).toBe('/x/retrace')
    expect(findRetrace(undefined, { PYREON_RETRACE: '/y' }, 'linux')).toBe('/y')
  })

  it('looks in ANDROID_HOME / ANDROID_SDK_ROOT, then the default SDK location per OS', () => {
    expect(findRetrace(undefined, { ANDROID_HOME: join(dir, 'none'), ANDROID_SDK_ROOT: join(dir, 'sdk1'), PATH: '' }, 'linux')).toBeUndefined()
    const viaRoot = sdkWith(join(dir, 'sdk1'), 'retrace')
    expect(findRetrace(undefined, { ANDROID_SDK_ROOT: join(dir, 'sdk1'), PATH: '' }, 'linux')).toBe(viaRoot)
    const mac = sdkWith(join(dir, 'Library/Android/sdk'), 'retrace')
    expect(findRetrace(undefined, { HOME: dir, PATH: '' }, 'darwin')).toBe(mac)
    const linux = sdkWith(join(dir, 'Android/Sdk'), 'retrace')
    expect(findRetrace(undefined, { HOME: dir, PATH: '' }, 'linux')).toBe(linux)
    const win = sdkWith(join(dir, 'Local/Android/Sdk'), 'retrace.bat')
    expect(findRetrace(undefined, { HOME: dir, LOCALAPPDATA: join(dir, 'Local'), PATH: '' }, 'win32')).toBe(win)
  })

  it('falls back to PATH', () => {
    mkdirSync(join(dir, 'bin'))
    writeFileSync(join(dir, 'bin/retrace'), '')
    expect(findRetrace(undefined, { HOME: join(dir, 'home'), PATH: `:${join(dir, 'bin')}` }, 'linux')).toBe(join(dir, 'bin/retrace'))
  })
})

describe('symbolicate — ios', () => {
  const UUID = '9737998D-1B9F-3CBB-9F34-6031884C6A34'
  const iosReport = (over: Record<string, unknown> = {}) => ({
    platform: 'ios',
    message: 'NSInvalidArgumentException: boom',
    build: { appId: 'com.example', version: '1.0', buildNumber: '7' },
    image: { name: 'Shop', uuid: UUID.toLowerCase(), loadAddress: '0x1029d4000', arch: 'arm64' },
    addresses: ['0x18aa371e4', '0x1029d81dc'],
    ...over,
  })
  /** `<dir>/symbols/ios/<key>/<name>.app.dSYM` (an empty bundle; dwarfdump is faked). */
  const dsymAt = (key: string, name = 'Shop') => {
    const p = join(dir, 'symbols/ios', key, `${name}.app.dSYM`)
    mkdirSync(p, { recursive: true })
    return p
  }
  const dwarfdump = (uuidFor: Record<string, string>): Exec => (command, args) => {
    if (command === 'dwarfdump') {
      const path = args[1]!
      const uuid = Object.entries(uuidFor).find(([k]) => path.endsWith(k))?.[1]
      if (!uuid) return { status: 1, stdout: '', stderr: 'not a dSYM' }

      return { status: 0, stdout: `UUID: ${uuid} (arm64) ${path}/Contents/Resources/DWARF/Shop\n`, stderr: '' }
    }
    // atos: resolve the in-image call site, echo the system one.
    return { status: 0, stdout: '0x18aa371e3\nCheckoutService.rejectCode(_:) (in Shop) (main.swift:13)\n', stderr: '' }
  }

  it('picks the dSYM whose UUID matches the report and runs atos on the call sites', () => {
    dsymAt('1.0-6')
    const right = dsymAt('1.0-7')
    const calls: Array<readonly string[]> = []
    const base = dwarfdump({ '1.0-6/Shop.app.dSYM': '00000000-0000-0000-0000-000000000000', '1.0-7/Shop.app.dSYM': UUID })
    const exec: Exec = (c, a) => {
      if (c === 'atos') calls.push(a)
      return base(c, a)
    }
    const r = symbolicate(iosReport(), { symbols: join(dir, 'symbols'), exec, hostPlatform: 'darwin' })
    expect(r.ok && r.symbolsFile).toBe(right)
    // Return address - 1: the call instruction's line, not the next one.
    expect(calls[0]).toEqual(['-arch', 'arm64', '-o', `${right}/Contents/Resources/DWARF/Shop`, '-l', '0x1029d4000', '0x18aa371e3', '0x1029d81db'])
    expect(r.ok && r.stack).toBe(
      'NSInvalidArgumentException: boom\n0   0x18aa371e4 (outside Shop)\n1   CheckoutService.rejectCode(_:) (in Shop) (main.swift:13)',
    )
  })

  it('refuses an explicit --dsym from a different build, and a missing one', () => {
    const wrong = dsymAt('old')
    const r = symbolicate(iosReport(), { dsym: wrong, exec: dwarfdump({ 'old/Shop.app.dSYM': '11111111-1111-1111-1111-111111111111' }), hostPlatform: 'darwin' })
    expect(!r.ok && r.error).toMatch(/different build \(UUID 11111111-1111-1111-1111-111111111111; the report's image is 9737998D/)
    const unreadable = symbolicate(iosReport(), { dsym: wrong, exec: dwarfdump({}), hostPlatform: 'darwin' })
    expect(!unreadable.ok && unreadable.error).toMatch(/UUID unreadable/)
    const missing = symbolicate(iosReport(), { dsym: join(dir, 'nope.dSYM'), exec: dwarfdump({}), hostPlatform: 'darwin' })
    expect(!missing.ok && missing.error).toMatch(/--dsym .*nope\.dSYM does not exist/)
  })

  it('accepts a matching explicit --dsym', () => {
    const p = dsymAt('k')
    const r = symbolicate(iosReport(), { dsym: p, exec: dwarfdump({ 'k/Shop.app.dSYM': UUID }), hostPlatform: 'darwin' })
    expect(r.ok).toBe(true)
  })

  it('errors when no retained dSYM matches, off macOS, and for a report without image fields', () => {
    const none = symbolicate(iosReport(), { symbols: join(dir, 'symbols'), exec: dwarfdump({}), hostPlatform: 'darwin' })
    expect(!none.ok && none.error).toBe(`no retained dSYM has UUID ${UUID} (version 1.0-7) under ${join(dir, 'symbols/ios')}`)
    const noBuild = symbolicate(iosReport({ build: undefined }), { symbols: join(dir, 'symbols'), exec: dwarfdump({}), hostPlatform: 'darwin' })
    expect(!noBuild.ok && noBuild.error).not.toMatch(/version/)
    const linux = symbolicate(iosReport(), { hostPlatform: 'linux' })
    expect(!linux.ok && linux.error).toMatch(/only with Xcode on macOS/)
    const malformed = symbolicate(iosReport({ addresses: ['0x1', ''] }), { hostPlatform: 'darwin' })
    expect(!malformed.ok && malformed.error).toBe('the report holds a malformed address ""')
    const bare = symbolicate({ platform: 'ios', stack: 'x' }, { hostPlatform: 'darwin' })
    expect(!bare.ok && bare.error).toMatch(/no image UUID/)
  })

  it('reports an atos failure', () => {
    const p = dsymAt('k')
    const base = dwarfdump({ 'k/Shop.app.dSYM': UUID })
    const exec: Exec = (c, a) => (c === 'atos' ? { status: 1, stdout: '', stderr: 'atos: bad arch' } : base(c, a))
    const r = symbolicate(iosReport({ image: { name: 'Shop', uuid: UUID, loadAddress: '0x1', arch: '' } }), { dsym: p, exec, hostPlatform: 'darwin' })
    expect(!r.ok && r.error).toBe('atos failed: atos: bad arch')
    const silent: Exec = (c, a) => (c === 'atos' ? { status: 2, stdout: '', stderr: '' } : base(c, a))
    const r2 = symbolicate(iosReport(), { dsym: p, exec: silent, hostPlatform: 'darwin' })
    expect(!r2.ok && r2.error).toBe('atos failed: exit 2')
  })
})

describe('symbolicate — other platforms', () => {
  it('sends web reports to source maps and rejects unknown platforms', () => {
    const web = symbolicate({ platform: 'web', stack: 'x' })
    expect(!web.ok && web.error).toMatch(/source maps/)
    const odd = symbolicate({ platform: 'tvos' })
    expect(!odd.ok && odd.error).toBe('unknown report platform "tvos"')
  })
})

describe('pyreon-native symbolicate (CLI)', () => {
  const run = (argv: string[]) => {
    const out: string[] = []
    const err: string[] = []
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => void out.push(String(m)))
    vi.spyOn(console, 'error').mockImplementation((m: unknown) => void err.push(String(m)))
    const code = main(argv)
    vi.restoreAllMocks()

    return { code, out: out.join('\n'), err: err.join('\n') }
  }

  it('exits 1 without a report file, for a missing file, and for an unreadable report', () => {
    expect(run(['symbolicate']).code).toBe(1)
    const missing = run(['symbolicate', join(dir, 'nope.json')])
    expect(missing.code).toBe(1)
    expect(missing.err).toMatch(/report file not found/)
    writeFileSync(join(dir, 'bad.json'), '["m","s",""]')
    const bad = run(['symbolicate', join(dir, 'bad.json')])
    expect(bad.code).toBe(1)
    expect(bad.err).toMatch(/older array format/)
  })

  it('exits 2 with the reason and the fix when the symbols are not there', () => {
    writeFileSync(join(dir, 'r.json'), ANDROID_REPORT)
    const r = run(['symbolicate', join(dir, 'r.json'), `--symbols=${join(dir, 'empty')}`, '--retrace', 'retrace'])
    expect(r.code).toBe(2)
    expect(r.err).toMatch(/no retained R8 mapping/)
    expect(r.err).toMatch(/fix:/)
    expect(r.out).toBe('')
  })

  it('prints the readable stack on stdout and the provenance on stderr', () => {
    writeFileSync(join(dir, 'r.json'), ANDROID_REPORT)
    retain('1.4.0-42', readFileSync(ANDROID_MAPPING, 'utf8'))
    // A stand-in retrace that echoes its stack file — the CLI plumbing is
    // what is under test here; the real tool is driven below.
    const fake = join(dir, 'fake-retrace')
    writeFileSync(fake, '#!/bin/sh\ncat "$2" | sed s/b.a.a/RETRACED/\n', { mode: 0o755 })
    const r = run(['symbolicate', join(dir, 'r.json'), `--symbols=${join(dir, 'symbols')}`, `--retrace=${fake}`])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/at RETRACED\(r8-map-id-/)
    expect(r.err).toMatch(/symbolicated with .*1\.4\.0-42\/mapping\.txt \(R8 retrace\)/)
  })

  it('reports a retrace that cannot be spawned (the real exec path)', () => {
    writeFileSync(join(dir, 'r.json'), ANDROID_REPORT)
    retain('1.4.0-42', readFileSync(ANDROID_MAPPING, 'utf8'))
    const r = run(['symbolicate', join(dir, 'r.json'), `--symbols=${join(dir, 'symbols')}`, `--retrace=${join(dir, 'no-such-retrace')}`])
    expect(r.code).toBe(2)
    expect(r.err).toMatch(/could not run\s[\s\S]*ENOENT/)
    expect(r.err).toMatch(/pass --retrace=<path>/)
  })

  it('lists symbolicate in --help', () => {
    const r = run(['--help'])
    expect(r.out).toMatch(/pyreon-native symbolicate <report\.json>/)
  })
})

// ── Real tools ────────────────────────────────────────────────────────────

const realRetrace = findRetrace(undefined, process.env, process.platform)
const javaWorks = spawnSync('java', ['-version'], { encoding: 'utf8' }).status === 0

describe.runIf(realRetrace !== undefined && javaWorks)('real R8 retrace', () => {
  it('turns the R8-minified capture back into the original classes, methods and lines', () => {
    const symbols = join(dir, 'symbols')
    retain('1.4.0-42', readFileSync(ANDROID_MAPPING, 'utf8'))
    const r = symbolicate(androidReport(), { symbols })
    expect(r.ok).toBe(true)
    // The capture reads `at b.a.a(r8-map-id-…:3)`; R8 also inlined
    // rejectCode into applyDiscount, and retrace restores both frames.
    expect(androidReport().stack).toMatch(/at b\.a\.a\(r8-map-id-/)
    expect(r.ok && r.stack).toBe(
      [
        'java.lang.IllegalStateException: discount code rejected: SAVE10',
        '\tat com.example.shop.CheckoutService.rejectCode(ProofApp.kt:15)',
        '\tat com.example.shop.CheckoutService.applyDiscount(ProofApp.kt:11)',
        '\tat com.example.shop.ProofAppKt.main(ProofApp.kt:26)',
      ].join('\n'),
    )
  })
})

const hasXcode =
  process.platform === 'darwin' &&
  ['swiftc', 'atos', 'dwarfdump'].every((t) => spawnSync('xcrun', ['--find', t], { encoding: 'utf8' }).status === 0)

describe.runIf(hasXcode)('real atos against a real dSYM', () => {
  it('resolves a stripped binary address to the Swift function and line', () => {
    const src = join(dir, 'Shop.swift')
    writeFileSync(
      src,
      [
        '@inline(never) func rejectCode(_ code: String) -> Int {',
        '    if code.isEmpty { return 0 }',
        '    return code.count * 3',
        '}',
        'print(rejectCode(CommandLine.arguments.last ?? ""))',
        '',
      ].join('\n'),
    )
    const bin = join(dir, 'Shop')
    const built = spawnSync('swiftc', ['-g', '-Onone', src, '-o', bin], { encoding: 'utf8' })
    expect(built.status, built.stderr).toBe(0)
    expect(existsSync(`${bin}.dSYM`)).toBe(true)
    // Unslid addresses: load address = the __TEXT vmaddr, the function's
    // address from the (unstripped) symbol table before stripping.
    const nm = spawnSync('nm', [bin], { encoding: 'utf8' }).stdout
    const line = nm.split('\n').find((l) => /rejectCode/.test(l) && / [tT] /.test(l))!
    const fn = BigInt(`0x${line.split(' ')[0]}`)
    spawnSync('strip', ['-x', bin])
    const uuid = /UUID: (\S+)/.exec(spawnSync('dwarfdump', ['--uuid', bin], { encoding: 'utf8' }).stdout)![1]!
    const symbols = join(dir, 'symbols/ios/1.0-1')
    mkdirSync(symbols, { recursive: true })
    cpSync(`${bin}.dSYM`, join(symbols, 'Shop.app.dSYM'), { recursive: true })

    const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
    const r = symbolicate(
      {
        platform: 'ios',
        image: { name: 'Shop', uuid, loadAddress: '0x100000000', arch },
        // fn + 8 + 1: a "return address" inside the function body.
        addresses: [`0x${(fn + 9n).toString(16)}`, '0x7fff0000'],
      },
      { symbols: join(dir, 'symbols') },
    )
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    expect(r.ok && r.stack).toMatch(/^0 {3}rejectCode\(_:\) \(in Shop\) \(Shop\.swift:\d+\)$/m)
    expect(r.ok && r.stack).toMatch(/^1 {3}0x7fff0000 \(outside Shop\)$/m)
  })
})
