import { describe, expect, it } from 'vitest'
import {
  auditWorkspace,
  classifyDependencyLicense,
  withLicenseField,
} from '../../../../../scripts/check-license-coverage'

const CANON = 'MIT License\n\nCopyright (c) 2025-present Vit Bokisch\n'
const PKG = (extra = '"license": "MIT",') =>
  `{\n  "name": "@pyreon/x",\n  "version": "1.0.0",\n  ${extra}\n  "private": true\n}\n`

describe('auditWorkspace', () => {
  it('passes a workspace with a matching LICENSE and an MIT field', () => {
    expect(auditWorkspace('p/package.json', PKG(), CANON, CANON)).toEqual([])
  })

  it('flags a MISSING LICENSE file — a package shipped with no stated terms', () => {
    const f = auditWorkspace('p/package.json', PKG(), null, CANON)
    expect(f.map((x) => x.kind)).toEqual(['missing-file'])
  })

  it('flags a DRIFTED LICENSE — the year-divergence this repo actually had', () => {
    const drifted = CANON.replace('2025-present', '2026')
    const f = auditWorkspace('p/package.json', PKG(), drifted, CANON)
    expect(f.map((x) => x.kind)).toEqual(['drifted-file'])
  })

  it('flags a missing `license` field — what npm and SBOM scanners read', () => {
    const f = auditWorkspace('p/package.json', PKG(''), CANON, CANON)
    expect(f.map((x) => x.kind)).toEqual(['missing-field'])
  })

  it('flags a NON-MIT field rather than silently accepting it', () => {
    const f = auditWorkspace('p/package.json', PKG('"license": "Apache-2.0",'), CANON, CANON)
    expect(f[0]!.kind).toBe('wrong-field')
    expect(f[0]!.detail).toContain('Apache-2.0')
  })

  it('reports BOTH a missing file and a missing field together', () => {
    const f = auditWorkspace('p/package.json', PKG(''), null, CANON)
    expect(f.map((x) => x.kind).sort()).toEqual(['missing-field', 'missing-file'])
  })

  it('does not throw on unparseable package.json — the file check still reports', () => {
    const f = auditWorkspace('p/package.json', '{ not json', null, CANON)
    expect(f.map((x) => x.kind)).toEqual(['missing-file'])
  })
})

describe('withLicenseField', () => {
  it('inserts after version and leaves valid JSON', () => {
    const out = withLicenseField(PKG(''))
    expect(JSON.parse(out).license).toBe('MIT')
  })

  it('falls back to name when there is no version', () => {
    const out = withLicenseField('{\n  "name": "x",\n  "private": true\n}\n')
    expect(JSON.parse(out).license).toBe('MIT')
  })

  it('never produces a double comma', () => {
    expect(withLicenseField(PKG(''))).not.toContain(',,')
  })
})

describe('classifyDependencyLicense', () => {
  it('treats the permissive families as permissive', () => {
    for (const l of ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', '0BSD'])
      expect(classifyDependencyLicense(l)).toBe('permissive')
  })

  it('classifies FILE-level copyleft as weak — allowed, but disclosable', () => {
    for (const l of ['MPL-2.0', 'EPL-2.0', 'CDDL-1.0', 'EUPL-1.2'])
      expect(classifyDependencyLicense(l)).toBe('weak-copyleft')
  })

  it('classifies whole-work copyleft as strong — not merely disclosable', () => {
    for (const l of ['GPL-3.0', 'AGPL-3.0-only', 'LGPL-2.1', 'SSPL-1.0', 'BUSL-1.1'])
      expect(classifyDependencyLicense(l)).toBe('strong-copyleft')
  })

  it('takes the WEAKER half of a dual licence — the elkjs case', () => {
    // `elkjs` ships "EPL-2.0 OR GPL-3.0-or-later". Pyreon takes EPL, so this
    // must not be reported as strong copyleft merely because GPL appears in
    // the string — checking weak FIRST is what encodes that choice.
    expect(classifyDependencyLicense('EPL-2.0 OR GPL-3.0-or-later')).toBe('weak-copyleft')
  })

  it('does not let a GPL-only dependency hide behind an OR', () => {
    expect(classifyDependencyLicense('GPL-3.0-or-later')).toBe('strong-copyleft')
    expect(classifyDependencyLicense('AGPL-3.0 OR Commercial')).toBe('strong-copyleft')
  })
})
