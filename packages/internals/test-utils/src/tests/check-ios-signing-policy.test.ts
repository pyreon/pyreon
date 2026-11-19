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

import { describe, expect, it, vi } from 'vitest'
import {
  checkIosSigningPolicy,
  findDerivedDataGaps,
  findDerivedDataGapsInTs,
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

// Without -derivedDataPath Xcode builds into ~/Library/Developer/Xcode/DerivedData,
// outside the checkout, and the folder outlives the worktree that produced it
// (24 folders, 3 GB on one machine, from three example scripts).
describe('findDerivedDataGaps', () => {
  it('flags a multi-line xcodebuild invocation without -derivedDataPath', () => {
    const sh = `set -e\nxcodebuild build-for-testing \\\n  -project ios/X.xcodeproj -scheme X \\\n  -configuration Debug\necho done\n`
    expect(findDerivedDataGaps(sh, 'x.sh')).toEqual([
      { file: 'x.sh', line: 2, snippet: 'xcodebuild build-for-testing \\' },
    ])
  })

  it('flags one behind env-var prefixes, and one handed to a wrapper after --', () => {
    expect(findDerivedDataGaps('A=1 B=x xcodebuild test-without-building -scheme X\n')).toHaveLength(1)
    expect(findDerivedDataGaps('bun wrap.ts --results r -- \\\n  xcodebuild test \\\n  -scheme X\n')).toHaveLength(1)
  })

  it('accepts the flag on any continuation line, and does not read past the invocation', () => {
    const ok = `xcodebuild archive \\\n  -archivePath a \\\n  -derivedDataPath build/DerivedData \\\n  CODE_SIGNING_ALLOWED=NO \\\n  | tail -5\n`
    expect(findDerivedDataGaps(ok)).toEqual([])
    const later = `xcodebuild build -scheme X\nfoo -derivedDataPath x\n`
    expect(findDerivedDataGaps(later)).toHaveLength(1)
  })

  it('ignores comments, prose, and calls that build nothing', () => {
    expect(findDerivedDataGaps('# xcodebuild build -scheme X\n')).toEqual([])
    expect(findDerivedDataGaps(`echo "run xcodebuild later"\n`)).toEqual([])
    expect(findDerivedDataGaps('xcodebuild -version\nxcodebuild -showsdks\n')).toEqual([])
  })
})

describe('findDerivedDataGapsInTs', () => {
  it('flags a spawn whose argument array lacks -derivedDataPath', () => {
    expect(findDerivedDataGapsInTs(`run(\n  'xcodebuild',\n  ['-project', p, 'build'],\n)`)).toHaveLength(1)
    expect(findDerivedDataGapsInTs(`run('xcodebuild', ['-project', p, '-derivedDataPath', d, 'build'])`)).toEqual([])
  })
})

describe('the repository', () => {
  it('passes the whole policy (signing, entitlements, -derivedDataPath)', () => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(checkIosSigningPolicy(), errors.join('\n')).toBe(0)
    } finally {
      spy.mockRestore()
      log.mockRestore()
    }
  })
})
