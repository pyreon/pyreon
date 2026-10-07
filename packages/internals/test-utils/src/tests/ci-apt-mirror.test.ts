import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setCiAptMirror, ubuntuArchiveSource } from '../../../../../scripts/set-ci-apt-mirror'

const OLD = 'http://azure.archive.ubuntu.com/ubuntu'
const CURRENT = 'https://archive.ubuntu.com/ubuntu'

describe('CI Ubuntu APT archive configuration', () => {
  it('preserves suites, components and signing options in both source formats', () => {
    const legacy = `deb [signed-by=/keys/ubuntu.gpg] ${OLD} noble-updates main universe\n`
    const deb822 = `Types: deb deb-src\nURIs: ${OLD} https://security.ubuntu.com/ubuntu\nSuites: noble noble-security\nComponents: main universe\nSigned-By: /keys/ubuntu.gpg\n`
    expect(ubuntuArchiveSource(legacy)).toBe(legacy.replace(OLD, CURRENT))
    expect(ubuntuArchiveSource(deb822)).toBe(deb822.replace(OLD, CURRENT))
  })

  it('leaves other hosts, lookalike hosts and unrelated paths unchanged', () => {
    const source = `deb https://repo.example.org/ubuntu noble main\ndeb http://azure.archive.ubuntu.com.evil/ubuntu noble main\ndeb http://azure.archive.ubuntu.com/custom noble main\n`
    expect(ubuntuArchiveSource(source)).toBe(source)
    expect(ubuntuArchiveSource(CURRENT)).toBe(CURRENT)
  })

  it('updates the main list and every active .list/.sources file, ignoring backups', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-ci-apt-'))
    try {
      mkdirSync(join(root, 'sources.list.d'))
      const files = ['sources.list', 'sources.list.d/ubuntu.sources', 'sources.list.d/legacy.list']
      for (const name of files) writeFileSync(join(root, name), `${OLD} noble main\n`)
      const backup = join(root, 'sources.list.d/ubuntu.sources.backup')
      writeFileSync(backup, OLD)
      expect(setCiAptMirror(root).sort()).toEqual(files.map(name => join(root, name)).sort())
      for (const name of files) expect(readFileSync(join(root, name), 'utf8')).toBe(`${CURRENT} noble main\n`)
      expect(readFileSync(backup, 'utf8')).toBe(OLD)
      expect(setCiAptMirror(root)).toEqual([])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('handles absent optional source locations and propagates unreadable active configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-ci-apt-empty-'))
    try {
      expect(setCiAptMirror(root)).toEqual([])
      mkdirSync(join(root, 'sources.list'))
      expect(() => setCiAptMirror(root)).toThrow()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
