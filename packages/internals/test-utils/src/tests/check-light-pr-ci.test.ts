// @vitest-environment node
import { readFileSync } from 'node:fs'
import {
  findLightPrCiViolations,
  REQUIRED_JOBS,
} from '../../../../../scripts/check-light-pr-ci'

const files = ['ci.yml', 'pr-gates.yml', 'codeql.yml', 'native-validate.yml', 'native-device.yml']
const load = (): Record<string, string> =>
  Object.fromEntries(
    files.map((f) => [
      f,
      readFileSync(new URL(`../../../../../.github/workflows/${f}`, import.meta.url), 'utf8'),
    ]),
  )

function mutate(file: string, from: string | RegExp, to: string): Record<string, string> {
  const wf = load()
  const next = wf[file]!.replace(from, to)
  expect(next).not.toBe(wf[file]) // the fixture really changed
  wf[file] = next
  return wf
}

describe('check-light-pr-ci', () => {
  it('the real workflows pass', () => {
    expect(findLightPrCiViolations(load())).toEqual([])
  })

  it('covers every required job-backed context', () => {
    expect(REQUIRED_JOBS.length).toBe(14)
  })

  it('rejects a required context whose workflow lost merge_group', () => {
    const wf = mutate('native-validate.yml', /^ {2}merge_group:\n/m, '')
    const v = findLightPrCiViolations(wf)
    expect(v.some((m) => m.includes('no merge_group trigger'))).toBe(true)
  })

  it('rejects a renamed required job', () => {
    const wf = mutate('ci.yml', /name: Release Build/, 'name: Release Build 2')
    expect(findLightPrCiViolations(wf).some((m) => m.includes('"Release Build" has no job'))).toBe(
      true,
    )
  })

  it('rejects a light-mode skip on a job the queue skips (device lane)', () => {
    const wf = mutate(
      'native-device.yml',
      /(  ios-build:[\s\S]*?\n {4}if: >-\n)/,
      "$1      vars.PR_CI_MODE != 'light' &&\n",
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('iOS'))).toBe(true)
  })

  it('rejects a light-mode skip on a queue-skipped helper job', () => {
    const wf = mutate(
      'native-device.yml',
      /(  changes:[\s\S]*?\n {4}if: )/,
      "$1vars.PR_CI_MODE != 'light' && ",
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('helper job "changes"'))).toBe(true)
  })

  it('rejects a light-mode job whose own if excludes merge_group', () => {
    const wf = mutate(
      'ci.yml',
      /(  build:[\s\S]*?\n {4}if: \$\{\{ )/,
      "$1github.event_name != 'merge_group' && ",
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('excludes merge_group'))).toBe(true)
  })

  it('rejects a light-mode job in a workflow with no push trigger', () => {
    const wf = mutate('native-validate.yml', /^ {2}push:\n/m, '  # push removed\n')
    expect(findLightPrCiViolations(wf).some((m) => m.includes('no push trigger'))).toBe(true)
  })

  it('rejects a direct PR_CI_MODE read that is not bounded to pull_request', () => {
    const wf = mutate(
      'native-validate.yml',
      "(github.event_name != 'pull_request' || vars.PR_CI_MODE != 'light')",
      "(vars.PR_CI_MODE != 'light')",
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('not bounded') || m.includes('without bounding'))).toBe(true)
  })

  it('rejects a mode step that can set light on a non-PR event', () => {
    const wf = mutate(
      'ci.yml',
      '[ "${{ github.event_name }}" = "pull_request" ] && [ "$PR_CI_MODE" = "light" ]',
      '[ "$PR_CI_MODE" = "light" ]',
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('Resolve PR CI mode'))).toBe(true)
  })
})
