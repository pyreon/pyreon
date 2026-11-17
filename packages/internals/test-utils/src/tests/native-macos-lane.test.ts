// Which pull requests start a macOS runner. A macOS minute is the scarcest one
// the org has (about three concurrent runners; on 2026-11-16 three jobs ran
// while eight queued), so `Validate emitted Swift (real-SDK typecheck, macOS)`
// and `iOS — xcodebuild` must start only when the change can reach what they
// read. The decision fails CLOSED: every doubt runs the job, because a skipped
// required check reports success.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyMacosLane,
  decideDevice,
  isAndroidGradleConfig,
  isDeviceTestSource,
  lockfileInertForNative,
  macosGraphFiles,
  type AppSurface,
  type SelfWorkflow,
} from '../../../../../scripts/native-surface-touched'
import { laneChanged, laneSurface, normalize } from '../../../../../scripts/native-workflow-surface'

const REPO = resolve(__dirname, '../../../../..')
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8')
const noFs = () => null
const MAC_JOBS = ['validate-swift-typecheck']
const DEVICE_JOBS = { ios: ['ios-build'], android: ['android-build'] }
const VALIDATE = '.github/workflows/native-validate.yml'
const DEVICE = '.github/workflows/native-device.yml'

const validateText = read(VALIDATE)
const deviceText = read(DEVICE)

const same = (file: string, text: string): SelfWorkflow => ({ file, head: text, base: text })
const edited = (file: string, base: string, head: string): SelfWorkflow => ({ file, head, base })

/** Replace the first occurrence INSIDE a job block; fails the test when the anchor moved. */
function editJob(text: string, job: string, from: string, to: string): string {
  const start = text.indexOf(`\n  ${job}:\n`)
  expect(start, `job ${job} present`).toBeGreaterThan(-1)
  const next = text.slice(start + 1).search(/\n {2}[A-Za-z_][\w-]*:\n/)
  const end = next === -1 ? text.length : start + 1 + next
  const block = text.slice(start, end)
  expect(block.includes(from), `anchor in ${job}: ${from}`).toBe(true)

  return text.slice(0, start) + block.replace(from, to) + text.slice(end)
}

const mac = (files: string[], self: SelfWorkflow = same(VALIDATE, validateText), manifests: Record<string, string> = {}) =>
  classifyMacosLane(files, (p) => manifests[p] ?? null, self, MAC_JOBS, { pluginSurface: new Set(), readBase: () => null })

describe('macOS typecheck — what must NOT start it', () => {
  it('a Gradle-only change to an Android example (the Dependabot gradle bump)', () => {
    const files = [
      'examples/native-counter-android/build.gradle.kts',
      'examples/native-counter-android/app/build.gradle.kts',
      'examples/native-tasks-android/settings.gradle.kts',
      'examples/native-tasks-android/gradle.properties',
    ]
    expect(mac(files).run).toBe(false)
  })
  it('an unrelated workflow bump (ci.yml, or another workflow pinning trufflehog)', () => {
    expect(mac(['.github/workflows/ci.yml']).run).toBe(false)
    expect(mac(['.github/workflows/secret-scan.yml']).run).toBe(false)
  })
  it('a bump of ci.yml together with a Gradle bump', () => {
    expect(mac(['.github/workflows/ci.yml', 'examples/native-counter-android/build.gradle.kts']).run).toBe(false)
  })
  it('an edit to the Linux validate job of this workflow', () => {
    const head = editJob(validateText, 'validate', 'timeout-minutes:', 'timeout-minutes: 1 #')
    expect(mac([VALIDATE], edited(VALIDATE, validateText, head)).run).toBe(false)
  })
  it('an edit to the decide job of this workflow', () => {
    const head = editJob(validateText, 'decide', 'timeout-minutes: 5', 'timeout-minutes: 6')
    expect(mac([VALIDATE], edited(VALIDATE, validateText, head)).run).toBe(false)
  })
  it('a comment-only edit, even inside the macOS job block', () => {
    const head = editJob(validateText, 'validate-swift-typecheck', '    runs-on: macos-15', '    # a new comment\n    runs-on: macos-15')
    expect(mac([VALIDATE], edited(VALIDATE, validateText, head)).run).toBe(false)
  })
  it('web-only package source and docs', () => {
    expect(mac(['packages/core/runtime-dom/src/mount.ts', 'docs/x.md']).run).toBe(false)
  })
})

describe('macOS typecheck — what MUST start it', () => {
  it('an edit inside the macOS job block', () => {
    const head = editJob(validateText, 'validate-swift-typecheck', 'timeout-minutes:', 'timeout-minutes: 1 #')
    const d = mac([VALIDATE], edited(VALIDATE, validateText, head))
    expect(d.run).toBe(true)
    expect(d.reasons[0]).toContain('definition changed')
  })
  it('an edit to the top-level env the job inherits', () => {
    const head = validateText.replace("SWIFT_VERSION: '6.4'", "SWIFT_VERSION: '6.5'")
    expect(head).not.toBe(validateText)
    expect(mac([VALIDATE], edited(VALIDATE, validateText, head)).run).toBe(true)
  })
  it('a script the macOS job runs, even when it is not a native-* script', () => {
    expect(mac(['scripts/snapshot-native-verdict-cache.ts']).run).toBe(true)
  })
  it.each([
    ['packages/native/compiler/src/emit-swift.ts'],
    ['packages/native/runtime-swift/Sources/PyreonRuntime/Signal.swift'],
    ['packages/fundamentals/flow/native/swift/PyreonFlowState.swift'],
    ['packages/fundamentals/form/src/native-plugin/emit.ts'],
    ['examples/native-tasks-ios/src/TasksApp.tsx'],
    ['examples/native-counter-ios/scripts/build.sh'],
    ['examples/native-counter-android/scripts/build.sh'],
    ['examples/native-tasks-android/app/src/androidTest/kotlin/com/pyreon/IntlDifferentialCases.kt'],
    ['scripts/native-macos-test-files.ts'],
    ['bun.lock'],
    ['.bun-version'],
  ])('%s', (file) => {
    expect(mac([file]).run).toBe(true)
  })
  it('a Gradle file mixed with an iOS source file', () => {
    expect(mac(['examples/native-counter-android/build.gradle.kts', 'examples/native-counter-ios/src/Counter.tsx']).run).toBe(true)
  })
})

describe('macOS typecheck — device tests and inert lockfile changes', () => {
  const UITEST = 'examples/native-counter-ios/iosUITests/PyreonCounterUITests.swift'
  const KTTEST = 'examples/native-tasks-android/app/src/androidTest/kotlin/com/pyreon/TasksAppInstrumentedTest.kt'
  const INTL = 'examples/native-tasks-android/app/src/androidTest/kotlin/com/pyreon/IntlDifferentialCases.kt'
  const run = (files: string[], present: string[]) =>
    classifyMacosLane(files, (p) => (present.includes(p) ? 'x' : null), same(VALIDATE, validateText), MAC_JOBS, { pluginSurface: new Set(), readBase: () => null })
  it('an XCUITest / instrumented-test edit that still exists starts no macOS job', () => {
    expect(run([UITEST, KTTEST], [UITEST, KTTEST]).run).toBe(false)
  })
  it('a deleted device-test file still starts it (the directory may be gone)', () => {
    expect(run([UITEST], []).run).toBe(true)
  })
  it('the androidTest file the macOS suite reads by name still starts it', () => {
    expect(isDeviceTestSource(INTL)).toBe(false)
    expect(run([INTL], [INTL]).run).toBe(true)
  })
  it('only the device-test directories are exempt', () => {
    for (const f of [
      'examples/native-counter-ios/src/Counter.tsx',
      'examples/native-counter-ios/ios/AppDelegate.swift',
      'examples/native-counter-android/app/src/main/kotlin/com/pyreon/MainActivity.kt',
      'examples/native-counter-ios/iosUITests/../src/Counter.tsx',
    ]) {
      expect(isDeviceTestSource(f), f).toBe(false)
    }
  })

  const lock = (csstype: string, bench = '1.0.0'): string => `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "root" },
    "packages/native/compiler": { "name": "@pyreon/native-compiler", "dependencies": { "csstype": "^3" } },
    "packages/bench/bench": { "name": "@pyreon/bench", "devDependencies": { "tinybench": "^2" } },
  },
  "packages": {
    "@pyreon/native-compiler": ["@pyreon/native-compiler@workspace:packages/native/compiler"],
    "csstype": ["csstype@${csstype}", "", {}, "sha512-c${csstype}"],
    "tinybench": ["tinybench@${bench}", "", {}, "sha512-t${bench}"],
  },
}
`
  const manifest = (extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ name: 'root', scripts: { a: 'x' }, devDependencies: { vitest: '5' }, ...extra })
  const files = (head: Record<string, string | null>, base: Record<string, string | null>) => [
    (p: string) => head[p] ?? null,
    (p: string) => base[p] ?? null,
  ]
  it('a web-only dependency bump with a new root script is inert', () => {
    const [h, b] = files(
      { 'bun.lock': lock('3.1.0', '2.0.0'), 'package.json': manifest({ scripts: { a: 'x', b: 'y' } }) },
      { 'bun.lock': lock('3.1.0'), 'package.json': manifest() },
    )
    expect(lockfileInertForNative(h!, b!)).toBe(true)
    expect(macosGraphFiles(['bun.lock', 'package.json', '.github/workflows/ci.yml', 'docs/x.md'], h!, b!)).toEqual(['docs/x.md'])
    expect(classifyMacosLane(['bun.lock'], h!, same(VALIDATE, validateText), MAC_JOBS, { pluginSurface: new Set(), readBase: b! }).run).toBe(false)
  })
  it.each([
    ['a native workspace dependency moved', { 'bun.lock': lock('3.2.0'), 'package.json': manifest() }],
    ['a root dependency moved', { 'bun.lock': lock('3.1.0'), 'package.json': manifest({ devDependencies: { vitest: '6' } }) }],
    ['a root override was added', { 'bun.lock': lock('3.1.0'), 'package.json': manifest({ overrides: { csstype: '3' } }) }],
    ['the lockfile does not parse', { 'bun.lock': '{nope', 'package.json': manifest() }],
    ['the root manifest does not parse', { 'bun.lock': lock('3.1.0'), 'package.json': '{nope' }],
    ['the lockfile is missing at the head', { 'package.json': manifest() }],
  ])('%s: not inert, the job runs', (_label, head) => {
    const [h, b] = files(head, { 'bun.lock': lock('3.1.0'), 'package.json': manifest() })
    expect(lockfileInertForNative(h!, b!)).toBe(false)
    expect(macosGraphFiles(['bun.lock', 'package.json'], h!, b!)).toEqual(['bun.lock', 'package.json'])
    expect(classifyMacosLane(['bun.lock'], h!, same(VALIDATE, validateText), MAC_JOBS, { pluginSurface: new Set(), readBase: b! }).run).toBe(true)
  })
  it('no readable base is never inert', () => {
    expect(lockfileInertForNative(() => 'x', undefined)).toBe(false)
  })
})

describe('macOS typecheck — unknown or malformed input runs it (fail-closed)', () => {
  it('an empty file list', () => {
    expect(mac([]).run).toBe(true)
  })
  it.each([
    ['base file missing', { file: VALIDATE, head: validateText, base: null }],
    ['base unreadable', { file: VALIDATE, head: validateText, base: new Error('git show failed') }],
    ['head unreadable', { file: VALIDATE, head: new Error('ENOENT'), base: validateText }],
    ['the job is gone from the head', { file: VALIDATE, head: 'jobs:\n  other:\n    runs-on: x\n', base: validateText }],
    ['the job is gone from the base', { file: VALIDATE, head: validateText, base: 'jobs:\n  other:\n    runs-on: x\n' }],
    ['the head is not a workflow at all', { file: VALIDATE, head: '\u0000\u0000', base: validateText }],
  ] as const)('%s', (_label, self) => {
    expect(mac([VALIDATE], self as SelfWorkflow).run).toBe(true)
  })
  it('an unreadable package manifest', () => {
    expect(mac(['packages/fundamentals/toast/package.json'], same(VALIDATE, validateText), { 'packages/fundamentals/toast/package.json': '{not json' }).run).toBe(true)
  })
  it('a plugin surface that could not be derived', () => {
    const d = classifyMacosLane(['packages/fundamentals/toast/src/index.ts'], noFs, same(VALIDATE, validateText), MAC_JOBS, { pluginSurface: new Error('boom'), readBase: () => null })
    expect(d.run).toBe(true)
  })
  it('the gradle exemption is exact: lookalike paths are not exempt', () => {
    for (const f of [
      'examples/native-counter-android/app/src/main/kotlin/build.gradle.kts.kt',
      'examples/native-counter-ios/build.gradle.kts',
      'examples/native-counter-android/gradle/../scripts/build.sh',
    ]) {
      expect(isAndroidGradleConfig(f), f).toBe(false)
    }
  })
})

const SURFACES: AppSurface[] = [
  { platform: 'ios', app: 'counter', roots: ['examples/native-counter-ios/', 'examples/native-counter/'] },
  { platform: 'android', app: 'counter', roots: ['examples/native-counter-android/', 'examples/native-counter/'] },
  { platform: 'android', app: 'tasks', roots: ['examples/native-tasks-android/'] },
]

const device = (files: string[], self: SelfWorkflow = same(DEVICE, deviceText)) =>
  decideDevice(files, noFs, self, DEVICE_JOBS, { pluginSurface: new Set(), readBase: () => null, surfaces: () => SURFACES })

describe('iOS lane (native-device.yml)', () => {
  it('a Gradle-only change selects Android and never iOS', () => {
    const d = device(['examples/native-counter-android/build.gradle.kts'])
    expect(d.selection.ios).toBe('none')
    expect(d.selection.android).toEqual(['counter'])
  })
  it('an unrelated workflow bump selects nothing', () => {
    const d = device(['.github/workflows/ci.yml', '.github/workflows/native-validate.yml'])
    expect(d.run).toBe(false)
    expect(d.selection.ios).toBe('none')
    expect(d.selection.android).toBe('none')
  })
  it('an edit to the Android job or a decide job leaves iOS alone', () => {
    const android = editJob(deviceText, 'android-build', 'timeout-minutes:', 'timeout-minutes: 1 #')
    const d = device([DEVICE], edited(DEVICE, deviceText, android))
    expect(d.selection.ios).toBe('none')
    expect(d.selection.android).toBe('all')
    const changes = editJob(deviceText, 'changes', 'timeout-minutes: 5', 'timeout-minutes: 6')
    const e = device([DEVICE], edited(DEVICE, deviceText, changes))
    expect(e.run).toBe(false)
    expect(e.selection.ios).toBe('none')
  })
  it('an edit inside the iOS job selects every iOS app and no Android app', () => {
    const ios = editJob(deviceText, 'ios-build', 'timeout-minutes:', 'timeout-minutes: 1 #')
    const d = device([DEVICE], edited(DEVICE, deviceText, ios))
    expect(d.run).toBe(true)
    expect(d.selection.ios).toBe('all')
    expect(d.selection.android).toBe('none')
  })
  it('an iOS example change selects its app', () => {
    const d = device(['examples/native-counter-ios/src/Counter.tsx'])
    expect(d.selection.ios).toEqual(['counter'])
  })
  it('a file claimed by no app, an empty list and an unreadable base run every lane', () => {
    expect(device(['bun.lock']).selection.ios).toBe('all')
    expect(device([]).selection.ios).toBe('all')
    const d = device([DEVICE], { file: DEVICE, head: deviceText, base: new Error('x') })
    expect(d.selection.ios).toBe('all')
    expect(d.selection.android).toBe('all')
  })
})

describe('the workflow reader', () => {
  it('finds the three lane jobs in the real workflows', () => {
    expect(laneSurface(validateText, MAC_JOBS)).not.toBeNull()
    expect(laneSurface(deviceText, ['ios-build'])).not.toBeNull()
    expect(laneSurface(deviceText, ['android-build'])).not.toBeNull()
  })
  it('names the scripts the macOS job runs', () => {
    const named = laneSurface(validateText, MAC_JOBS)!.named
    expect(named).toContain('scripts/bootstrap.ts')
    expect(named).toContain('scripts/snapshot-native-verdict-cache.ts')
    expect(named).toContain('scripts/check-native-coverage.ts')
  })
  it('is identical for an unchanged file and ignores trailing whitespace and comment lines', () => {
    expect(laneChanged(validateText, validateText, MAC_JOBS).changed).toBe(false)
    expect(normalize(['a: 1  ', '# c', '', 'b: |', '  # kept', '  x', 'c: 2'])).toEqual([
      'a: 1',
      'b: |',
      '  # kept',
      '  x',
      'c: 2',
    ])
  })
  it('a comment inside a shell block scalar IS part of the surface', () => {
    const base = 'jobs:\n  j:\n    steps:\n      - run: |\n          echo a\n'
    const head = 'jobs:\n  j:\n    steps:\n      - run: |\n          echo a\n          # more\n'
    expect(laneChanged(head, base, ['j']).changed).toBe(true)
  })
  it('keeps the required check names byte-identical', () => {
    expect(validateText).toContain('    name: Validate emitted Swift (real-SDK typecheck, macOS)\n')
    expect(validateText).toContain('    name: Validate emitted Swift + Kotlin\n')
    expect(validateText).toContain('    name: Decide (native paths touched?)\n')
    expect(deviceText).toContain('    name: iOS — xcodebuild (Simulator SDK)\n')
    expect(deviceText).toContain('    name: Changes (decide native)\n')
  })
})

describe('the workflows are wired to the decision (a skipped job still reports success)', () => {
  const macJob = (): string => {
    const start = validateText.indexOf('\n  validate-swift-typecheck:\n')
    return validateText.slice(start, start + 4000)
  }
  it('the macOS job is gated on macos / graph-macos and only an explicit false skips it', () => {
    expect(macJob()).toContain(
      "needs.decide.outputs.macos != 'false' || needs.decide.outputs['graph-macos'] != 'false'",
    )
    expect(macJob()).toContain("failure() && needs.decide.result != 'success'")
  })
  it('decide drops workflow files from the macOS graph input and answers a workflow-only diff itself', () => {
    expect(validateText).toContain('--macos-graph-files="$FILES_MAC"')
    expect(validateText).toContain('elif [ -s "$FILES" ]; then\n            GRAPH_MAC=\'\'')
    expect(validateText).toContain('--macos-jobs=validate-swift-typecheck')
    expect(validateText).toMatch(/echo "macos=true" >> "\$GITHUB_OUTPUT"\n\s+echo "graph-macos=true"/)
  })
  it('the Linux validate job keeps the old whole-file rule', () => {
    expect(validateText).toContain("needs.decide.outputs.run == 'true' || needs.decide.outputs.graph == 'true'")
  })
  it('the device workflow names both lane jobs to the classifier', () => {
    expect(deviceText).toContain('--ios-jobs=ios-build --android-jobs=android-build')
  })
})
