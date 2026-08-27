import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareSets,
  declaredPyreonDeps,
  packagesInGradle,
  packagesInWiring,
} from '../../../../../scripts/check-native-srcdirs-drift'

/**
 * The gate compares an example's hardcoded Gradle `srcDir`s against what
 * `pyreon-native wire` resolves. Its pure halves had no tests at all, and the
 * one that matters most is the discrimination added after the gate misfired in
 * an under-installed worktree: `wireApp` resolves through node_modules, so a
 * missing install makes it return a subset, and the drift report then inverts —
 * "the app no longer declares these; drop the srcDir" is the exact opposite of
 * the truth, and following it would delete working wiring.
 */
describe('packagesInGradle', () => {
  it('extracts feature packages and skips the two base runtimes', () => {
    const gradle = `
      srcDir("../../../packages/native/runtime-kotlin/src/main/kotlin")
      srcDir("../../../packages/native/router-kotlin/src/main/kotlin")
      srcDir("../../../packages/fundamentals/form/native/kotlin")
      srcDir("../../../packages/core/sized-map/native/kotlin")
    `
    expect([...packagesInGradle(gradle)].sort()).toEqual(['form', 'sized-map'])
  })
})

describe('packagesInWiring', () => {
  it('reads the package name out of a resolved node_modules path', () => {
    expect(
      [...packagesInWiring(['/x/node_modules/@pyreon/toast/native/kotlin'])],
    ).toEqual(['toast'])
  })
})

describe('compareSets', () => {
  it('is null when the two agree', () => {
    expect(compareSets('e', new Set(['a']), new Set(['a']))).toBeNull()
  })

  it('reports both directions, sorted', () => {
    const f = compareSets('e', new Set(['b', 'extra']), new Set(['b', 'missing']))
    expect(f?.missingFromGradle).toEqual(['missing'])
    expect(f?.extraInGradle).toEqual(['extra'])
  })
})

describe('declaredPyreonDeps', () => {
  const write = (contents: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-srcdirs-'))
    const p = join(dir, 'package.json')
    writeFileSync(p, contents)
    return p
  }

  it('counts only @pyreon/* dependencies', () => {
    const p = write(
      JSON.stringify({
        dependencies: { '@pyreon/form': '*', '@pyreon/toast': '*', zod: '^3' },
        devDependencies: { '@pyreon/tsconfig': '*' },
      }),
    )
    expect(declaredPyreonDeps(p)).toBe(2)
  })

  it('returns 0 rather than throwing on unreadable or malformed input', () => {
    // The count only decides which MESSAGE to print, so a parse failure must
    // degrade to the ordinary drift report, never take the gate down.
    expect(declaredPyreonDeps('/definitely/not/here/package.json')).toBe(0)
    expect(declaredPyreonDeps(write('{ not json'))).toBe(0)
  })

  it('returns 0 when there are no dependencies at all', () => {
    expect(declaredPyreonDeps(write(JSON.stringify({ name: 'x' })))).toBe(0)
  })
})
