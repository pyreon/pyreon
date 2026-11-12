/**
 * Locks every machine-readable surface of `pyreon-native` byte for byte:
 * `check --json`, `wire --json` (+ the `--android-out` srcDirs file) and the
 * LSP diagnostics payload. Tools parse these; the human text may change,
 * these may not. The snapshots were written against the code BEFORE the
 * human output moved to the shared terminal theme, so a diff here means the
 * theme work leaked into a machine surface.
 *
 * Temp paths are replaced by `<root>` so the snapshot is stable.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'
import { check } from '../check'
import { diagnosticsForDocument, findingsToDiagnostics } from '../lsp'

const CLEAN = 'export function C() { return <Text>hello</Text> }'
const WARNS =
  'function first<T>(xs: T[]): T { return xs[0] }\nexport function C() { return <Text>hi</Text> }'
const BROKEN = 'export function C() { return <Text>oops< }'
const WEB_ENTRY = "import { mount } from '@pyreon/runtime-dom'\nmount(null, document.body)"

let root: string
let logs: string[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-lock-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

const scrub = (s: string): string => s.split(root).join('<root>')

const srcDir = (): string => {
  const dir = join(root, 'src')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'Clean.tsx'), CLEAN)
  writeFileSync(join(dir, 'Warns.tsx'), WARNS)
  writeFileSync(join(dir, 'Broken.tsx'), BROKEN)
  writeFileSync(join(dir, 'entry.tsx'), WEB_ENTRY)
  return dir
}

describe('check --json', () => {
  it('both targets: one line, byte-identical', () => {
    expect(main(['check', `--source=${srcDir()}`, '--json'])).toBe(2)
    expect(logs).toHaveLength(1)
    expect(scrub(logs[0]!)).toMatchSnapshot()
  })

  it('one target, warnings only', () => {
    const dir = join(root, 'w')
    mkdirSync(dir)
    writeFileSync(join(dir, 'Warns.tsx'), WARNS)
    expect(main(['check', `--source=${dir}`, '--target=android', '--json'])).toBe(0)
    expect(logs).toHaveLength(1)
    expect(scrub(logs[0]!)).toMatchSnapshot()
  })
})

describe('wire --json', () => {
  const writePackage = (dir: string, manifest: Record<string, unknown>, files: string[] = []) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    for (const rel of files) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), '// native\n')
    }
  }
  const app = (): string => {
    const dir = join(root, 'app')
    writePackage(dir, {
      name: 'app',
      dependencies: { '@pyreon/native-runtime-swift': '*', '@pyreon/native-runtime-kotlin': '*', feat: '*' },
    })
    const nm = join(dir, 'node_modules')
    writePackage(
      join(nm, '@pyreon/native-runtime-swift'),
      { name: '@pyreon/native-runtime-swift', pyreon: { native: { swift: { module: 'PyreonRuntime', dir: 'Sources/PyreonRuntime' } } } },
      ['Package.swift', 'Sources/PyreonRuntime/R.swift'],
    )
    writePackage(
      join(nm, '@pyreon/native-runtime-kotlin'),
      { name: '@pyreon/native-runtime-kotlin', pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } } },
      ['src/main/kotlin/R.kt'],
    )
    writePackage(
      join(nm, 'feat'),
      { name: 'feat', pyreon: { native: { swift: { module: 'Feat', dir: 'native/swift' }, kotlin: 'native/kotlin' } } },
      ['native/swift/F.swift', 'native/kotlin/F.kt'],
    )
    return dir
  }

  it('prints the wiring JSON byte-identical', () => {
    expect(main(['wire', `--app=${app()}`, '--json'])).toBe(0)
    expect(logs).toHaveLength(1)
    expect(scrub(logs[0]!)).toMatchSnapshot()
  })

  it('--android-out writes the same srcDirs file', () => {
    const dir = app()
    expect(main(['wire', `--app=${dir}`, '--android-out=android/srcdirs.txt', '--json'])).toBe(0)
    expect(scrub(readFileSync(join(dir, 'android', 'srcdirs.txt'), 'utf8'))).toMatchSnapshot()
  })
})

describe('LSP diagnostics payload', () => {
  it('findingsToDiagnostics over real check findings', () => {
    const result = check({ source: srcDir() })
    expect(scrub(JSON.stringify(findingsToDiagnostics(result.findings), null, 2))).toMatchSnapshot()
  })

  it('diagnosticsForDocument for a broken and a warning buffer', () => {
    const file = join(root, 'Doc.tsx')
    expect(
      scrub(
        JSON.stringify({
          broken: diagnosticsForDocument(BROKEN, file),
          warns: diagnosticsForDocument(WARNS, file),
          web: diagnosticsForDocument(WEB_ENTRY, file),
        }),
      ),
    ).toMatchSnapshot()
  })
})
