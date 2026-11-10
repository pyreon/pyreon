// The device lanes' input fingerprint. Its whole value is soundness: a skipped
// iOS/Android lane is a required check reporting success, so every input the
// lanes build must move the fingerprint, and the closure-only changes that do
// not reach the build (the 31-of-56 class) must not.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  emit,
  fingerprint,
  gatedApps,
  lockClosure,
  narrow,
  nativeWorkspaces,
  parseLockfile,
  type Fingerprint,
} from '../../../../../scripts/native-inputs-fingerprint'

const REPO = resolve(__dirname, '../../../../..')

// A bun.lock with: a native example depending on @pyreon/core (workspace) →
// core depends on `csstype`; a web-only bench workspace with a dev dependency
// on `tinybench`. Bun writes trailing commas; keep them.
function lock(versions: { csstype?: string; tinybench?: string; leftPad?: string } = {}): string {
  const v = { csstype: '3.1.0', tinybench: '2.0.0', leftPad: '1.0.0', ...versions }
  return `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "root", "devDependencies": { "typescript": "5.0.0", }, },
    "examples/native-demo": { "name": "@ex/native-demo", "dependencies": { "@pyreon/core": "workspace:*", }, },
    "examples/native-demo-ios": { "name": "@ex/native-demo-ios", "devDependencies": { "left-pad": "^1", }, },
    "packages/core/core": { "name": "@pyreon/core", "dependencies": { "csstype": "^3", }, "devDependencies": { "vitest": "^5", }, },
    "packages/bench/bench": { "name": "@pyreon/bench", "devDependencies": { "tinybench": "^2", }, },
  },
  "packages": {
    "@pyreon/core": ["@pyreon/core@workspace:packages/core/core"],
    "@pyreon/bench": ["@pyreon/bench@workspace:packages/bench/bench"],
    "csstype": ["csstype@${v.csstype}", "", {}, "sha512-c${v.csstype}"],
    "left-pad": ["left-pad@${v.leftPad}", "", {}, "sha512-l${v.leftPad}"],
    "tinybench": ["tinybench@${v.tinybench}", "", {}, "sha512-t${v.tinybench}"],
    "typescript": ["typescript@5.0.0", "", {}, "sha512-ts"],
    "vitest": ["vitest@5.0.0", "", {}, "sha512-v"],
  },
}
`
}

let root: string
const write = (rel: string, text: string): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}
const git = (...args: string[]): void => {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}
/** Commit the tree (tracked inputs come from the git index), emit, fingerprint. */
const fp = (): Fingerprint => {
  git('add', '-A')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x', '--allow-empty')
  emit(root)
  return fingerprint(root)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'native-fp-'))
  git('init', '-q')
  write('.gitignore', 'generated/\nnode_modules/\n')
  write('.bun-version', '1.4.0\n')
  write(
    'package.json',
    JSON.stringify({ name: 'root', workspaces: ['packages/*/*', 'examples/*'] }),
  )
  write('bun.lock', lock())
  write('.github/workflows/native-device.yml', 'jobs: {}\n# runs bun scripts/bootstrap.ts\n')
  write('scripts/bootstrap.ts', 'export {}\n')
  write('scripts/native-inputs-fingerprint.ts', '// self\n')
  // The "compiler": the lanes' emit reads the package-owned plugin AND the
  // compiler core. The web-only runtime file is imported by the plugin's
  // module graph but does not feed the emitted text.
  write('packages/native/compiler/src/emit.ts', 'export const PREFIX = "struct"\n')
  write('packages/fundamentals/machine/src/native-plugin/plugin.ts', 'PyreonMachine(initial: x)\n')
  write('packages/core/reactivity/src/effect.ts', 'export function effect() {}\n')
  write(
    'packages/native/runtime-swift/Sources/PyreonRuntime/Signal.swift',
    'final class Signal {}\n',
  )
  write('packages/fundamentals/flow/native/swift/Flow.swift', 'struct Flow {}\n')
  write('packages/core/compiler/native/src/lib.rs', 'fn main() {}\n')
  write('examples/native-demo/src/App.tsx', 'export const App = () => null\n')
  for (const platform of ['ios', 'android']) {
    const dir = `examples/native-demo-${platform}`
    write(`${dir}/project.yml`, `name: Demo-${platform}\n`)
    // Emit = what build.sh writes into the app: plugin output for iOS only,
    // so a Swift-only lowering change moves the iOS app and not Android.
    write(
      `${dir}/scripts/build.sh`,
      platform === 'ios'
        ? `set -e\ncd "$(dirname "$0")/.."\nmkdir -p generated\ncat ../../packages/fundamentals/machine/src/native-plugin/plugin.ts > generated/App.swift\n`
        : `set -e\ncd "$(dirname "$0")/.."\nmkdir -p generated\necho "class App" > generated/App.kt\n`,
    )
  }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('native-inputs-fingerprint — what must NOT move it', () => {
  it('a web-only runtime file the native plugins merely import', () => {
    const before = fp()
    write('packages/core/reactivity/src/effect.ts', 'export function effect() { console.log(1) }\n')
    expect(fp()).toEqual(before)
  })
  it('the JSX compiler Rust crate', () => {
    const before = fp()
    write('packages/core/compiler/native/src/lib.rs', 'fn main() { println!() }\n')
    expect(fp()).toEqual(before)
  })
  it('a lockfile change in a web-only dev dependency', () => {
    const before = fp()
    write('bun.lock', lock({ tinybench: '2.1.0' }))
    expect(fp()).toEqual(before)
  })
  it('an untracked node_modules tree inside an app', () => {
    const before = fp()
    write('examples/native-demo-ios/node_modules/x/index.js', 'junk\n')
    expect(fp()).toEqual(before)
  })
})

describe('native-inputs-fingerprint — what MUST move it', () => {
  it('a lowering change that alters emitted output moves exactly the affected app', () => {
    const before = fp()
    write(
      'packages/fundamentals/machine/src/native-plugin/plugin.ts',
      'PyreonMachine(initial:  x)\n',
    )
    const after = fp()
    expect(after.shared).toBe(before.shared)
    expect(after.apps['ios:demo']).not.toBe(before.apps['ios:demo'])
    expect(after.apps['android:demo']).toBe(before.apps['android:demo'])
  })
  it.each([
    ['a compiler core file', 'packages/native/compiler/src/emit.ts'],
    ['a native runtime source', 'packages/native/runtime-swift/Sources/PyreonRuntime/Signal.swift'],
    ['a co-located native source', 'packages/fundamentals/flow/native/swift/Flow.swift'],
    ['a shared native example source', 'examples/native-demo/src/App.tsx'],
    ['an app project file', 'examples/native-demo-ios/project.yml'],
    ['the device workflow', '.github/workflows/native-device.yml'],
    ['a root script the workflow names', 'scripts/bootstrap.ts'],
    ['this fingerprint script', 'scripts/native-inputs-fingerprint.ts'],
    ['the bun version', '.bun-version'],
  ])('%s', (_label, file) => {
    const before = fp()
    write(file, readFileSync(join(root, file), 'utf8') + '// changed\n')
    const after = fp()
    for (const app of Object.keys(before.apps)) {
      if (file.startsWith('examples/native-demo-ios/')) {
        expect(after.apps['ios:demo']).not.toBe(before.apps['ios:demo'])
        return
      }
      expect(after.apps[app], app).not.toBe(before.apps[app])
    }
  })
  it('a lockfile change in a native-relevant dependency (transitive runtime dep of a native example)', () => {
    const before = fp()
    write('bun.lock', lock({ csstype: '3.2.0' }))
    expect(fp().shared).not.toBe(before.shared)
  })
  it('a lockfile change in a native app dev dependency', () => {
    const before = fp()
    write('bun.lock', lock({ leftPad: '1.1.0' }))
    expect(fp().shared).not.toBe(before.shared)
  })
  it('a root override (changes resolution)', () => {
    const before = fp()
    write(
      'package.json',
      JSON.stringify({
        name: 'root',
        workspaces: ['packages/*/*', 'examples/*'],
        overrides: { csstype: '3.0.0' },
      }),
    )
    expect(fp().shared).not.toBe(before.shared)
  })
  it('an app whose emit fails throws (the workflow then runs every lane)', () => {
    write('examples/native-demo-ios/scripts/build.sh', 'exit 3\n')
    expect(() => fp()).toThrow()
  })
})

describe('narrow', () => {
  const base: Fingerprint = { shared: 's', apps: { 'ios:a': '1', 'ios:b': '2', 'android:a': '3' } }
  it('keeps only changed apps, and says none when nothing changed', () => {
    const head = { ...base, apps: { ...base.apps, 'ios:b': 'X' } }
    expect(narrow(base, head, 'ios', 'all')).toBe('b')
    expect(narrow(base, head, 'android', 'all')).toBe('none')
    expect(narrow(base, head, 'ios', 'a')).toBe('none')
    expect(narrow(base, head, 'ios', 'a b')).toBe('b')
  })
  it('keeps every app when all changed, and never widens a `none` selection', () => {
    const head = { shared: 'z', apps: { 'ios:a': 'X', 'ios:b': 'Y', 'android:a': 'Z' } }
    expect(narrow(base, head, 'ios', 'all')).toBe('all')
    expect(narrow(base, head, 'ios', 'none')).toBe('none')
  })
  it('treats an app missing from the base, or an unknown selected key, as changed', () => {
    const head = { ...base, apps: { ...base.apps, 'ios:new': '9' } }
    expect(narrow(base, head, 'ios', 'all')).toBe('new')
    expect(narrow(base, head, 'ios', 'ghost')).toBe('ghost')
  })
})

describe('the real repository — input-list guards', () => {
  it('every example directory a device lane builds in is a fingerprinted app', () => {
    const workflow = readFileSync(join(REPO, '.github/workflows/native-device.yml'), 'utf8')
    const used = new Set(
      [
        ...workflow.matchAll(/working-directory:\s*(examples\/native-[\w-]+-(?:ios|android))\b/g),
      ].map((m) => m[1]!),
    )
    expect(used.size).toBeGreaterThan(0)
    const gated = new Set(gatedApps(REPO).map((a) => a.dir))
    for (const dir of used) expect(gated, dir).toContain(dir)
  })
  it('every device-lane app key the workflow selects by is a fingerprinted app key', () => {
    const workflow = readFileSync(join(REPO, '.github/workflows/native-device.yml'), 'utf8')
    const keys = new Set(gatedApps(REPO).map((a) => `${a.platform}:${a.key}`))
    for (const m of workflow.matchAll(
      /contains\(format\(' \{0\} ', env\.(IOS|ANDROID)_APPS\), ' ([\w-]+) '\)/g,
    )) {
      expect(keys, `${m[1]} ${m[2]}`).toContain(`${m[1] === 'IOS' ? 'ios' : 'android'}:${m[2]}`)
    }
  })
  it('the lockfile closure resolves every native workspace', () => {
    const l = parseLockfile(readFileSync(join(REPO, 'bun.lock'), 'utf8'))
    const roots = nativeWorkspaces(l)
    expect(roots.some((r) => r.startsWith('packages/native/'))).toBe(true)
    expect(roots.some((r) => r.startsWith('examples/native-'))).toBe(true)
    expect(lockClosure(l, roots).filter((line) => line.includes('=MISSING'))).toEqual([])
  })
})
