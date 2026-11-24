/**
 * The synthetic SSG/SSR entry gets a per-build name.
 *
 * Both plugins write a generated entry into the Vite root and remove it in
 * `finally`. With one fixed name, two builds of the SAME root at once (a
 * tool that ships its own app — two `atlas build` runs, or test files
 * building it in parallel) shared the file, and the first to finish deleted
 * it under the other: `Cannot resolve entry module
 * app/__pyreon-zero-ssg-entry.js`, seen in a pre-push run. The race window is
 * too narrow to reproduce on demand, so the property is asserted directly:
 * two builds never name the same file.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syntheticEntryPath } from '../ssr-build-shared'

describe('syntheticEntryPath', () => {
  it('names a different file for every build, in the root, under the same stem', () => {
    const a = syntheticEntryPath('/app', '__pyreon-zero-ssg-entry.js')
    const b = syntheticEntryPath('/app', '__pyreon-zero-ssg-entry.js')
    expect(a).not.toBe(b)
    for (const p of [a, b]) {
      expect(p.startsWith(join('/app', '__pyreon-zero-ssg-entry-'))).toBe(true)
      expect(p.endsWith('.js')).toBe(true)
    }
  })

  it('matches the scaffolded .gitignore glob, so an interrupted build leaves nothing tracked', () => {
    const name = syntheticEntryPath('/app', '__pyreon-zero-ssr-entry.js').split('/').at(-1)!
    // `__pyreon-zero-ssr-entry*.js` in create-zero / create-multiplatform.
    expect(name).toMatch(/^__pyreon-zero-ssr-entry.*\.js$/)
    expect(name).not.toBe('__pyreon-zero-ssr-entry.js')
  })
})
