import { describe, expect, it } from 'vitest'
import { changesetBumps, changesetProblems } from '../../../../../scripts/check-breaking-changeset-codemod'

const CM = new Map([
  ['zero-remove-vite-option', '@pyreon/zero'],
  ['router-thing', '@pyreon/router'],
])
const cs = (front: string, body: string): string => `---\n${front}\n---\n\n${body}\n`

describe('check-breaking-changeset-codemod', () => {
  it('parses quoted and unquoted frontmatter keys', () => {
    expect(changesetBumps(cs(`'@pyreon/zero': minor\n"@pyreon/server": patch`, 'x'))).toEqual({
      '@pyreon/zero': 'minor',
      '@pyreon/server': 'patch',
    })
  })

  it('a zero minor with no Upgrade line fails; a patch or another package does not', () => {
    expect(changesetProblems('a.md', cs(`'@pyreon/zero': minor`, 'Changed a thing.'), CM)[0]).toContain('no "Upgrade:" line')
    expect(changesetProblems('a.md', cs(`'@pyreon/zero': patch`, 'Fix.'), CM)).toEqual([])
    expect(changesetProblems('a.md', cs(`'@pyreon/router': minor`, 'Feat.'), CM)).toEqual([])
  })

  it('accepts none, a registered zero codemod, and a reasoned manual step', () => {
    const z = `'@pyreon/zero': minor`
    expect(changesetProblems('a.md', cs(z, 'Upgrade: none'), CM)).toEqual([])
    expect(changesetProblems('a.md', cs(z, 'Upgrade: codemod zero-remove-vite-option'), CM)).toEqual([])
    expect(changesetProblems('a.md', cs(z, 'Upgrade: manual — rename `foo` to `bar` in every route file'), CM)).toEqual([])
  })

  it('rejects an unknown codemod, a codemod for another package, a thin reason, and junk', () => {
    const z = `'@pyreon/zero': minor`
    expect(changesetProblems('a.md', cs(z, 'Upgrade: codemod nope'), CM)[0]).toContain('not in the registry')
    expect(changesetProblems('a.md', cs(z, 'Upgrade: codemod router-thing'), CM)[0]).toContain('migrates @pyreon/router')
    expect(changesetProblems('a.md', cs(z, 'Upgrade: manual — see docs'), CM)[0]).toContain('at least 20')
    expect(changesetProblems('a.md', cs(z, 'Upgrade: maybe'), CM)[0]).toContain('unrecognised')
    expect(changesetProblems('a.md', cs(z, 'Upgrade: none\nUpgrade: none'), CM)[0]).toContain('more than one')
  })
})
