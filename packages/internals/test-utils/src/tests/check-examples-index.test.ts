import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { compareExamplesIndex, readmeExampleLinks } from '../../../../../scripts/check-examples-index'
import { listExampleDirs } from '../../../../../scripts/example-dirs'

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..')

describe('check-examples-index', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'examples-index-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  // listExampleDirs takes the repository root; examples live under <root>/examples.
  const pkg = (rel: string): void => {
    mkdirSync(join(tmp, 'examples', rel), { recursive: true })
    writeFileSync(join(tmp, 'examples', rel, 'package.json'), '{}')
  }

  it('finds top-level and grouped example directories, skipping installs and plain folders', () => {
    pkg('app-showcase')
    pkg('compat/react')
    pkg('app-showcase/node_modules/dep')
    mkdirSync(join(tmp, 'examples/leftover/node_modules/x'), { recursive: true })
    writeFileSync(join(tmp, 'examples/README.md'), '')
    expect(listExampleDirs(tmp)).toEqual(['app-showcase', 'compat/react'])
  })

  it('reads ./dir/ links and ignores links that leave examples/', () => {
    const md = '[a](./app-showcase/) · [b](./compat/react/) · [c](../BENCHMARKS.md) · [d](./kanban)'
    expect(readmeExampleLinks(md)).toEqual(['app-showcase', 'compat/react', 'kanban'])
  })

  it('reports an unlisted example and a dangling link', () => {
    expect(compareExamplesIndex(['a', 'b'], ['a', 'gone'])).toEqual({ unlisted: ['b'], dangling: ['gone'] })
  })

  it('holds for the real examples/README.md', () => {
    const examplesRoot = join(REPO_ROOT, 'examples')
    const dirs = listExampleDirs(REPO_ROOT)
    expect(dirs.length).toBeGreaterThan(10)
    const links = readmeExampleLinks(readFileSync(join(examplesRoot, 'README.md'), 'utf8'))
    expect(compareExamplesIndex(dirs, links)).toEqual({ unlisted: [], dangling: [] })
  })
})
