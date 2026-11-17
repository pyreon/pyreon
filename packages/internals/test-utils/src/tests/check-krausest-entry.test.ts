/**
 * `contrib/krausest/pyreon-keyed` is the entry staged for the independent
 * krausest/js-framework-benchmark. It is not a workspace member, so nothing
 * but `scripts/check-krausest-entry.ts` notices when it stops meeting
 * upstream's rules. These specs hold the committed entry to that gate and
 * prove each rule fails on the drift it exists for, by mutating the real
 * files.
 */
import {
  acceptablePins,
  changelogVersions,
  checkEntry,
  checkIssueFlags,
  checkLockfile,
  checkMarkup,
  checkPackageJson,
  checkPinFreshness,
  checkReadme,
  checkRowParity,
  compileSource,
  type EntryFiles,
  type EntryLockfile,
  type EntryPackageJson,
  pinnedPyreonVersion,
  readEntryFiles,
  rowIdioms,
} from '../../../../../scripts/check-krausest-entry'

const clone = <T>(value: T): T => structuredClone(value)

describe('check-krausest-entry', () => {
  let files: EntryFiles
  beforeAll(async () => {
    files = await readEntryFiles()
  })

  const pkgWith = (edit: (pkg: EntryPackageJson) => void): EntryPackageJson => {
    const pkg = clone(files.pkg)
    edit(pkg)
    return pkg
  }
  const lockWith = (edit: (lock: EntryLockfile) => void): EntryLockfile => {
    const lock = clone(files.lock!)
    edit(lock)
    return lock
  }
  const markup = async (source: string): Promise<string[]> => checkMarkup(source, await compileSource(source), files.indexHtml)

  it('the committed entry passes every rule', () => {
    expect(checkEntry(files)).toEqual([])
    expect(pinnedPyreonVersion(files.pkg)).toMatch(/^\d+\.\d+\.\d+$/)
  })

  describe('package.json', () => {
    it('rejects a range and the workspace protocol', () => {
      const ranged = pkgWith((p) => (p.dependencies!['@pyreon/core'] = `^${p.dependencies!['@pyreon/core']}`))
      expect(checkPackageJson(ranged).join('\n')).toContain('is not an exact version')
      const workspace = pkgWith((p) => (p.devDependencies!['@pyreon/vite-plugin'] = 'workspace:*'))
      expect(checkPackageJson(workspace).join('\n')).toContain('@pyreon/vite-plugin@workspace:* is not an exact version')
      const rangedTool = pkgWith((p) => (p.devDependencies!.vite = `~${p.devDependencies!.vite}`))
      expect(checkPackageJson(rangedTool).join('\n')).toContain('vite@~')
    })

    it('rejects @pyreon/* dependencies on different versions', () => {
      const mixed = pkgWith((p) => (p.dependencies!['@pyreon/reactivity'] = '0.1.0'))
      expect(pinnedPyreonVersion(mixed)).toBeUndefined()
      expect(checkPackageJson(mixed).join('\n')).toContain('pinned to different versions')
    })

    it('requires each metadata field upstream reads', () => {
      for (const field of ['frameworkVersionFromPackage', 'frameworkHomeURL', 'repoURL', 'language'] as const) {
        const missing = pkgWith((p) => delete p['js-framework-benchmark']![field])
        expect(checkPackageJson(missing).join('\n'), field).toContain(field)
      }
      expect(checkPackageJson(pkgWith((p) => delete p['js-framework-benchmark'])).join('\n')).toContain('no "js-framework-benchmark" block')
      expect(checkPackageJson(pkgWith((p) => delete p.scripts!['build-prod'])).join('\n')).toContain('"build-prod"')
    })
  })

  describe('package-lock.json', () => {
    it('rejects a missing lockfile and one that is not npm v3', () => {
      expect(checkLockfile(files.pkg, undefined).join('\n')).toContain('package-lock.json is missing')
      expect(checkLockfile(files.pkg, { lockfileVersion: 1 }).join('\n')).toContain('lockfileVersion 3')
    })

    it('rejects a lockfile that no longer matches package.json', () => {
      const bumped = pkgWith((p) => {
        for (const section of [p.dependencies!, p.devDependencies!]) {
          for (const name of Object.keys(section)) if (name.startsWith('@pyreon/')) section[name] = '99.0.0'
        }
      })
      const problems = checkLockfile(bumped, files.lock).join('\n')
      expect(problems).toContain('out of sync with package.json')
      expect(problems).toContain('package.json pins 99.0.0')
      expect(problems).toContain('would mix Pyreon releases')
    })

    it('rejects a transitive @pyreon package on another version', () => {
      const lock = lockWith((l) => (l.packages!['node_modules/@pyreon/compiler']!.version = '0.1.0'))
      expect(checkLockfile(files.pkg, lock).join('\n')).toContain('@pyreon/compiler@0.1.0')
    })

    it('rejects a package resolved outside the public npm registry', () => {
      const lock = lockWith((l) => (l.packages!['node_modules/vite']!.resolved = 'https://registry.example.test/vite.tgz'))
      expect(checkLockfile(files.pkg, lock).join('\n')).toContain('upstream allows only https://registry.npmjs.org/')
    })
  })

  describe('pin freshness', () => {
    const changelog = '# pkg\n\n## 0.9.0\n\n### Minor Changes\n\n## 0.8.0\n\n## 0.7.0\n'
    const pinned = (version: string): EntryPackageJson => ({ dependencies: { '@pyreon/core': version } })

    it('reads release headings and nothing else', () => {
      expect(changelogVersions(changelog)).toEqual(['0.9.0', '0.8.0', '0.7.0'])
    })

    it('accepts the workspace version and the release before it, and nothing older', () => {
      expect(acceptablePins('0.9.0', changelog)).toEqual(['0.9.0', '0.8.0'])
      expect(checkPinFreshness(pinned('0.9.0'), '0.9.0', changelog)).toEqual([])
      expect(checkPinFreshness(pinned('0.8.0'), '0.9.0', changelog)).toEqual([])
      expect(checkPinFreshness(pinned('0.7.0'), '0.9.0', changelog).join('\n')).toContain('pins Pyreon 0.7.0')
    })

    it('accepts the previous release when the workspace version has no changelog entry yet', () => {
      expect(acceptablePins('0.10.0', changelog)).toEqual(['0.10.0', '0.9.0'])
    })
  })

  describe('markup contract', () => {
    it('rejects a row whose element sequence or attributes differ from the reference', async () => {
      const noAria = files.source.replace('<span class="glyphicon glyphicon-remove" aria-hidden="true"></span>', '<span class="glyphicon glyphicon-remove"></span>')
      expect(noAria).not.toBe(files.source)
      expect((await markup(noAria)).join('\n')).toContain('aria-hidden="true"')

      const wrongClass = files.source.replace('<td class="col-md-4">', '<td class="col-md-5">')
      expect((await markup(wrongClass)).join('\n')).toContain('class="col-md-4"')

      const noLastCell = files.source.replace('<td class="col-md-6"></td>', '')
      expect((await markup(noLastCell)).join('\n')).toContain('requires exactly "tr td td a td a span td"')
    })

    it('rejects a missing button id, preload icon or stylesheet', async () => {
      expect((await markup(files.source.replace('id="swaprows"', 'id="swap"'))).join('\n')).toContain('id="swaprows"')
      expect((await markup(files.source.replace('preloadicon ', ''))).join('\n')).toContain('preload icon')
      const html = files.indexHtml.replace('/css/currentStyle.css', 'https://cdn.example.test/bootstrap.css')
      const problems = checkMarkup(files.source, files.compiled, html).join('\n')
      expect(problems).toContain('/css/currentStyle.css')
      expect(problems).toContain('nothing from a CDN')
    })
  })

  describe('issue flags', () => {
    it('requires a flagged technique to be declared', () => {
      const raf = `${files.source}\nrequestAnimationFrame(() => {})\n`
      expect(checkIssueFlags(files.pkg, raf).join('\n')).toContain('note #796')
      expect(checkIssueFlags(pkgWith((p) => (p['js-framework-benchmark']!.issues = [796])), raf)).toEqual([])

      const delegation = `${files.source}\ndocument.body.addEventListener('click', () => {})\n`
      expect(checkIssueFlags(files.pkg, delegation).join('\n')).toContain('note #801')

      const manualDom = `${files.source}\ndocument.querySelector('tr')!.classList.add('danger')\n`
      expect(checkIssueFlags(files.pkg, manualDom).join('\n')).toContain('note #772')
    })

    it('ignores a technique that is only named in a comment, and rejects an unknown flag', () => {
      expect(checkIssueFlags(files.pkg, `// no requestAnimationFrame here\n${files.source}`)).toEqual([])
      expect(checkIssueFlags(pkgWith((p) => (p['js-framework-benchmark']!.issues = [12345])), files.source).join('\n')).toContain('#12345')
    })
  })

  describe('row parity with the workspace bench arm', () => {
    it('reads the same idioms from both files', () => {
      expect(rowIdioms(files.source)).toEqual(rowIdioms(files.benchSource))
      expect(rowIdioms(files.source).idCell).toBe('row.id')
    })

    it('rejects a stringified row id, which the bench arm does not use', () => {
      const stringified = files.source.replace('{row.id}</td>', '{String(row.id)}</td>')
      expect(stringified).not.toBe(files.source)
      expect(checkRowParity(stringified, files.benchSource).join('\n')).toContain('"idCell" differs')
    })

    it('rejects a different selection or label binding, and a shape it cannot read', () => {
      const perRowFlag = files.source.replace("isSelected(row.id) ? 'danger' : ''", "row.selected() ? 'danger' : ''")
      expect(checkRowParity(perRowFlag, files.benchSource).join('\n')).toContain('"rowClass" differs')
      const eagerLabel = files.source.replace('{() => row.label()}', '{row.label.peek()}')
      expect(checkRowParity(eagerLabel, files.benchSource).join('\n')).toContain('"label" differs')
      expect(checkRowParity('export {}', files.benchSource).join('\n')).toContain('could not read')
    })
  })

  it('rejects a README that restates the pinned version', () => {
    expect(checkReadme('install `@pyreon/core@^0.38.0` first')).toHaveLength(1)
    expect(checkReadme('the pin once sat at ^0.38.0')).toEqual([])
  })
})
