// Declarations that moved OUT of the emit and INTO a runtime are mirrored in
// the validation stubs so the Linux gates can resolve them. A mirror is only
// safe if it is EXACT: a stub wider than the runtime masks a real break, a
// narrower one rejects correct code.
//
// Each mirror is delimited in the stub text by
//   // BEGIN runtime mirror: <path under packages/>
//   …
//   // END runtime mirror
// and must equal the runtime file's text after its `MARK: … stub-mirror`
// line, byte for byte. The set is asserted too, so a mirror cannot be dropped
// from the stubs without this failing.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { SWIFT_UI_STUBS } from '../swift-stubs'
import { PERMISSIONS_KOTLIN_STUBS, PERMISSIONS_SWIFT_STUBS } from '../../../../fundamentals/permissions/src/native-plugin/stubs'

const PACKAGES = resolve(import.meta.dirname, '../../../..')

function mirrors(stubs: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /\/\/ BEGIN runtime mirror: (\S+)\n([\s\S]*?)\n\/\/ END runtime mirror/g
  for (const m of stubs.matchAll(re)) out.set(m[1]!, m[2]!)
  return out
}

function runtimeRegion(path: string): string {
  const text = readFileSync(resolve(PACKAGES, path), 'utf8')
  const marker = /^\/\/ MARK: (?:- )?stub-mirror\n/m.exec(text)
  expect(marker, `${path} has no stub-mirror marker`).not.toBeNull()
  return text.slice(marker!.index + marker![0].length).replace(/^\n+/, '').replace(/\n+$/, '')
}

const EXPECTED = {
  swift: [
    'fundamentals/permissions/native/swift/PyreonPermissionsEnvironment.swift',
    'native/router-swift/Sources/PyreonRouter/PyreonUrlState.swift',
  ],
  kotlin: [
    'fundamentals/permissions/native/kotlin/com/pyreon/runtime/PyreonPermissionsLocal.kt',
    'native/router-kotlin/src/main/kotlin/com/pyreon/router/PyreonUrlState.kt',
  ],
}

describe('runtime-owned declarations are mirrored exactly in the stubs', () => {
  for (const [lang, stubs] of [
    // A package-owned plugin carries the mirror of ITS runtime, so the parity check reads the core bundle plus those.
    ['swift', `${SWIFT_UI_STUBS}\n${PERMISSIONS_SWIFT_STUBS}`],
    ['kotlin', `${KOTLIN_COMPOSE_STUBS}\n${PERMISSIONS_KOTLIN_STUBS}`],
  ] as const) {
    const found = mirrors(stubs)
    it(`${lang}: the mirror set is complete`, () => {
      expect([...found.keys()].sort()).toEqual([...EXPECTED[lang]].sort())
    })
    for (const path of EXPECTED[lang]) {
      it(`${lang}: ${path}`, () => {
        expect(found.get(path)).toBe(runtimeRegion(path))
      })
    }
  }
})
