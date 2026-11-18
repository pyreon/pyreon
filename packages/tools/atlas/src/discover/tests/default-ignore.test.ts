import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listComponentFiles } from '../discover'

/**
 * A catalog lists what a project OFFERS. Tests, stories and test fixtures sit
 * in the same tree and export real components, so discovery has to leave them
 * out by default: `@pyreon/ui-components`' AI-facing contract once gained three
 * components that existed only in `src/tests/instance-css-layer.fixture.ts`.
 */
describe('discovery skips files that are not part of the offered surface', () => {
  let dir = ''

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('lists components and leaves out tests, specs, stories, fixtures and declarations', () => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-default-ignore-'))
    mkdirSync(join(dir, 'src', 'tests'), { recursive: true })
    const files = [
      'src/Button.tsx',
      'src/Button.test.tsx',
      'src/Button.spec.ts',
      'src/Button.stories.tsx',
      'src/Button.d.ts',
      'src/tests/layer.fixture.ts',
      'src/tests/layer.fixture.tsx',
    ]
    for (const f of files) writeFileSync(join(dir, f), 'export const x = 1\n')

    const listed = listComponentFiles({ cwd: dir }).map((f) => f.slice(dir.length + 1).replace(/\\/g, '/'))
    expect(listed).toEqual(['src/Button.tsx'])
  })

  it('a name that only contains the word is still listed', () => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-default-ignore-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'FixtureCard.tsx'), 'export const x = 1\n')
    const listed = listComponentFiles({ cwd: dir }).map((f) => f.slice(dir.length + 1).replace(/\\/g, '/'))
    expect(listed).toEqual(['src/FixtureCard.tsx'])
  })
})
