import { describe, expect, it } from 'vitest'
import {
  extractGithubScriptBlocks,
  parseError,
  substituteExpressions,
} from '../../../../../scripts/check-github-script-syntax'

/**
 * Pure-logic tests for the github-script parse gate.
 *
 * The gate exists because `native-device.yml`'s nightly NOTIFIER carried a
 * shell snippet inside an `actions/github-script` `script:` block, so the step
 * died with `SyntaxError: Invalid or unexpected token` — meaning a red device
 * build would have reported nothing.
 */
describe('extractGithubScriptBlocks', () => {
  const ghStep = `jobs:
  a:
    steps:
      - uses: actions/github-script@abc # v9
        with:
          script: |
            const x = 1
            await github.rest.issues.create({ owner: 'o' })
`

  it('extracts a github-script block', () => {
    const blocks = extractGithubScriptBlocks(ghStep, 'w.yml')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.source).toContain('const x = 1')
  })

  it('does NOT extract the emulator runner\'s script:, which is SHELL', () => {
    // The load-bearing negative. `reactivecircus/android-emulator-runner` takes
    // an input with the SAME NAME whose contents are shell; parsing those as
    // JavaScript would fail every Android workflow in the repo.
    const emulator = `jobs:
  a:
    steps:
      - uses: reactivecircus/android-emulator-runner@abc # v2
        with:
          script: |
            adb shell settings put global hide_error_dialogs 1 || true
            ./gradlew connectedCheck
`
    expect(extractGithubScriptBlocks(emulator, 'w.yml')).toHaveLength(0)
  })

  it('stops the block at the first dedent, not at end of file', () => {
    const trailing = `${ghStep}      - name: after
        run: echo hi
`
    const blocks = extractGithubScriptBlocks(trailing, 'w.yml')
    expect(blocks[0]!.source).not.toContain('echo hi')
  })
})

describe('substituteExpressions', () => {
  it('replaces GitHub expressions, which are not JavaScript', () => {
    // GitHub substitutes these BEFORE the script runs. Parsing the raw text
    // would report a false error on every workflow that interpolates.
    expect(substituteExpressions("const r = '${{ needs.x.result }}'")).toBe("const r = 'EXPR'")
  })
})

describe('parseError', () => {
  it('returns null for valid JavaScript', () => {
    expect(parseError('const a = 1\nawait Promise.resolve(a)')).toBeNull()
  })

  it('reports shell pasted into a JS block — the bug this gate exists for', () => {
    const err = parseError("# a shell comment\nadb shell settings put global x 1 || true\nconst a = 1")
    expect(err).not.toBeNull()
  })

  it('accepts top-level await, which these scripts legitimately use', () => {
    expect(parseError('await github.rest.issues.listForRepo({})')).toBeNull()
  })

  it('does not report an expression-bearing script as broken', () => {
    expect(parseError("const failed = '${{ needs.a.result }}' === 'failure'")).toBeNull()
  })
})
