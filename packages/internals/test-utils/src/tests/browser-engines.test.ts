import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  discoverEngineSuites,
  parseAffectedFlags,
  selectEngineSuites,
} from '../../../../../scripts/browser-engines'

/**
 * `scripts/browser-engines.ts` decides whether CI installs WebKit + Firefox and
 * runs the cross-engine suites. A false negative silently skips the only check
 * that exercises a non-Chromium engine, so every uncertain input must select
 * EVERYTHING — the fail-closed half is what these specs lock.
 */
describe('browser-engines selection', () => {
  const suites = ['@pyreon/http', '@pyreon/router', '@pyreon/styler']

  it('narrows to the affected opted-in packages', () => {
    const flags = "--filter='@pyreon/core' --filter='@pyreon/router' --filter='@pyreon/styler'"
    expect(selectEngineSuites(flags, suites)).toEqual(['@pyreon/router', '@pyreon/styler'])
  })

  it('reads the unquoted and double-quoted flag spellings too', () => {
    expect(selectEngineSuites('--filter=@pyreon/http --filter="@pyreon/styler"', suites)).toEqual([
      '@pyreon/http',
      '@pyreon/styler',
    ])
  })

  it('an empty verdict (nothing affected) selects nothing', () => {
    expect(selectEngineSuites('', suites)).toEqual([])
    expect(selectEngineSuites('  \n', suites)).toEqual([])
  })

  it('an affected set with no opted-in package selects nothing', () => {
    expect(selectEngineSuites("--filter='@pyreon/core'", suites)).toEqual([])
  })

  describe('fail-closed', () => {
    it('no verdict at all selects every suite', () => {
      expect(selectEngineSuites(null, suites)).toEqual(suites)
    })

    it('the root-file `--filter=*` verdict selects every suite', () => {
      expect(selectEngineSuites('--filter=*', suites)).toEqual(suites)
      expect(selectEngineSuites("--filter='*'", suites)).toEqual(suites)
    })

    it('any token that is not a --filter flag selects every suite', () => {
      expect(parseAffectedFlags("--filter='@pyreon/http' error: boom")).toBeNull()
      expect(selectEngineSuites('Error: git diff failed', suites)).toEqual(suites)
    })
  })

  it('discovers exactly the packages that declare `test:browser:engines`', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-engines-')))
    try {
      const write = (rel: string, json: object) => {
        mkdirSync(join(root, rel), { recursive: true })
        writeFileSync(join(root, rel, 'package.json'), JSON.stringify(json))
      }
      write('packages/core/b', {
        name: '@x/b',
        scripts: { 'test:browser': 'v', 'test:browser:engines': 'v' },
      })
      write('packages/core/a', { name: '@x/a', scripts: { 'test:browser:engines': 'v' } })
      write('packages/tools/c', { name: '@x/c', scripts: { 'test:browser': 'v' } })
      write('packages/tools/d', { name: '@x/d' })
      writeFileSync(join(root, 'packages', 'stray-file'), '')
      expect(discoverEngineSuites(root)).toEqual(['@x/a', '@x/b'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('the real repo opts in the packages this PR measured green in all three engines', () => {
    expect(discoverEngineSuites()).toEqual(
      expect.arrayContaining(['@pyreon/http', '@pyreon/router', '@pyreon/runtime-dom', '@pyreon/styler']),
    )
  })
})
