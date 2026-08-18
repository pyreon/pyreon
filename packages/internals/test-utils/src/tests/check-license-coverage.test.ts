import { describe, expect, it } from 'vitest'
import { auditWorkspace, withLicenseField } from '../../../../../scripts/check-license-coverage'

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
