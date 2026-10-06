import { describe, expect, it } from 'vitest'
import {
  kotlinTarballProblems,
  parseSwiftTargets,
  swiftTarballProblems,
} from '../../../../../scripts/check-native-tarballs'

const MANIFEST = `
// .testTarget(name: "Commented", dependencies: [])
let package = Package(
  name: "X",
  targets: [
    .target(name: "X", dependencies: []),
    .testTarget(name: "XTests", dependencies: ["X"]),
    .target(name: "Custom", path: "Lib/Custom"),
  ]
)`

describe('check-native-tarballs (#3787)', () => {
  it('parses targets, ignoring comments, honouring explicit path', () => {
    expect(parseSwiftTargets(MANIFEST).map((t) => [t.kind, t.name, t.path])).toEqual([
      ['target', 'X', undefined],
      ['testTarget', 'XTests', undefined],
      ['target', 'Custom', 'Lib/Custom'],
    ])
  })

  it('flags a testTarget whose Tests dir is not in the tarball', () => {
    const files = ['Package.swift', 'Sources/X/A.swift', 'Lib/Custom/B.swift']
    const p = swiftTarballProblems('pkg', MANIFEST, files)
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('XTests')
    expect(p[0]).toContain('"Tests"')
  })

  it('passes when every declared target directory ships', () => {
    const files = ['Sources/X/A.swift', 'Tests/XTests/T.swift', 'Lib/Custom/B.swift']
    expect(swiftTarballProblems('pkg', MANIFEST, files)).toEqual([])
  })

  it('flags a Kotlin source dir missing from the tarball, and a missing sdkOnly file', () => {
    expect(kotlinTarballProblems('k', 'src/main/kotlin', [], ['README.md'])).toHaveLength(1)
    expect(kotlinTarballProblems('k', 'src/main/kotlin', ['Chart.kt'], ['src/main/kotlin/a/B.kt'])).toHaveLength(1)
    expect(kotlinTarballProblems('k', 'src/main/kotlin', ['B.kt'], ['src/main/kotlin/a/B.kt'])).toEqual([])
  })
})
