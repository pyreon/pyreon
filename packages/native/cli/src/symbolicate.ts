// `pyreon-native symbolicate` — turn a captured crash report back into a
// readable stack.
//
// A release build's stack is unreadable by design: R8 renames Android classes
// and methods (`at a.a.a(r8-map-id-…:1)`), and an iOS release binary yields
// bare return addresses. What reverses either is the symbol artifact of THE
// EXACT BUILD that crashed — R8's `mapping.txt`, the archive's dSYM — and the
// standard tool for each: R8 `retrace` (Android SDK cmdline-tools, any OS) and
// `atos` (Xcode, macOS only). This module only picks the right artifact and
// drives those tools; it reimplements neither.
//
// Picking the right artifact is the part that matters. Run retrace or atos
// against another build's symbols and they print a plausible, WRONG stack —
// so the report's own identity (`build.mappingId` = the R8 `pg_map_id` the
// frames name; `image.uuid` = the dSYM's UUID) is checked against the
// artifact, and a mismatch is an error, never a silent best effort.
//
// Where the artifacts come from: release builds retain them under one
// `symbols/` directory (`symbols/android/<version>-<buildNumber>/mapping.txt`,
// `symbols/ios/<version>-<buildNumber>/<App>.app.dSYM`) — see the scaffold's
// Gradle block and iOS archive script. `--symbols` points at that directory.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

/** The fields of a `useCrashReporter` report this command reads. */
export interface NativeCrashReport {
  platform: string
  message?: string
  stack?: string
  build?: { appId?: string; version?: string; buildNumber?: string; mappingId?: string }
  image?: { name?: string; uuid?: string; loadAddress?: string; arch?: string }
  addresses?: string[]
}

export interface ExecResult {
  status: number | null
  stdout: string
  stderr: string
}

/** Injected for tests; the default spawns the real tool. */
export type Exec = (command: string, args: readonly string[]) => ExecResult

export interface SymbolicateOptions {
  /** Root of the retained symbols (`symbols/` by default). */
  symbols?: string | undefined
  /** Android: an explicit `mapping.txt` (overrides the `--symbols` lookup). */
  mapping?: string | undefined
  /** iOS: an explicit `.dSYM` bundle (overrides the `--symbols` lookup). */
  dsym?: string | undefined
  /** Android: the `retrace` executable (default: found in the Android SDK). */
  retrace?: string | undefined
  exec?: Exec
  /** `process.platform` — injectable so the macOS-only branch is testable anywhere. */
  hostPlatform?: NodeJS.Platform
  env?: Record<string, string | undefined>
}

export type SymbolicateResult =
  | { ok: true; stack: string; symbolsFile: string; tool: string }
  | { ok: false; error: string; fix: string }

const defaultExec: Exec = (command, args) => {
  const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return {
    status: r.error ? null : r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? (r.error ? String(r.error.message) : ''),
  }
}

const fail = (error: string, fix: string): SymbolicateResult => ({ ok: false, error, fix })

/**
 * Parse a report file's text. Accepts the report object itself, or that
 * object JSON-encoded once more — what a transport that forwards
 * `lastCrash` (already a JSON string) as a JSON value ends up storing.
 */
export function parseReport(text: string): NativeCrashReport | string {
  let value: unknown
  try {
    value = JSON.parse(text)
    if (typeof value === 'string') value = JSON.parse(value)
  } catch (e) {
    return `the report is not JSON (${(e as Error).message})`
  }
  if (Array.isArray(value)) {
    return 'the report is the older array format (before build identity was added), which carries no build identity — capture a new one with this release'
  }
  if (value === null || typeof value !== 'object' || typeof (value as { platform?: unknown }).platform !== 'string') {
    return 'the report has no "platform" field — pass the JSON a useCrashReporter() report holds (lastCrash / the transport payload)'
  }
  return value as NativeCrashReport
}

/** The `pg_map_id` from a mapping.txt header, or `''`. Reads only the header. */
export function mappingIdOf(mappingText: string): string {
  for (const line of mappingText.split('\n', 40)) {
    const m = /^# pg_map_id:\s*([0-9a-fA-F]+)/.exec(line)
    if (m) return m[1]!.toLowerCase()
    if (line !== '' && !line.startsWith('#')) break
  }
  return ''
}

/** R8 writes the id in full or truncated; either form must match its own prefix. */
function sameMapId(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x.length > 0 && y.length > 0 && (x.startsWith(y) || y.startsWith(x))
}

function readHead(path: string): string {
  // A real mapping.txt is tens of MB; the id lives in the first lines.
  const text = readFileSync(path, 'utf8')
  return text.slice(0, 4096)
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isDirectory())
    .sort()
}

/** The R8 retrace launcher: `--retrace`, `$PYREON_RETRACE`, the Android SDK, then `PATH`. */
export function findRetrace(
  explicit: string | undefined,
  env: Record<string, string | undefined>,
  hostPlatform: NodeJS.Platform,
): string | undefined {
  if (explicit) return explicit
  if (env.PYREON_RETRACE) return env.PYREON_RETRACE
  const exe = hostPlatform === 'win32' ? 'retrace.bat' : 'retrace'
  const home = env.HOME ?? homedir()
  const sdks = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    hostPlatform === 'darwin' ? join(home, 'Library/Android/sdk') : undefined,
    hostPlatform === 'linux' ? join(home, 'Android/Sdk') : undefined,
    hostPlatform === 'win32' && env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android/Sdk') : undefined,
  ]
  for (const sdk of sdks) {
    if (!sdk) continue
    const candidate = join(sdk, 'cmdline-tools/latest/bin', exe)
    if (existsSync(candidate)) return candidate
  }
  const pathDirs = (env.PATH ?? '').split(hostPlatform === 'win32' ? ';' : ':')
  for (const dir of pathDirs) {
    if (dir && existsSync(join(dir, exe))) return join(dir, exe)
  }
  return undefined
}

function symbolicateAndroid(report: NativeCrashReport, opts: Required<Pick<SymbolicateOptions, 'exec' | 'hostPlatform' | 'env'>> & SymbolicateOptions): SymbolicateResult {
  const stack = report.stack ?? ''
  if (stack.trim() === '') return fail('the report has an empty stack', 'nothing to symbolicate')
  const build = report.build ?? {}
  // The frames name their own mapping; prefer that over the report field
  // (an older report may lack the field but the stack still carries it).
  const fromStack = /r8-map-id-([0-9a-fA-F]+)/.exec(stack)?.[1] ?? ''
  const wantId = (build.mappingId || fromStack).toLowerCase()
  const versionKey = build.version && build.buildNumber ? `${build.version}-${build.buildNumber}` : ''

  let mapping: string | undefined
  if (opts.mapping) {
    mapping = resolve(opts.mapping)
    if (!existsSync(mapping)) return fail(`--mapping ${opts.mapping} does not exist`, 'pass the mapping.txt the release build retained')
  } else {
    const root = resolve(opts.symbols ?? 'symbols', 'android')
    const candidates = subdirs(root)
      .map((dir) => join(dir, 'mapping.txt'))
      .filter((file) => existsSync(file))
    if (wantId) mapping = candidates.find((file) => sameMapId(mappingIdOf(readHead(file)), wantId))
    if (!mapping && versionKey) {
      const byVersion = join(root, versionKey, 'mapping.txt')
      if (existsSync(byVersion)) mapping = byVersion
    }
    if (!mapping) {
      const what = [wantId && `pg_map_id ${wantId.slice(0, 12)}`, versionKey && `version ${versionKey}`].filter(Boolean).join(', ')
      return fail(
        `no retained R8 mapping matches this report${what ? ` (${what})` : ''} under ${root}`,
        `release builds retain it at symbols/android/<version>-<buildNumber>/mapping.txt — pass --symbols=<dir> or --mapping=<mapping.txt>${wantId ? '' : '. This report names no R8 mapping: if it came from an unminified (debug) build its stack is already readable'}`,
      )
    }
  }

  const haveId = mappingIdOf(readHead(mapping))
  if (wantId && haveId && !sameMapId(haveId, wantId)) {
    return fail(
      `${mapping} is from a different build (pg_map_id ${haveId.slice(0, 12)}; the report's frames name ${wantId.slice(0, 12)})`,
      'retracing with another build\'s mapping prints a plausible but WRONG stack — use the mapping retained for the build that crashed',
    )
  }

  const retrace = findRetrace(opts.retrace, opts.env, opts.hostPlatform)
  if (!retrace) {
    return fail(
      'R8 retrace was not found',
      "install the Android SDK command-line tools (sdkmanager 'cmdline-tools;latest'), set ANDROID_HOME, or pass --retrace=<path>",
    )
  }
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-retrace-'))
  try {
    const stackFile = join(dir, 'stack.txt')
    writeFileSync(stackFile, stack.endsWith('\n') ? stack : `${stack}\n`)
    const r = opts.exec(retrace, [mapping, stackFile])
    if (r.status === null) {
      return fail(`could not run ${retrace}: ${r.stderr}`, 'pass --retrace=<path> to the R8 retrace launcher (Android SDK cmdline-tools/latest/bin/retrace)')
    }
    if (r.status !== 0) {
      const first = r.stderr.split('\n').find((l) => l.trim() !== '') ?? `exit ${r.status}`
      return fail(`retrace failed: ${first}`, `check that ${mapping} is an R8 mapping file`)
    }
    return { ok: true, stack: r.stdout.replace(/\n+$/, ''), symbolsFile: mapping, tool: retrace }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function callSiteOf(address: string): string {
  const value = BigInt(address)
  return `0x${(value > 0n ? value - 1n : value).toString(16)}`
}

/** Every dSYM bundle at most two levels under `root` (symbols/ios/<build>/<App>.app.dSYM). */
function findDsyms(root: string): string[] {
  const out: string[] = []
  const visit = (dir: string, depth: number): void => {
    for (const entry of subdirs(dir)) {
      if (entry.endsWith('.dSYM')) out.push(entry)
      else if (depth > 0) visit(entry, depth - 1)
    }
  }
  if (existsSync(root)) visit(root, 1)
  return out
}

/** `dwarfdump --uuid` → the UUIDs (uppercase) and their DWARF files in a dSYM. */
function dsymUuids(exec: Exec, dsym: string): Array<{ uuid: string; arch: string; file: string }> {
  const r = exec('dwarfdump', ['--uuid', dsym])
  if (r.status !== 0) return []
  const out: Array<{ uuid: string; arch: string; file: string }> = []
  for (const line of r.stdout.split('\n')) {
    const m = /^UUID:\s+([0-9A-Fa-f-]{36})\s+\(([^)]+)\)\s+(.+)$/.exec(line.trim())
    if (m) out.push({ uuid: m[1]!.toUpperCase(), arch: m[2]!, file: m[3]!.trim() })
  }
  return out
}

function symbolicateIos(report: NativeCrashReport, opts: Required<Pick<SymbolicateOptions, 'exec' | 'hostPlatform' | 'env'>> & SymbolicateOptions): SymbolicateResult {
  const image = report.image ?? {}
  const addresses = report.addresses ?? []
  if (!image.uuid || !image.loadAddress || addresses.length === 0) {
    return fail(
      'the report carries no image UUID / load address / return addresses',
      'it predates build identity in useCrashReporter — capture a new report with this release',
    )
  }
  const HEX = /^0x[0-9a-fA-F]+$/
  const bad = [image.loadAddress, ...addresses].find((a) => !HEX.test(a))
  if (bad !== undefined) {
    return fail(`the report holds a malformed address ${JSON.stringify(bad)}`, 'addresses must be 0x-prefixed hex, as useCrashReporter() writes them')
  }
  if (opts.hostPlatform !== 'darwin') {
    return fail('iOS symbolication needs atos and dwarfdump, which ship only with Xcode on macOS', 'run this command on a Mac with Xcode installed')
  }
  const want = image.uuid.toUpperCase()

  let match: { uuid: string; arch: string; file: string } | undefined
  let dsymPath: string | undefined
  if (opts.dsym) {
    dsymPath = resolve(opts.dsym)
    if (!existsSync(dsymPath)) return fail(`--dsym ${opts.dsym} does not exist`, 'pass the .dSYM the archive build retained')
    const uuids = dsymUuids(opts.exec, dsymPath)
    match = uuids.find((u) => u.uuid === want)
    if (!match) {
      return fail(
        `${dsymPath} is from a different build (UUID ${uuids.map((u) => u.uuid).join(', ') || 'unreadable'}; the report's image is ${want})`,
        'atos with another build\'s dSYM prints plausible but WRONG symbols — use the dSYM retained for the build that crashed',
      )
    }
  } else {
    const root = resolve(opts.symbols ?? 'symbols', 'ios')
    for (const dsym of findDsyms(root)) {
      match = dsymUuids(opts.exec, dsym).find((u) => u.uuid === want)
      if (match) {
        dsymPath = dsym
        break
      }
    }
    if (!match || !dsymPath) {
      const b = report.build ?? {}
      return fail(
        `no retained dSYM has UUID ${want}${b.version ? ` (version ${b.version}-${b.buildNumber ?? ''})` : ''} under ${root}`,
        'archive builds retain it at symbols/ios/<version>-<buildNumber>/<App>.app.dSYM — pass --symbols=<dir> or --dsym=<path>',
      )
    }
  }

  const arch = image.arch || match.arch
  // Each captured address is a RETURN address: the instruction after the
  // call. Its line can belong to the next statement (or to compiler-generated
  // code), so look up `address - 1`, inside the call itself — what Apple's
  // own symbolication does for every frame but a crashing PC.
  const callSites = addresses.map(callSiteOf)
  const r = opts.exec('atos', ['-arch', arch, '-o', match.file, '-l', image.loadAddress, ...callSites])
  if (r.status !== 0) {
    const first = r.stderr.split('\n').find((l) => l.trim() !== '') ?? `exit ${r.status}`
    return fail(`atos failed: ${first}`, `check that ${dsymPath} matches arch ${arch}`)
  }
  const resolved = r.stdout.replace(/\n+$/, '').split('\n')
  const imageName = image.name ?? basename(match.file)
  // atos echoes an address it cannot place in this image back as hex — a
  // system-framework frame. Say so instead of printing a bare number.
  const lines = addresses.map((address, i) => {
    const text = resolved[i] ?? address
    const label = /^0x[0-9a-fA-F]+$/.test(text.trim()) ? `${address} (outside ${imageName})` : text
    return `${String(i).padEnd(3)} ${label}`
  })
  const header = report.message ? `${report.message}\n` : ''
  return { ok: true, stack: header + lines.join('\n'), symbolsFile: dsymPath, tool: 'atos' }
}

/** Symbolicate one report. Pure apart from the injected `exec` and the symbol files it reads. */
export function symbolicate(report: NativeCrashReport, options: SymbolicateOptions = {}): SymbolicateResult {
  const opts = {
    ...options,
    exec: options.exec ?? defaultExec,
    hostPlatform: options.hostPlatform ?? process.platform,
    env: options.env ?? process.env,
  }
  switch (report.platform) {
    case 'android':
      return symbolicateAndroid(report, opts)
    case 'ios':
    case 'macos':
      return symbolicateIos(report, opts)
    case 'web':
      return fail('a web report is symbolicated with the bundle\'s source maps, not native symbols', 'use your error tracker\'s source-map upload for web stacks')
    default:
      return fail(`unknown report platform "${report.platform}"`, 'expected android, ios or web')
  }
}
