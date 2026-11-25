// The support-matrix gate: every machine-read copy of the supported platforms
// (engines.node, SwiftPM platforms, minSdk, deployment targets) and the two
// human-read ones (the stability page, SECURITY.md) agree with SUPPORT_MATRIX.
// Policy functions are called directly, plus the real-repo invariant.

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  docFindings,
  engineFinding,
  matrixPhrases,
  NODE_ENGINE,
  nativeFindings,
  runGate,
  SUPPORT_MATRIX,
  supportSection,
  withNodeEngine,
} from '../../../../../scripts/check-support-matrix'

const REPO = resolve(__dirname, '../../../../..')

const pkg = (engines = '') =>
  `{\n  "name": "@pyreon/x",\n  "version": "1.0.0",\n${engines}  "publishConfig": {\n    "access": "public"\n  },\n  "pyreon": {\n    "stability": "stable"\n  }\n}\n`

describe('engineFinding', () => {
  it('passes exactly the matrix range', () => {
    expect(NODE_ENGINE).toBe(`>=${SUPPORT_MATRIX.node}`)
    expect(
      engineFinding('p', pkg(`  "engines": {\n    "node": "${NODE_ENGINE}"\n  },\n`)),
    ).toBeNull()
  })

  it('flags a package with no engines: a new package cannot ship without one', () => {
    expect(engineFinding('p', pkg())?.detail).toContain('declares no engines.node')
  })

  it('flags an old floor and a differently spelled range', () => {
    expect(engineFinding('p', pkg('  "engines": {\n    "node": ">=18"\n  },\n'))?.detail).toContain(
      '">=18"',
    )
    expect(engineFinding('p', pkg('  "engines": {\n    "node": ">= 22"\n  },\n'))).not.toBeNull()
  })
})

describe('withNodeEngine', () => {
  it('inserts a block before publishConfig and changes nothing else', () => {
    const before = pkg()
    const after = withNodeEngine(before)
    expect(engineFinding('p', after)).toBeNull()
    expect(after.replace(`  "engines": {\n    "node": "${NODE_ENGINE}"\n  },\n`, '')).toBe(before)
  })

  it('replaces an existing node range in place', () => {
    const after = withNodeEngine(pkg('  "engines": {\n    "node": ">=18"\n  },\n'))
    expect(after).toBe(pkg(`  "engines": {\n    "node": "${NODE_ENGINE}"\n  },\n`))
  })

  it('adds node to an engines block that names only another engine', () => {
    const after = withNodeEngine(pkg('  "engines": {\n    "vscode": "^1.91.0"\n  },\n'))
    expect(JSON.parse(after).engines).toEqual({ node: NODE_ENGINE, vscode: '^1.91.0' })
  })

  it('appends when there is no anchor key', () => {
    const after = withNodeEngine('{\n  "name": "@pyreon/x",\n  "version": "1.0.0"\n}\n')
    expect(JSON.parse(after)).toEqual({
      name: '@pyreon/x',
      version: '1.0.0',
      engines: { node: NODE_ENGINE },
    })
  })
})

describe('nativeFindings', () => {
  it('flags a SwiftPM manifest below the iOS and macOS floors', () => {
    const swift = 'platforms: [\n  .iOS(.v16),\n  .macOS(.v13),\n]'
    expect(nativeFindings('Package.swift', swift).map((f) => f.detail)).toEqual([
      `the SwiftPM iOS platform is 16 (expected ${SUPPORT_MATRIX.ios})`,
      `the SwiftPM macOS platform is 13 (expected ${SUPPORT_MATRIX.macos})`,
    ])
    expect(
      nativeFindings(
        'Package.swift',
        `.iOS(.v${SUPPORT_MATRIX.ios}),\n.macOS(.v${SUPPORT_MATRIX.macos})`,
      ),
    ).toEqual([])
  })

  it('flags a manifest that declares no platform at all', () => {
    expect(nativeFindings('Package.swift', 'let package = Package(name: "X")')).toHaveLength(2)
  })

  it('reads minSdk in a Gradle file and the iOS targets in an XcodeGen spec', () => {
    expect(nativeFindings('app/build.gradle.kts', 'minSdk = 24')[0]?.detail).toContain(
      'minSdk is 24',
    )
    const yml = `options:\n  deploymentTarget:\n    iOS: '16.0'\ntargets:\n  App:\n    deploymentTarget: '${SUPPORT_MATRIX.ios}.0'\n`
    expect(nativeFindings('ios/project.yml', yml).map((f) => f.detail)).toEqual([
      `the iOS deployment target is 16.0 (expected ${SUPPORT_MATRIX.ios}.0)`,
    ])
  })
})

describe('docFindings / supportSection', () => {
  const page = (section: string) =>
    `## Versioning\n\nx\n\n## Support matrix\n\n${section}\n\n## Two tiers\n\ny\n`

  it('passes a section that names every floor', () => {
    expect(docFindings('p', supportSection(page(matrixPhrases().join('\n'))))).toEqual([])
  })

  it('reads only the Support matrix section, not the rest of the page', () => {
    const elsewhere = `## Support matrix\n\nnothing\n\n## Other\n\n${matrixPhrases().join('\n')}\n`
    expect(docFindings('p', supportSection(elsewhere))).toHaveLength(matrixPhrases().length)
  })

  it('names each missing phrase, and a missing file', () => {
    const f = docFindings('p', supportSection(page(matrixPhrases().slice(1).join('\n'))))
    expect(f.map((x) => x.detail)).toEqual([
      expect.stringContaining(`Node.js ${SUPPORT_MATRIX.node}`),
    ])
    expect(docFindings('p', null)[0]?.detail).toBe('file is missing')
  })
})

describe('the real repository', () => {
  it('passes: every published package, native floor and documented copy agrees with the matrix', () => {
    const { findings, packages } = runGate(REPO)
    expect(packages).toBeGreaterThan(80)
    expect(findings).toEqual([])
  })
})
