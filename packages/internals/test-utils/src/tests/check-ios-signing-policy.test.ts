// `check-ios-signing-policy` — an `xcodebuild test` step must not disable code
// signing.
//
// The bug it exists for produces a local-pass/CI-fail split: an UNSIGNED
// simulator app carries no signature entitlements, so securityd denies
// SecItemAdd and any Keychain use fails ONLY in CI (where the flag is set),
// while `xcodebuild test` ad-hoc signs by default on a developer machine.
//
// It had already been fixed once — on a single step, with a comment. Four
// other test steps kept the flag, latent until a session-rehydration test
// landed in the finance app and failed only in CI. The gate turns that
// one-site fix into policy.

import { describe, expect, it } from 'vitest'
import {
  findEntitlementGaps,
  findSigningViolations,
} from '../../../../../scripts/check-ios-signing-policy'

const testStep = (extra: string) => `      - name: UITest
        run: |
          xcodebuild test \\
            -project X.xcodeproj \\
            -scheme X \\
            -configuration Debug${extra}
`

describe('findSigningViolations', () => {
  it('flags CODE_SIGNING_ALLOWED=NO inside an xcodebuild test invocation', () => {
    const v = findSigningViolations(testStep(' \\\n            CODE_SIGNING_ALLOWED=NO'))
    expect(v).toHaveLength(1)
    expect(v[0]!.snippet).toBe('CODE_SIGNING_ALLOWED=NO')
  })

  it('allows the flag on an xcodebuild BUILD step — it never launches the app', () => {
    const build = `      - name: Build
        run: |
          xcodebuild build \\
            -project X.xcodeproj \\
            -configuration Debug \\
            CODE_SIGNING_ALLOWED=NO
`
    expect(findSigningViolations(build)).toEqual([])
  })

  it('passes a test step that carries no signing flag', () => {
    expect(findSigningViolations(testStep(''))).toEqual([])
  })

  it('does not leak past the end of a test invocation into a later build step', () => {
    // The flag belongs to the BUILD command that follows, so it is legal.
    const mixed = `          xcodebuild test \\
            -scheme A \\
            -configuration Debug

          xcodebuild build \\
            -scheme B \\
            CODE_SIGNING_ALLOWED=NO
`
    expect(findSigningViolations(mixed)).toEqual([])
  })

  it('flags every offending test step, not just the first', () => {
    const two =
      testStep(' \\\n            CODE_SIGNING_ALLOWED=NO') +
      '\n' +
      testStep(' \\\n            CODE_SIGNING_ALLOWED=NO')
    expect(findSigningViolations(two)).toHaveLength(2)
  })
})

describe('findEntitlementGaps', () => {
  // The second half of the same bug: dropping CODE_SIGNING_ALLOWED=NO is
  // necessary but not sufficient. securityd also wants an entitlements blob,
  // and xcodegen's `entitlements:` key alone does not embed one under ad-hoc
  // signing — only the explicit build setting does.
  it('flags a project that sets no CODE_SIGN_ENTITLEMENTS', () => {
    const yml = `targets:
  App:
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.pyreon.App
`
    expect(findEntitlementGaps([{ path: 'examples/native-x-ios/project.yml', source: yml }]))
      .toEqual([{ project: 'examples/native-x-ios/project.yml' }])
  })

  it('is NOT satisfied by the xcodegen `entitlements:` key alone', () => {
    // The exact trap: the key is present, the build setting is not, and the
    // built app carries an empty entitlements dict.
    const yml = `targets:
  App:
    entitlements:
      path: ios/App.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.pyreon.App
`
    expect(findEntitlementGaps([{ path: 'p', source: yml }])).toEqual([{ project: 'p' }])
  })

  it('accepts a project that sets the explicit build setting', () => {
    const yml = `targets:
  App:
    settings:
      base:
        CODE_SIGN_ENTITLEMENTS: ios/App.entitlements
`
    expect(findEntitlementGaps([{ path: 'p', source: yml }])).toEqual([])
  })
})
