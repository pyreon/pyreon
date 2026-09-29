import { afterEach, describe, expect, it } from 'vitest'
import { findUnusedTestImports } from '../../../../../scripts/check-unused-test-imports'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture(source: string): string {
  const cache = join(process.cwd(), '.cache')
  mkdirSync(cache, { recursive: true })
  const dir = mkdtempSync(join(cache, 'unused-imports-'))
  dirs.push(dir)
  const file = join(dir, 'fixture.test.tsx')
  writeFileSync(file, source)
  return file
}

describe('findUnusedTestImports', () => {
  it('finds unused default, named, aliased, namespace and type imports', () => {
    const file = fixture(`
      import defaultThing from 'typescript'
      import { aggregateKind as used, decideNeeds as unused, reproductionCommand as alias } from '../scripts/ci-aggregate'
      import * as namespace from '../scripts/ci-flake-report'
      import type { JobInfo as UsedType, Verdict as UnusedType } from '../scripts/ci-aggregate'
      import './side-effect'
      const value = null as unknown as UsedType
      void used
      void value
    `)
    expect(findUnusedTestImports([file]).map((f) => f.name)).toEqual([
      'defaultThing',
      'unused',
      'alias',
      'namespace',
      'UnusedType',
    ])
  })

  it('counts JSX and shorthand-property references as uses', () => {
    const file = fixture(`
      import { Component, helper } from './missing'
      const props = { helper }
      const view = <Component {...props} />
      void view
    `)
    expect(findUnusedTestImports([file])).toEqual([])
  })

  it('counts a re-export of an imported binding as a use', () => {
    const file = fixture(`
      import { aggregateKind } from '../scripts/ci-aggregate'
      export { aggregateKind }
    `)
    expect(findUnusedTestImports([file])).toEqual([])
  })

  it('does not mistake the imported-side name of an alias for a use', () => {
    const file = fixture(`import { externalName as localName } from './missing'`)
    expect(findUnusedTestImports([file]).map((f) => f.name)).toEqual(['localName'])
  })

  it('does not mistake a shadowed identifier for use of the import', () => {
    const file = fixture(`
      import { helper } from './missing'
      function run(helper: string) { return helper }
      void run
    `)
    expect(findUnusedTestImports([file]).map((f) => f.name)).toEqual(['helper'])
  })
})
