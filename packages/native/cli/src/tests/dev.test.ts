import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  classifyChange,
  createAndroidPlatform,
  createIosPlatform,
  detectAndroidApp,
  detectIosApp,
  pickAdbDevice,
  pickBootedSimulator,
  pickSimulatorToBoot,
  runDevLoop,
  takeSnapshot,
  tail,
  type CommandResult,
  type Runner,
} from '../dev'
import { main } from '../cli'

const SIMS = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [
      { udid: 'OLD', name: 'iPhone 16', state: 'Shutdown', isAvailable: true },
      { udid: 'IPAD', name: 'iPad Air', state: 'Shutdown', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-26-3': [
      { udid: 'NEW', name: 'iPhone 17', state: 'Shutdown', isAvailable: true },
      { udid: 'GONE', name: 'iPhone 99', state: 'Shutdown', isAvailable: false },
    ],
  },
})

const SIMS_BOOTED = SIMS.replace('"udid":"IPAD","name":"iPad Air","state":"Shutdown"', '"udid":"IPAD","name":"iPad Air","state":"Booted"')

describe('device pickers', () => {
  it('prefers a booted simulator, matched by udid or name', () => {
    expect(pickBootedSimulator(SIMS)).toBeNull()
    expect(pickBootedSimulator(SIMS_BOOTED)).toBe('IPAD')
    expect(pickBootedSimulator(SIMS_BOOTED, 'iPad Air')).toBe('IPAD')
    expect(pickBootedSimulator(SIMS_BOOTED, 'nope')).toBeNull()
  })

  it('boots the newest available iPhone, never an unavailable one or an iPad', () => {
    expect(pickSimulatorToBoot(SIMS)).toBe('NEW')
    expect(pickSimulatorToBoot(SIMS, 'iPhone 16')).toBe('OLD')
    expect(pickSimulatorToBoot(SIMS, 'iPhone 99')).toBeNull()
  })

  it('tolerates unparsable simctl output', () => {
    expect(pickBootedSimulator('not json')).toBeNull()
    expect(pickSimulatorToBoot('')).toBeNull()
  })

  it('picks the first ONLINE adb device and ignores offline / unauthorized ones', () => {
    const out = 'List of devices attached\nemulator-5554\toffline\nR5CT\tunauthorized\nemulator-5556\tdevice\n'
    expect(pickAdbDevice(out)).toBe('emulator-5556')
    expect(pickAdbDevice(out, 'emulator-5556')).toBe('emulator-5556')
    expect(pickAdbDevice(out, 'emulator-5554')).toBeNull()
    expect(pickAdbDevice('List of devices attached\n\n')).toBeNull()
  })
})

describe('classifyChange + takeSnapshot', () => {
  let app: string
  beforeEach(() => {
    app = mkdtempSync(join(tmpdir(), 'dev-snap-'))
    mkdirSync(join(app, 'src'))
    mkdirSync(join(app, 'ios', 'Sources'), { recursive: true })
    mkdirSync(join(app, 'ios', 'generated'), { recursive: true })
    mkdirSync(join(app, 'android', 'app', 'src', 'main', 'kotlin', 'generated'), { recursive: true })
    mkdirSync(join(app, 'assets'))
    writeFileSync(join(app, 'src', 'App.tsx'), 'x')
    writeFileSync(join(app, 'ios', 'Sources', 'Main.swift'), 'x')
    writeFileSync(join(app, 'ios', 'generated', 'App.swift'), 'x')
    writeFileSync(join(app, 'android', 'app', 'src', 'main', 'kotlin', 'generated', 'App.kt'), 'x')
    writeFileSync(join(app, 'assets', 'logo.png'), 'x')
    writeFileSync(join(app, 'package.json'), '{}')
  })
  afterEach(() => rmSync(app, { recursive: true, force: true }))

  const bump = (file: string) => {
    const t = new Date(Date.now() + 5000)
    utimesSync(file, t, t)
  }

  it('never watches generated emit, so the loop cannot trigger itself', () => {
    const snap = takeSnapshot(app, join(app, 'src'))
    expect(Object.keys(snap.native).some((f) => f.includes('generated'))).toBe(false)
    expect(Object.keys(snap.native).some((f) => f.endsWith('Main.swift'))).toBe(true)
  })

  it('sorts a change into src, native or resources', () => {
    const before = takeSnapshot(app, join(app, 'src'))
    bump(join(app, 'src', 'App.tsx'))
    expect(classifyChange(before, takeSnapshot(app, join(app, 'src')))).toEqual({ src: true, native: false, resources: false })
    const before2 = takeSnapshot(app, join(app, 'src'))
    bump(join(app, 'ios', 'Sources', 'Main.swift'))
    expect(classifyChange(before2, takeSnapshot(app, join(app, 'src')))).toEqual({ src: false, native: true, resources: false })
    const before3 = takeSnapshot(app, join(app, 'src'))
    bump(join(app, 'assets', 'logo.png'))
    expect(classifyChange(before3, takeSnapshot(app, join(app, 'src')))).toEqual({ src: false, native: false, resources: true })
  })
})

function iosApp(): string {
  const app = mkdtempSync(join(tmpdir(), 'dev-ios-'))
  mkdirSync(join(app, 'src'))
  mkdirSync(join(app, 'ios'))
  writeFileSync(join(app, 'src', 'App.tsx'), `import { Text } from '@pyreon/primitives'\nexport function App() { return <Text>hi</Text> }\n`)
  writeFileSync(join(app, 'ios', 'project.yml'), 'name: Demo\nsettings:\n  base:\n    PRODUCT_BUNDLE_IDENTIFIER: com.example.Demo\n')
  return app
}

function recorder(handler: (command: string, args: string[], cwd: string) => CommandResult | undefined): { run: Runner; calls: string[] } {
  const calls: string[] = []
  const run: Runner = async (command, args, options) => {
    calls.push([command, ...args].join(' '))
    return handler(command, args, options.cwd) ?? { code: 0, output: '' }
  }
  return { run, calls }
}

// Fake toolchain: one booted simulator, and `xcodegen generate` really creates the project dir.
const bootedSim = (command: string, args: string[], cwd?: string): CommandResult | undefined => {
  if (command === 'xcrun' && args[1] === 'list') return { code: 0, output: SIMS_BOOTED }
  if (command === 'xcodegen' && cwd) mkdirSync(join(cwd, 'Demo.xcodeproj'), { recursive: true })
  return undefined
}

describe('app identity detection', () => {
  it('reads the iOS project + bundle id and the Android id + launcher activity', () => {
    const app = iosApp()
    mkdirSync(join(app, 'android', 'app', 'src', 'main'), { recursive: true })
    writeFileSync(join(app, 'android', 'app', 'build.gradle.kts'), 'android { defaultConfig { applicationId = "com.example.Demo" } }')
    writeFileSync(join(app, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), '<manifest><application><activity android:name=".MainActivity" android:exported="true"/></application></manifest>')
    expect(detectIosApp(app)).toEqual({ project: 'Demo', bundleId: 'com.example.Demo' })
    expect(detectAndroidApp(app)).toEqual({ applicationId: 'com.example.Demo', activity: 'com.example.Demo.MainActivity' })
    expect(detectIosApp(join(app, 'src'))).toBeNull()
    expect(detectAndroidApp(join(app, 'src'))).toBeNull()
    rmSync(app, { recursive: true, force: true })
  })

  it('refuses a directory that is not a pyreon multi-platform project, naming the missing file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dev-empty-'))
    const ios = createIosPlatform(empty, recorder(() => undefined).run)
    const android = createAndroidPlatform(empty, recorder(() => undefined).run)
    expect('error' in ios && ios.error).toContain('ios/project.yml')
    expect('error' in android && android.error).toContain('build.gradle.kts')
    rmSync(empty, { recursive: true, force: true })
  })
})

describe('runDevLoop', () => {
  let app: string
  beforeEach(() => {
    app = iosApp()
  })
  afterEach(() => rmSync(app, { recursive: true, force: true }))

  const lines: string[] = []
  const log = (line: string) => void lines.push(line)
  beforeEach(() => {
    lines.length = 0
  })

  async function until(predicate: () => boolean, ms = 4000): Promise<void> {
    const end = Date.now() + ms
    while (!predicate()) {
      if (Date.now() > end) throw new Error(`timed out waiting; log was:\n${lines.join('\n')}`)
      await new Promise((done) => setTimeout(done, 5))
    }
  }
  const settled = (n: number) => () => lines.filter((l) => l.startsWith('✓ built') || l.startsWith('·') || l.startsWith('✗')).length >= n
  const touch = (file: string, offsetMs: number) => {
    const t = new Date(Date.now() + offsetMs)
    utimesSync(file, t, t)
  }

  function loop(run: Runner, extra: { once?: boolean; signal?: AbortSignal } = {}) {
    const platform = createIosPlatform(app, run)
    if ('error' in platform) throw new Error(platform.error)
    return runDevLoop({
      appDir: app,
      sourceDir: join(app, 'src'),
      target: 'swift',
      platform,
      run,
      log,
      intervalMs: 5,
      ...extra,
    })
  }

  it('the first cycle stages, generates the project, builds, installs and launches — in that order', async () => {
    const { run, calls } = recorder(bootedSim)
    const summary = await loop(run, { once: true })
    expect(summary).toMatchObject({ cycles: 1, builds: 1, failures: 0 })
    const order = calls.map((c) => c.split(' ').slice(0, 2).join(' '))
    expect(order).toEqual([
      'xcrun simctl', // list devices
      'bash scripts/build-ios.sh',
      'xcodegen generate',
      'xcodebuild -project',
      'xcrun simctl', // install
      'xcrun simctl', // launch
    ])
    expect(calls.at(-1)).toContain('simctl launch --terminate-running-process IPAD com.example.Demo')
    expect(calls.some((c) => c.includes('-destination id=IPAD'))).toBe(true)
  })

  it('skips the native build when the emitted code did not change', async () => {
    const { run, calls } = recorder(bootedSim)
    const stop = new AbortController()
    const pending = loop(run, { signal: stop.signal })
    await until(settled(1))
    // Touch the file WITHOUT changing its content: mtime moves, digest does not.
    touch(join(app, 'src', 'App.tsx'), 5000)
    await until(settled(2))
    stop.abort()
    const summary = await pending
    expect(summary.builds).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(calls.filter((c) => c.startsWith('xcodebuild')).length).toBe(1)
    expect(lines.some((l) => l.includes('emitted code is unchanged'))).toBe(true)
  })

  it('rebuilds when the emitted code changes', async () => {
    const { run, calls } = recorder(bootedSim)
    const stop = new AbortController()
    const pending = loop(run, { signal: stop.signal })
    await until(settled(1))
    writeFileSync(join(app, 'src', 'App.tsx'), `import { Text } from '@pyreon/primitives'\nexport function App() { return <Text>changed</Text> }\n`)
    touch(join(app, 'src', 'App.tsx'), 5000)
    await until(settled(2))
    stop.abort()
    const summary = await pending
    expect(summary.builds).toBe(2)
    expect(calls.filter((c) => c.startsWith('xcodebuild')).length).toBe(2)
    // A source-only change must not re-run the staging script or xcodegen.
    expect(calls.filter((c) => c.startsWith('bash scripts/build-ios.sh')).length).toBe(1)
    expect(calls.filter((c) => c.startsWith('xcodegen')).length).toBe(1)
  })

  it('a failed native build is reported, does not stop the loop, and is retried instead of skipped as unchanged', async () => {
    let failBuild = true
    const { run, calls } = recorder((command, args, cwd) => {
      if (command === 'xcodebuild' && failBuild) return { code: 65, output: 'error: boom\nline2' }
      return bootedSim(command, args, cwd)
    })
    const stop = new AbortController()
    const pending = loop(run, { signal: stop.signal })
    await until(settled(1))
    failBuild = false
    // Same content, new mtime: only the retry rule can make this build.
    touch(join(app, 'src', 'App.tsx'), 5000)
    await until(settled(2))
    stop.abort()
    const summary = await pending
    expect(summary.failures).toBe(1)
    expect(summary.builds).toBe(1)
    expect(lines.some((l) => l.includes('xcodebuild failed (exit 65)') && l.includes('error: boom'))).toBe(true)
    expect(calls.filter((c) => c.startsWith('xcodebuild')).length).toBe(2)
  })

  it('reports compiler warnings immediately and a compile error without touching the toolchain', async () => {
    writeFileSync(join(app, 'src', 'App.tsx'), `export default function App() { throw new Error('x') ; return <Text>hi</Text> }\n`)
    const { run, calls } = recorder(bootedSim)
    const compiler = {
      transform() {
        throw new Error('transform exploded')
      },
    }
    const platform = createIosPlatform(app, run)
    if ('error' in platform) throw new Error(platform.error)
    const summary = await runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'swift', platform, run, log, once: true, compiler })
    expect(summary.failures).toBe(1)
    expect(calls).toEqual([])
    expect(lines.some((l) => l.includes('compile failed') && l.includes('transform exploded'))).toBe(true)
  })

  it('stops with a clear message when no device is available and never builds', async () => {
    const { run, calls } = recorder((command, args) =>
      command === 'xcrun' && args[1] === 'list' ? { code: 0, output: JSON.stringify({ devices: {} }) } : undefined,
    )
    const summary = await loop(run, { once: true })
    expect(summary.failures).toBe(1)
    expect(lines.some((l) => l.includes('no iPhone simulator is installed'))).toBe(true)
    expect(calls.some((c) => c.startsWith('xcodebuild'))).toBe(false)
  })

  it('boots a simulator when none is running', async () => {
    const { run, calls } = recorder((command, args, cwd) =>
      command === 'xcrun' && args[1] === 'list' ? { code: 0, output: SIMS } : bootedSim(command, args, cwd),
    )
    await loop(run, { once: true })
    expect(calls).toContain('xcrun simctl boot NEW')
    expect(calls.some((c) => c.includes('-destination id=NEW'))).toBe(true)
  })

  it('a changed asset re-runs the staging script; a changed Swift file rebuilds without recompiling', async () => {
    mkdirSync(join(app, 'assets'))
    mkdirSync(join(app, 'ios', 'Sources'))
    writeFileSync(join(app, 'assets', 'a.png'), 'a')
    writeFileSync(join(app, 'ios', 'Sources', 'Main.swift'), 'a')
    const { run, calls } = recorder(bootedSim)
    const stop = new AbortController()
    const pending = loop(run, { signal: stop.signal })
    await until(settled(1))
    touch(join(app, 'ios', 'Sources', 'Main.swift'), 5000)
    await until(settled(2))
    touch(join(app, 'assets', 'a.png'), 10000)
    await until(settled(3))
    stop.abort()
    const summary = await pending
    expect(summary.builds).toBe(3)
    // staging: first cycle + the asset change, NOT the Swift-only change.
    expect(calls.filter((c) => c.startsWith('bash scripts/build-ios.sh')).length).toBe(2)
    expect(calls.filter((c) => c.startsWith('xcodebuild')).length).toBe(3)
  })
})

describe('android platform', () => {
  it('builds with gradle installDebug on the chosen serial and relaunches the launcher activity', async () => {
    const app = mkdtempSync(join(tmpdir(), 'dev-and-'))
    mkdirSync(join(app, 'src'))
    mkdirSync(join(app, 'android', 'app', 'src', 'main'), { recursive: true })
    writeFileSync(join(app, 'src', 'App.tsx'), `export default function App() { return null }\n`)
    writeFileSync(join(app, 'android', 'app', 'build.gradle.kts'), 'applicationId = "com.example.Demo"')
    writeFileSync(join(app, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), '<activity android:name="com.example.Demo.MainActivity"/>')
    const envs: Array<Record<string, string> | undefined> = []
    const calls: string[] = []
    const run: Runner = async (command, args, options) => {
      calls.push([command, ...args].join(' '))
      envs.push(options.env)
      if (args[0] === 'devices') return { code: 0, output: 'List of devices attached\nemulator-5554\tdevice\n' }
      return { code: 0, output: '' }
    }
    const platform = createAndroidPlatform(app, run)
    if ('error' in platform) throw new Error(platform.error)
    const summary = await runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'kotlin', platform, run, log: () => undefined, once: true })
    expect(summary).toMatchObject({ builds: 1, failures: 0 })
    expect(calls.some((c) => c === 'gradle -p android installDebug --console=plain -q')).toBe(true)
    expect(envs.some((e) => e?.ANDROID_SERIAL === 'emulator-5554')).toBe(true)
    expect(calls.at(-1)).toContain('shell am start -S')
    expect(calls.at(-1)).toContain('-n com.example.Demo/com.example.Demo.MainActivity')
    rmSync(app, { recursive: true, force: true })
  })
})

describe('cli surface', () => {
  it('tail keeps only the last lines', () => {
    expect(tail('a\nb\nc\nd\n', 2)).toBe('c\nd')
  })

  it('dev without a valid --target is a usage error (exit 1), checked before any toolchain runs', async () => {
    const { mainWithPlugins } = await import('../cli')
    expect(await mainWithPlugins(['dev'])).toBe(1)
    expect(await mainWithPlugins(['dev', '--target=web'])).toBe(1)
  })

  it('dev reports a missing source dir instead of watching nothing', async () => {
    const { mainWithPlugins } = await import('../cli')
    const app = mkdtempSync(join(tmpdir(), 'dev-nosrc-'))
    expect(await mainWithPlugins(['dev', '--target=ios', `--app=${app}`])).toBe(1)
    rmSync(app, { recursive: true, force: true })
  })

  it('--help lists the dev command', () => {
    const lines: string[] = []
    const original = console.log
    console.log = (line: string) => void lines.push(line)
    try {
      expect(main(['--help'])).toBe(0)
    } finally {
      console.log = original
    }
    expect(lines.join('\n')).toContain('pyreon-native dev')
  })
})

describe('spawnRunner (the real process runner)', () => {
  it('captures stdout and stderr together and reports the exit code', async () => {
    const { spawnRunner } = await import('../dev')
    const ok = await spawnRunner(process.execPath, ['-e', 'process.stdout.write("out");process.stderr.write("err")'], { cwd: tmpdir() })
    expect(ok.code).toBe(0)
    expect(ok.output).toContain('out')
    expect(ok.output).toContain('err')
    const bad = await spawnRunner(process.execPath, ['-e', 'process.exit(7)'], { cwd: tmpdir() })
    expect(bad.code).toBe(7)
  })

  it('passes env and cwd through', async () => {
    const { spawnRunner } = await import('../dev')
    const dir = mkdtempSync(join(tmpdir(), 'dev-cwd-'))
    const r = await spawnRunner(process.execPath, ['-e', 'process.stdout.write(process.cwd()+"|"+process.env.PYREON_DEV_PROBE)'], {
      cwd: dir,
      env: { PYREON_DEV_PROBE: 'yes' },
    })
    expect(r.output).toContain('|yes')
    expect(r.output.toLowerCase()).toContain('dev-cwd-')
    rmSync(dir, { recursive: true, force: true })
  })

  it('a missing binary is exit 127 with the command named, not a thrown error', async () => {
    const { spawnRunner } = await import('../dev')
    const r = await spawnRunner('pyreon-definitely-not-a-real-binary', [], { cwd: tmpdir() })
    expect(r.code).toBe(127)
    expect(r.output).toContain('pyreon-definitely-not-a-real-binary')
  })
})

describe('platform failure paths', () => {
  const lines: string[] = []
  const log = (line: string) => void lines.push(line)
  let app: string
  beforeEach(() => {
    lines.length = 0
    app = iosApp()
  })
  afterEach(() => rmSync(app, { recursive: true, force: true }))

  async function once(run: Runner) {
    const platform = createIosPlatform(app, run)
    if ('error' in platform) throw new Error(platform.error)
    return runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'swift', platform, run, log, once: true })
  }
  const fail = (match: (c: string, a: string[]) => boolean, output = 'nope') =>
    recorder((c, a, cwd) => (match(c, a) ? { code: 1, output } : bootedSim(c, a, cwd)))

  it('reports a missing Xcode toolchain', async () => {
    const { run } = recorder((c, a) => (c === 'xcrun' && a[1] === 'list' ? { code: 127, output: 'xcrun: not found' } : undefined))
    expect((await once(run)).failures).toBe(1)
    expect(lines.join('\n')).toContain('xcrun simctl is unavailable')
  })

  it('reports a simulator that will not boot, and names a --device that does not exist', async () => {
    const shut = (c: string, a: string[]) => (c === 'xcrun' && a[1] === 'list' ? { code: 0, output: SIMS } : undefined)
    const { run } = recorder((c, a) => (c === 'xcrun' && a[1] === 'boot' ? { code: 1, output: 'boot failed' } : shut(c, a)))
    await once(run)
    expect(lines.join('\n')).toContain('could not boot simulator NEW')
    lines.length = 0
    const platform = createIosPlatform(app, recorder(shut).run, 'iPhone 404')
    if ('error' in platform) throw new Error(platform.error)
    const summary = await runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'swift', platform, run: recorder(shut).run, log, once: true })
    expect(summary.failures).toBe(1)
    expect(lines.join('\n')).toContain('no simulator named or with udid "iPhone 404"')
  })

  it('surfaces each failing native step with its own name and the tool output', async () => {
    for (const [name, match] of [
      ['scripts/build-ios.sh', (c: string) => c === 'bash'],
      ['xcodegen generate', (c: string) => c === 'xcodegen'],
      ['xcodebuild', (c: string) => c === 'xcodebuild'],
      ['simctl install', (_c: string, a: string[]) => a[1] === 'install'],
      ['simctl launch', (_c: string, a: string[]) => a[1] === 'launch'],
    ] as const) {
      lines.length = 0
      const { run } = fail(match, 'tool said no')
      const summary = await once(run)
      expect(summary.failures, name).toBe(1)
      expect(lines.join('\n'), name).toContain(name)
      expect(lines.join('\n'), name).toContain('tool said no')
    }
  })

  it('a successful --once prints through the default logger without throwing', async () => {
    const { run } = recorder(bootedSim)
    const platform = createIosPlatform(app, run)
    if ('error' in platform) throw new Error(platform.error)
    const original = console.log
    const seen: string[] = []
    console.log = (line: string) => void seen.push(line)
    try {
      await runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'swift', platform, run, once: true })
    } finally {
      console.log = original
    }
    expect(seen.some((l) => l.includes('launched'))).toBe(true)
  })

  it('compiler warnings are printed with the file, and the loop still builds', async () => {
    const compiler = { transform: () => ({ code: 'struct X {}', warnings: ['unsupported thing'] }) }
    const { run } = recorder(bootedSim)
    const platform = createIosPlatform(app, run)
    if ('error' in platform) throw new Error(platform.error)
    const summary = await runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'swift', platform, run, log, once: true, compiler })
    expect(summary.builds).toBe(1)
    expect(lines.join('\n')).toContain('1 compiler warning(s)')
    expect(lines.join('\n')).toContain('unsupported thing')
  })
})

describe('android failure paths', () => {
  const lines: string[] = []
  const log = (line: string) => void lines.push(line)
  let app: string
  beforeEach(() => {
    lines.length = 0
    app = mkdtempSync(join(tmpdir(), 'dev-and2-'))
    mkdirSync(join(app, 'src'))
    mkdirSync(join(app, 'android', 'app', 'src', 'main'), { recursive: true })
    writeFileSync(join(app, 'src', 'App.tsx'), `export function App() { return null }\n`)
    writeFileSync(join(app, 'android', 'app', 'build.gradle.kts'), 'applicationId = "com.example.Demo"')
  })
  afterEach(() => rmSync(app, { recursive: true, force: true }))

  const DEVICES = 'List of devices attached\nemulator-5554\tdevice\n'
  async function once(handler: (c: string, a: string[]) => CommandResult | undefined, wanted?: string) {
    const calls: string[] = []
    const run: Runner = async (c, a) => {
      calls.push([c, ...a].join(' '))
      return handler(c, a) ?? (a[0] === 'devices' ? { code: 0, output: DEVICES } : { code: 0, output: '' })
    }
    const platform = createAndroidPlatform(app, run, wanted)
    if ('error' in platform) throw new Error(platform.error)
    const summary = await runDevLoop({ appDir: app, sourceDir: join(app, 'src'), target: 'kotlin', platform, run, log, once: true })
    return { summary, calls }
  }

  it('launches by package when the manifest names no activity', async () => {
    const { calls } = await once(() => undefined)
    expect(calls.at(-1)).toContain('-p com.example.Demo')
    expect(calls.at(-1)).not.toContain(' -n ')
  })

  it('explains a missing adb, an offline device and an unknown --device', async () => {
    await once((_c, a) => (a[0] === 'devices' ? { code: 127, output: 'adb: not found' } : undefined))
    expect(lines.join('\n')).toContain('adb is unavailable')
    lines.length = 0
    await once((_c, a) => (a[0] === 'devices' ? { code: 0, output: 'List of devices attached\n' } : undefined))
    expect(lines.join('\n')).toContain('no Android device is online')
    lines.length = 0
    await once(() => undefined, 'R5CT')
    expect(lines.join('\n')).toContain('adb device "R5CT" is not online')
  })

  it('surfaces a failing staging script, gradle build and launch by name', async () => {
    for (const [name, match] of [
      ['scripts/build-android.sh', (c: string) => c === 'bash'],
      ['gradle installDebug', (c: string) => c === 'gradle'],
      ['am start', (_c: string, a: string[]) => a.includes('am')],
    ] as const) {
      lines.length = 0
      const { summary } = await once((c, a) => (match(c, a) ? { code: 1, output: 'broken' } : undefined))
      expect(summary.failures, name).toBe(1)
      expect(lines.join('\n'), name).toContain(name)
    }
  })

  it('honours ANDROID_HOME for the adb binary', async () => {
    const sdk = mkdtempSync(join(tmpdir(), 'sdk-'))
    mkdirSync(join(sdk, 'platform-tools'))
    writeFileSync(join(sdk, 'platform-tools', 'adb'), '')
    const previous = process.env.ANDROID_HOME
    process.env.ANDROID_HOME = sdk
    try {
      const { calls } = await once(() => undefined)
      expect(calls[0]).toBe(`${join(sdk, 'platform-tools', 'adb')} devices`)
    } finally {
      if (previous === undefined) delete process.env.ANDROID_HOME
      else process.env.ANDROID_HOME = previous
      rmSync(sdk, { recursive: true, force: true })
    }
  })
})

describe('snapshot + guard edges', () => {
  it('a project with no ios/android/assets dirs snapshots cleanly', () => {
    const bare = mkdtempSync(join(tmpdir(), 'dev-bare-'))
    mkdirSync(join(bare, 'src'))
    const snap = takeSnapshot(bare, join(bare, 'src'))
    expect(snap).toEqual({ src: {}, native: {}, resources: {} })
    rmSync(bare, { recursive: true, force: true })
  })

  it('sourceDirError names a missing path and a non-directory', async () => {
    const { sourceDirError } = await import('../dev')
    const dir = mkdtempSync(join(tmpdir(), 'dev-guard-'))
    writeFileSync(join(dir, 'file.txt'), 'x')
    expect(sourceDirError(dir)).toBeNull()
    expect(sourceDirError(join(dir, 'file.txt'))).toContain('is not a directory')
    expect(sourceDirError(join(dir, 'nope'))).toContain('does not exist')
    rmSync(dir, { recursive: true, force: true })
  })

  it('a bad --plugin makes dev fail with exit 2 before touching any device', async () => {
    const { mainWithPlugins } = await import('../cli')
    const app = iosApp()
    const err = console.error
    const seen: string[] = []
    console.error = (line: string) => void seen.push(String(line))
    try {
      expect(await mainWithPlugins(['dev', '--target=ios', `--app=${app}`, '--plugin=/nonexistent/plugin.mjs'])).toBe(2)
    } finally {
      console.error = err
      rmSync(app, { recursive: true, force: true })
    }
    expect(seen.join('\n')).toContain('dev failed')
  })
})

describe('dev command end to end (real process runner, stub toolchain on PATH)', () => {
  // Executable stubs stand in for Xcode so the CLI's real spawn path, argument
  // parsing and exit-code contract run without a simulator.
  function stubToolchain(xcodebuildExit: number): { bin: string; app: string } {
    const bin = mkdtempSync(join(tmpdir(), 'dev-bin-'))
    const script = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    }
    script('xcrun', `if [ "$2" = "list" ]; then printf '%s' '${SIMS_BOOTED}'; fi`)
    script('xcodegen', 'mkdir -p Demo.xcodeproj')
    script('xcodebuild', `echo "build output"; exit ${xcodebuildExit}`)
    const app = iosApp()
    mkdirSync(join(app, 'scripts'))
    writeFileSync(join(app, 'scripts', 'build-ios.sh'), '#!/bin/sh\nexit 0\n')
    return { bin, app }
  }

  async function run(xcodebuildExit: number, extra: string[] = []): Promise<number> {
    const { mainWithPlugins } = await import('../cli')
    const { bin, app } = stubToolchain(xcodebuildExit)
    const previousPath = process.env.PATH
    process.env.PATH = `${bin}:${previousPath}`
    const log = console.log
    const err = console.error
    console.log = () => undefined
    console.error = () => undefined
    try {
      return await mainWithPlugins(['dev', '--target=ios', `--app=${app}`, '--once', '--no-plugins', '--interval=5', ...extra])
    } finally {
      process.env.PATH = previousPath
      console.log = log
      console.error = err
      rmSync(bin, { recursive: true, force: true })
      rmSync(app, { recursive: true, force: true })
    }
  }

  it('--once exits 0 after one successful build-install-launch cycle', async () => {
    expect(await run(0)).toBe(0)
  })

  it('--once exits 2 when the native build fails, so a script or CI step stops', async () => {
    expect(await run(65)).toBe(2)
  })
})
