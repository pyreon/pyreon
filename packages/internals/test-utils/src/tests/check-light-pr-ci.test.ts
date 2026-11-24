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

  it('rejects a pull_request-only step inside a job light mode skips on the PR', () => {
    const wf = mutate(
      'ci.yml',
      '      - run: bun run test:browser\n',
      "      - name: PR-only probe\n        if: ${{ github.event_name == 'pull_request' }}\n        run: bun run test:browser\n",
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('"PR-only probe" of "Test (browser)"'))).toBe(true)
  })

  it('accepts the same step once it also admits merge_group', () => {
    const wf = mutate(
      'ci.yml',
      '      - run: bun run test:browser\n',
      "      - name: PR-only probe\n        if: ${{ github.event_name == 'pull_request' || github.event_name == 'merge_group' }}\n        run: bun run test:browser\n",
    )
    expect(findLightPrCiViolations(wf)).toEqual([])
  })

  // Shapes a line scan missed: the step is read structurally and its `if:`
  // evaluated for pull_request and merge_group.
  const probe = (step: string) => mutate('ci.yml', '      - run: bun run test:browser\n', `${step}        run: bun run test:browser\n`)
  it.each([
    ['`- uses:` first', "      - uses: ./.github/actions/x\n        if: ${{ github.event_name == 'pull_request' }}\n", './.github/actions/x'],
    ['`- if:` first', "      - if: github.event_name == 'pull_request'\n        name: If-first probe\n", 'If-first probe'],
    ['a double-quoted YAML value', '      - name: "Dq probe"\n        if: "${{ github.event_name == \'pull_request\' }}"\n', 'Dq probe'],
    [
      'a negation that mentions merge_group but excludes it',
      "      - name: Negated probe\n        if: ${{ !cancelled() && github.event_name != 'push' && github.event_name != 'merge_group' }}\n",
      'Negated probe',
    ],
  ])('rejects a PR-only step written with %s', (_, step, label) => {
    const v = findLightPrCiViolations(probe(step))
    expect(v.some((m) => m.includes(`"${label}" of "Test (browser)"`)), v.join('\n')).toBe(true)
  })

  it('does not flag a step whose condition it cannot decide, or one that runs in the queue', () => {
    expect(findLightPrCiViolations(probe("      - name: Output probe\n        if: steps.x.outputs.run == 'true'\n"))).toEqual([])
    expect(
      findLightPrCiViolations(probe("      - name: Push-only probe\n        if: ${{ github.event_name == 'push' }}\n")),
    ).toEqual([])
    expect(
      findLightPrCiViolations(probe("      - name: Not-push probe\n        if: ${{ github.event_name != 'push' }}\n")),
    ).toEqual([])
  })

  it('rejects Build taking the light-mode condition (it must stay on the PR)', () => {
    const wf = mutate(
      'ci.yml',
      /(  build:[\s\S]*?\n {4}if: \$\{\{ [^\n]*?)( \}\})/,
      "$1 && needs.install.outputs.pr-light != 'true'$2",
    )
    expect(findLightPrCiViolations(wf).some((m) => m.includes('"Build" must keep running on the pull request'))).toBe(true)
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
      /(  release-build:[\s\S]*?\n {4}if: \$\{\{ )/,
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
