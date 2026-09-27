// Drift lock: `CANONICAL_PRIMITIVES` must equal the UI primitives
// `@pyreon/primitives` actually exports.
//
// The Set is hand-maintained, and it is not decoration: it gates the
// "fell through to generic emit" warning and the styled() / attrs() /
// rocketstyle() base check. It drifted once already — `<Audio>` shipped as a
// fully-lowered primitive but was never added, so an `<Audio>` whose `src` the
// emitter could not read fell through SILENTLY while the identical `<Video>`
// shape warned. The prose around it drifted too ("15" vs "16" canonical
// primitives across the repo while the package exported 17).
//
// The package's exports are read from its SOURCE (every `export { X } from
// './web/X'`), so adding a component there without deciding its membership
// here fails this spec.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANONICAL_PRIMITIVES } from '../canonical-primitives'

/**
 * Exported by `@pyreon/primitives` from `./web/*`, but deliberately NOT
 * canonical members — each has a dedicated emitter that never reaches generic
 * emit, and none is a valid styled()/attrs()/rocketstyle() base.
 */
const NON_CANONICAL_EXPORTS = new Set([
  'Transition',
  'TransitionGroup',
  'WebView',
  'Web',
  'NativeIOS',
  'NativeAndroid',
])

function webComponentExports(): Set<string> {
  const index = readFileSync(
    resolve(__dirname, '../../../../core/primitives/src/index.ts'),
    'utf8',
  )
  const names = new Set<string>()
  for (const m of index.matchAll(/export \{([^}]+)\} from '\.\/web\/[\w-]+'/g)) {
    for (const raw of m[1]!.split(',')) {
      const name = raw.trim()
      if (name) names.add(name)
    }
  }
  return names
}

describe('CANONICAL_PRIMITIVES ⇔ @pyreon/primitives exports', () => {
  const exported = webComponentExports()

  it('reads a non-empty export list (a broken regex must not pass vacuously)', () => {
    expect(exported.size).toBeGreaterThan(10)
    expect(exported.has('Stack')).toBe(true)
  })

  it('every exported UI primitive is a canonical member', () => {
    const missing = [...exported].filter(
      (n) => !NON_CANONICAL_EXPORTS.has(n) && !CANONICAL_PRIMITIVES.has(n),
    )
    expect(missing).toEqual([])
  })

  it('every canonical member is actually exported by the package', () => {
    const phantom = [...CANONICAL_PRIMITIVES].filter((n) => !exported.has(n))
    expect(phantom).toEqual([])
  })

  it('the non-canonical allowlist names only real exports', () => {
    const stale = [...NON_CANONICAL_EXPORTS].filter((n) => !exported.has(n))
    expect(stale).toEqual([])
  })
})
