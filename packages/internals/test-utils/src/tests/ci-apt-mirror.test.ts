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

  it('rewrites every regional mirror, not only the Azure one', () => {
    // us-east-2.ec2 is the mirror that served a us-west-2 runner at ~250 kB/s.
    for (const host of [
      'us-east-2.ec2.archive.ubuntu.com',
      'eu-west-1.ec2.archive.ubuntu.com',
      'us.archive.ubuntu.com',
      'azure.archive.ubuntu.com',
    ]) {
      const line = `http://${host}/ubuntu\t priority:1\n`
      expect(ubuntuArchiveSource(line)).toBe(`${CURRENT}\t priority:1\n`)
      expect(ubuntuArchiveSource(`deb https://${host}/ubuntu resolute main\n`)).toBe(
        `deb ${CURRENT} resolute main\n`,
      )
    }
  })

  it('leaves the security and ports archives alone', () => {
    const source = `deb https://security.ubuntu.com/ubuntu resolute-security main\ndeb http://ports.ubuntu.com/ubuntu-ports resolute main\n`
    expect(ubuntuArchiveSource(source)).toBe(source)
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
      expect(setCiAptMirror(root).sort()).toEqual(files.map((name) => join(root, name)).sort())
      for (const name of files)
        expect(readFileSync(join(root, name), 'utf8')).toBe(`${CURRENT} noble main\n`)
      expect(readFileSync(backup, 'utf8')).toBe(OLD)
      expect(setCiAptMirror(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('updates a referenced mirror list with priorities, without changing its source entry or unrelated files', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-ci-apt-mirrorlist-'))
    try {
      mkdirSync(join(root, 'sources.list.d'))
      const mirror = join(root, 'apt-mirrors.txt')
      const other = join(root, 'unreferenced.txt')
      const source = `Types: deb\nURIs: mirror+file:${mirror}\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /keys/ubuntu.gpg\n`
      writeFileSync(join(root, 'sources.list.d/ubuntu.sources'), source)
      writeFileSync(
        join(root, 'sources.list'),
        `deb mirror+file:${mirror} noble main\n# deb mirror+file:${other} noble main\n`,
      )
      writeFileSync(mirror, `${OLD}/\tpriority:1\n${CURRENT}/\tpriority:2\n`)
      writeFileSync(other, OLD)
      expect(setCiAptMirror(root)).toEqual([mirror])
      expect(readFileSync(mirror, 'utf8')).toBe(
        `${CURRENT}/\tpriority:1\n${CURRENT}/\tpriority:2\n`,
      )
      expect(readFileSync(join(root, 'sources.list.d/ubuntu.sources'), 'utf8')).toBe(source)
      expect(readFileSync(other, 'utf8')).toBe(OLD)
      expect(setCiAptMirror(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not follow a disabled deb822 mirror-list entry', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-ci-apt-disabled-'))
    try {
      mkdirSync(join(root, 'sources.list.d'))
      const mirror = join(root, 'disabled.txt')
      writeFileSync(
        join(root, 'sources.list.d/disabled.sources'),
        `Types: deb\nURIs: mirror+file:${mirror}\nEnabled: no\n`,
      )
      writeFileSync(mirror, OLD)
      expect(setCiAptMirror(root)).toEqual([])
      expect(readFileSync(mirror, 'utf8')).toBe(OLD)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('handles absent optional source locations and propagates unreadable active configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-ci-apt-empty-'))
    try {
      expect(setCiAptMirror(root)).toEqual([])
      mkdirSync(join(root, 'sources.list'))
      expect(() => setCiAptMirror(root)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
