// `pyreon-native dev` — the on-device edit loop.
//
// What this is, honestly: a WATCH → COMPILE → INCREMENTAL BUILD → REINSTALL →
// RELAUNCH loop on a booted simulator / emulator. It is not hot reload. PMTC
// output is real SwiftUI / Compose, so there is no JS engine on the device to
// swap code into, and a relaunch resets in-memory state. What the loop does buy:
//
//   - The shared source is compiled IN MEMORY on every save, so compiler
//     warnings and errors reach the terminal in milliseconds, before any
//     Xcode / Gradle work starts.
//   - The native build is SKIPPED when the emitted Swift / Kotlin is byte-
//     identical to the last build (a comment, a formatting change, a web-only
//     file) — the slowest step simply does not run.
//   - Xcode / Gradle build incrementally against a persistent derived-data /
//     build directory, then install and relaunch the app by id.
//   - A failed build never ends the session; the next save retries.
//
// The platform steps run through an injected `Runner`, so the loop's decisions
// (what changed, what to rebuild, which device) are unit-tested without a
// simulator.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { NativeCompiler, TargetLanguage } from '@pyreon/native-compiler'
import { build } from './build'
import { collectMtimes, mtimesChanged } from './check'

// ── process runner ──────────────────────────────────────────────────────────

export interface CommandResult {
  code: number
  /** Combined stdout + stderr (the tail is what a failure prints). */
  output: string
}

export interface RunOptions {
  cwd: string
  env?: Record<string, string>
}

/** Runs one external command to completion. Injected so tests need no toolchain. */
export type Runner = (command: string, args: string[], options: RunOptions) => Promise<CommandResult>

export const spawnRunner: Runner = (command, args, options) =>
  new Promise((done) => {
    let output = ''
    let child
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      done({ code: 127, output: String(error) })
      return
    }
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    // `error` fires (instead of `close`) when the binary does not exist.
    child.on('error', (error) => done({ code: 127, output: `${command}: ${error.message}` }))
    child.on('close', (code) => done({ code: code ?? 1, output }))
  })

// ── change detection ────────────────────────────────────────────────────────

export interface Snapshot {
  /** Shared `.tsx` source — recompiled in memory on every change. */
  src: Record<string, number>
  /** Hand-written native code + build config — needs a native build, no recompile. */
  native: Record<string, number>
  /** `assets/` and `web/` — need the app's own staging script. */
  resources: Record<string, number>
}

export interface ChangeSet {
  src: boolean
  native: boolean
  resources: boolean
}

export function classifyChange(prev: Snapshot, cur: Snapshot): ChangeSet {
  return {
    src: mtimesChanged(prev.src, cur.src),
    native: mtimesChanged(prev.native, cur.native),
    resources: mtimesChanged(prev.resources, cur.resources),
  }
}

/** Directories never walked: build output, installs, and generated emit. */
const IGNORED_DIRS = new Set([
  'node_modules',
  'build',
  'generated',
  '.gradle',
  '.git',
  'DerivedData',
  'PyreonNative',
  'PyreonPackages',
  'WebContent',
])

function listFiles(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) listFiles(full, accept, out)
    } else if (accept(full)) {
      out.push(full)
    }
  }
  return out
}

export function takeSnapshot(appDir: string, sourceDir: string): Snapshot {
  const src = listFiles(sourceDir, (f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  const native = [
    ...listFiles(join(appDir, 'ios'), (f) => /\.(swift|yml|plist|entitlements)$/.test(f)),
    ...listFiles(join(appDir, 'android'), (f) => /\.(kt|kts|xml|properties)$/.test(f)),
    join(appDir, 'package.json'),
  ].filter((f) => existsSync(f))
  const resources = [
    ...listFiles(join(appDir, 'assets'), () => true),
    ...listFiles(join(appDir, 'web'), () => true),
  ]
  return {
    src: collectMtimes(src),
    native: collectMtimes(native),
    resources: collectMtimes(resources),
  }
}

// ── app identity (read from the files the scaffold generates) ───────────────

export interface IosApp {
  /** XcodeGen `name:` — also the scheme, the target and the `.app` name. */
  project: string
  bundleId: string
}

export function detectIosApp(appDir: string): IosApp | null {
  const file = join(appDir, 'ios', 'project.yml')
  if (!existsSync(file)) return null
  const yml = readFileSync(file, 'utf8')
  const project = /^name:\s*([^\s#]+)/m.exec(yml)?.[1]
  const bundleId = /PRODUCT_BUNDLE_IDENTIFIER:\s*([^\s#]+)/.exec(yml)?.[1]
  return project && bundleId ? { project, bundleId } : null
}

export interface AndroidApp {
  applicationId: string
  /** Fully-qualified launcher activity, from the manifest. */
  activity: string | null
}

export function detectAndroidApp(appDir: string): AndroidApp | null {
  const gradle = join(appDir, 'android', 'app', 'build.gradle.kts')
  if (!existsSync(gradle)) return null
  const applicationId = /applicationId\s*=\s*"([^"]+)"/.exec(readFileSync(gradle, 'utf8'))?.[1]
  if (!applicationId) return null
  const manifest = join(appDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  let activity: string | null = null
  if (existsSync(manifest)) {
    const match = /<activity[^>]*android:name="([^"]+)"/.exec(readFileSync(manifest, 'utf8'))?.[1]
    if (match) activity = match.startsWith('.') ? `${applicationId}${match}` : match
  }
  return { applicationId, activity }
}

// ── device selection (pure parsers over the tools' output) ──────────────────

interface SimctlDevice {
  udid: string
  name: string
  state: string
  isAvailable?: boolean
}

function simulators(listJson: string): SimctlDevice[] {
  try {
    const parsed = JSON.parse(listJson) as { devices?: Record<string, SimctlDevice[]> }
    return Object.values(parsed.devices ?? {}).flat()
  } catch {
    return []
  }
}

/** The udid of the booted simulator to use, or null when none is booted. */
export function pickBootedSimulator(listJson: string, wanted?: string): string | null {
  const booted = simulators(listJson).filter((d) => d.state === 'Booted')
  if (wanted) return booted.find((d) => d.udid === wanted || d.name === wanted)?.udid ?? null
  return booted[0]?.udid ?? null
}

/** A shutdown simulator to boot when none is running: `--device`, else the newest iPhone. */
export function pickSimulatorToBoot(listJson: string, wanted?: string): string | null {
  const available = simulators(listJson).filter((d) => d.isAvailable !== false)
  if (wanted) return available.find((d) => d.udid === wanted || d.name === wanted)?.udid ?? null
  const phones = available.filter((d) => d.name.startsWith('iPhone'))
  // simctl lists runtimes oldest-first; the last iPhone is the newest runtime's.
  return phones[phones.length - 1]?.udid ?? null
}

/** The adb serial to use: `--device`, else the first device that is online. */
export function pickAdbDevice(adbDevicesOutput: string, wanted?: string): string | null {
  const online = adbDevicesOutput
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial as string)
  if (wanted) return online.includes(wanted) ? wanted : null
  return online[0] ?? null
}

// ── platforms ───────────────────────────────────────────────────────────────

export interface StepResult {
  ok: boolean
  /** What to print when `ok` is false. */
  detail: string
}

export interface DevPlatform {
  label: string
  /** The app's own staging script (wire + compile + assets + web bundle). */
  prepareScript: string
  /** Resolve (and, for iOS, boot) the device to run on. */
  ensureDevice(): Promise<{ id: string } | { error: string }>
  /**
   * Incremental native build + install for `deviceId`. `justPrepared` is true
   * when the staging script ran this cycle (so generated project files may be stale).
   */
  buildAndInstall(deviceId: string, justPrepared: boolean): Promise<StepResult>
  /** Start the freshly installed app, replacing any running copy. */
  launch(deviceId: string): Promise<StepResult>
}

function failure(step: string, result: CommandResult): StepResult {
  return { ok: false, detail: `${step} failed (exit ${result.code})\n${tail(result.output, 40)}` }
}

export function tail(text: string, lines: number): string {
  const all = text.trimEnd().split('\n')
  return all.slice(-lines).join('\n')
}

export function createIosPlatform(appDir: string, run: Runner, wantedDevice?: string): DevPlatform | { error: string } {
  const app = detectIosApp(appDir)
  if (!app) {
    return { error: `no ios/project.yml with a name and PRODUCT_BUNDLE_IDENTIFIER under ${appDir} — is this a pyreon multi-platform project?` }
  }
  const iosDir = join(appDir, 'ios')
  const derived = join(iosDir, 'build')
  const appPath = join(derived, 'Build', 'Products', 'Debug-iphonesimulator', `${app.project}.app`)
  return {
    label: `iOS · ${app.project} (${app.bundleId})`,
    prepareScript: 'scripts/build-ios.sh',
    async ensureDevice() {
      const listed = await run('xcrun', ['simctl', 'list', 'devices', '--json'], { cwd: appDir })
      if (listed.code !== 0) return { error: `xcrun simctl is unavailable — install Xcode and its command line tools\n${tail(listed.output, 5)}` }
      const booted = pickBootedSimulator(listed.output, wantedDevice)
      if (booted) return { id: booted }
      const toBoot = pickSimulatorToBoot(listed.output, wantedDevice)
      if (!toBoot) {
        return { error: wantedDevice ? `no simulator named or with udid "${wantedDevice}"` : 'no iPhone simulator is installed — add one in Xcode → Settings → Platforms' }
      }
      const boot = await run('xcrun', ['simctl', 'boot', toBoot], { cwd: appDir })
      if (boot.code !== 0) return { error: `could not boot simulator ${toBoot}\n${tail(boot.output, 5)}` }
      await run('xcrun', ['simctl', 'bootstatus', toBoot, '-b'], { cwd: appDir })
      // Show the window; failure is harmless (headless CI).
      await run('open', ['-a', 'Simulator'], { cwd: appDir })
      return { id: toBoot }
    },
    async buildAndInstall(deviceId, justPrepared) {
      const xcodeproj = join(iosDir, `${app.project}.xcodeproj`)
      // xcodegen needs the SwiftPM links the staging script creates, so the script
      // always runs first; regenerate whenever it did (project.yml or wiring may
      // have moved) and whenever the project does not exist yet.
      if (!existsSync(xcodeproj) || justPrepared) {
        const gen = await run('xcodegen', ['generate'], { cwd: iosDir })
        if (gen.code !== 0) return failure('xcodegen generate', gen)
      }
      const built = await run(
        'xcodebuild',
        [
          '-project', xcodeproj,
          '-scheme', app.project,
          '-sdk', 'iphonesimulator',
          '-configuration', 'Debug',
          '-destination', `id=${deviceId}`,
          '-derivedDataPath', derived,
          '-quiet',
          'build',
        ],
        { cwd: iosDir },
      )
      if (built.code !== 0) return failure('xcodebuild', built)
      const installed = await run('xcrun', ['simctl', 'install', deviceId, appPath], { cwd: appDir })
      return installed.code === 0 ? { ok: true, detail: '' } : failure('simctl install', installed)
    },
    async launch(deviceId) {
      const launched = await run(
        'xcrun',
        ['simctl', 'launch', '--terminate-running-process', deviceId, app.bundleId],
        { cwd: appDir },
      )
      return launched.code === 0 ? { ok: true, detail: '' } : failure('simctl launch', launched)
    },
  }
}

export function createAndroidPlatform(appDir: string, run: Runner, wantedDevice?: string): DevPlatform | { error: string } {
  const app = detectAndroidApp(appDir)
  if (!app) {
    return { error: `no android/app/build.gradle.kts with an applicationId under ${appDir} — is this a pyreon multi-platform project?` }
  }
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  const adb = sdk && existsSync(join(sdk, 'platform-tools', 'adb')) ? join(sdk, 'platform-tools', 'adb') : 'adb'
  return {
    label: `Android · ${app.applicationId}`,
    prepareScript: 'scripts/build-android.sh',
    async ensureDevice() {
      const listed = await run(adb, ['devices'], { cwd: appDir })
      if (listed.code !== 0) return { error: `adb is unavailable — install the Android SDK platform-tools and set ANDROID_HOME\n${tail(listed.output, 5)}` }
      const serial = pickAdbDevice(listed.output, wantedDevice)
      return serial
        ? { id: serial }
        : { error: wantedDevice ? `adb device "${wantedDevice}" is not online` : 'no Android device is online — start an emulator (Android Studio → Device Manager) or plug in a device with USB debugging' }
    },
    async buildAndInstall(deviceId) {
      // Gradle's own preBuild task re-runs scripts/build-android.sh, so this one
      // command compiles, builds incrementally and installs.
      const built = await run('gradle', ['-p', 'android', 'installDebug', '--console=plain', '-q'], {
        cwd: appDir,
        env: { ANDROID_SERIAL: deviceId },
      })
      return built.code === 0 ? { ok: true, detail: '' } : failure('gradle installDebug', built)
    },
    async launch(deviceId) {
      const target = app.activity ? ['-n', `${app.applicationId}/${app.activity}`] : ['-p', app.applicationId]
      const started = await run(
        adb,
        ['-s', deviceId, 'shell', 'am', 'start', '-S', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', ...target],
        { cwd: appDir },
      )
      return started.code === 0 ? { ok: true, detail: '' } : failure('am start', started)
    },
  }
}

// ── the loop ────────────────────────────────────────────────────────────────

export interface CompileOutcome {
  /** Stable digest of every emitted file; equal digests mean the native build can be skipped. */
  digest: string
  fileCount: number
  warnings: { file: string; warning: string }[]
}

/** Compile the shared source for `target` in memory. Throws on a transform error. */
export function compileForDigest(
  sourceDir: string,
  target: TargetLanguage,
  compiler?: Pick<NativeCompiler, 'transform'>,
): CompileOutcome {
  const scratch = mkdtempSync(join(tmpdir(), 'pyreon-native-dev-'))
  try {
    const result = build({ source: sourceDir, out: scratch, target, ...(compiler ? { compiler } : {}) })
    const hash = createHash('sha1')
    for (const output of [...result.outputs].sort((a, b) => a.source.localeCompare(b.source))) {
      hash.update(relative(sourceDir, output.source).split(sep).join('/'))
      hash.update('\0')
      hash.update(output.code)
      hash.update('\0')
    }
    return { digest: hash.digest('hex'), fileCount: result.filesCompiled, warnings: result.warnings }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export interface DevLoopOptions {
  appDir: string
  sourceDir: string
  target: TargetLanguage
  platform: DevPlatform
  run: Runner
  compiler?: Pick<NativeCompiler, 'transform'> | undefined
  log?: (line: string) => void
  intervalMs?: number
  /** Run one build-install-launch cycle and return (scripts, CI, pre-E2E setup). */
  once?: boolean
  signal?: AbortSignal
  /** Test-only: stop after N poll iterations. */
  maxTicks?: number
}

export interface DevLoopSummary {
  cycles: number
  builds: number
  skipped: number
  failures: number
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export async function runDevLoop(options: DevLoopOptions): Promise<DevLoopSummary> {
  const log = options.log ?? ((line: string) => console.log(line))
  const { platform, run, appDir } = options
  const summary: DevLoopSummary = { cycles: 0, builds: 0, skipped: 0, failures: 0 }
  let lastDigest: string | null = null

  const cycle = async (changes: ChangeSet, first: boolean): Promise<void> => {
    summary.cycles++
    const started = Date.now()
    let outcome: CompileOutcome
    try {
      outcome = compileForDigest(options.sourceDir, options.target, options.compiler)
    } catch (error) {
      summary.failures++
      log(`✗ compile failed — fix the error and save again\n  ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    const compileMs = Date.now() - started
    if (outcome.warnings.length > 0) {
      log(`! ${outcome.warnings.length} compiler warning(s) — these constructs will not run on the device:`)
      for (const w of outcome.warnings) log(`  ${w.file}: ${w.warning}`)
    }
    log(`✓ compiled ${outcome.fileCount} file(s) in ${compileMs}ms`)

    const needsPrepare = first || changes.resources
    const needsNative = needsPrepare || changes.native || outcome.digest !== lastDigest
    if (!needsNative) {
      summary.skipped++
      log('· emitted code is unchanged — native build skipped')
      return
    }

    const device = await platform.ensureDevice()
    if ('error' in device) {
      summary.failures++
      log(`✗ ${device.error}`)
      return
    }

    if (needsPrepare) {
      const script = await run('bash', [platform.prepareScript], { cwd: appDir })
      if (script.code !== 0) {
        summary.failures++
        log(`✗ ${platform.prepareScript} failed (exit ${script.code})\n${tail(script.output, 40)}`)
        return
      }
    }

    const buildStarted = Date.now()
    const built = await platform.buildAndInstall(device.id, needsPrepare)
    if (!built.ok) {
      summary.failures++
      log(`✗ ${built.detail}`)
      return
    }
    const launched = await platform.launch(device.id)
    if (!launched.ok) {
      summary.failures++
      log(`✗ ${launched.detail}`)
      return
    }
    // Only remember the digest once the app is really running it: a failed native
    // build must retry on the next save instead of being skipped as "unchanged".
    lastDigest = outcome.digest
    summary.builds++
    log(`✓ built, installed and launched in ${seconds(Date.now() - buildStarted)} (total ${seconds(Date.now() - started)})`)
  }

  log(`pyreon-native dev — ${platform.label}`)
  let prev = takeSnapshot(appDir, options.sourceDir)
  await cycle({ src: true, native: true, resources: true }, true)
  if (options.once) return summary

  log('watching for changes (Ctrl+C to stop)')
  const intervalMs = options.intervalMs ?? 500
  const maxTicks = options.maxTicks ?? Infinity
  let ticks = 0
  while (!options.signal?.aborted && ticks < maxTicks) {
    await wait(intervalMs)
    ticks++
    if (options.signal?.aborted) break
    const cur = takeSnapshot(appDir, options.sourceDir)
    const changes = classifyChange(prev, cur)
    if (!changes.src && !changes.native && !changes.resources) continue
    // Snapshot BEFORE the cycle: a save that lands mid-build differs from `prev`
    // on the next tick and triggers another cycle, so edits are never lost.
    prev = cur
    await cycle(changes, false)
  }
  return summary
}

/** Existing-source guard shared with the CLI: a clear error beats a silent empty watch. */
export function sourceDirError(sourceDir: string): string | null {
  try {
    return statSync(sourceDir).isDirectory() ? null : `${sourceDir} is not a directory`
  } catch {
    return `source directory ${sourceDir} does not exist`
  }
}
