// @vitest-environment node
import { readFileSync } from 'node:fs'
import {
  findCiFailFastViolations,
  findCiSchedulingViolations,
  parseJobBlocks,
} from '../../../../../scripts/check-ci-fail-fast'

const expensive = [
  'typecheck-cell',
  'test-cell',
  'e2e-suite',
  'scaffold-smoke-cell',
  'build',
  'test-browser',
  'release-build',
  'bootstrap-exit-codes',
]

const workflow = (overrides: Record<string, string> = {}) => `jobs:
${expensive
  .map(
    (name) => `  ${name}:
${
  overrides[name] ??
  `    needs: [install, fast-gates]
    if: \${{ needs.install.result == 'success' && needs.fast-gates.result == 'success' }}
${name.includes('cell') || name === 'e2e-suite' ? '    strategy:\n      fail-fast: true\n' : ''}`
}`,
  )
  .join('\n')}
  test:
    needs: [install, fast-gates, typecheck-cell, test-cell, e2e-suite, scaffold-smoke-cell]
    if: always()
  contract-markers:
    first failing category: $category
    e2e suite failed::$suite
    scaffold-smoke.ts --fail-fast $MEMBERS
`

describe('parseJobBlocks', () => {
  it('reads only two-space jobs under jobs', () => {
    expect(
      parseJobBlocks(
        'on:\n  push:\njobs:\n  a-job:\n    runs-on: ubuntu\n  next:\n    timeout-minutes: 1\npermissions:\n  contents: read',
      ).map((j) => j.name),
    ).toEqual(['a-job', 'next'])
  })
})

describe('scheduling invariants', () => {
  const ci = readFileSync(
    new URL('../../../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )
  const setup = readFileSync(
    new URL('../../../../../.github/actions/setup-pyreon/action.yml', import.meta.url),
    'utf8',
  )

  it('accepts the real workflow and composite action', () => {
    expect(findCiSchedulingViolations(ci, setup)).toEqual([])
  })

  it('rejects a moving base and a mismatched workload profile', () => {
    expect(
      findCiSchedulingViolations(
        ci.replace('CI_BASE: ${{ github.event.pull_request.base.sha }}', 'CI_BASE: origin/main'),
        setup,
      ),
    ).toContain('all PR selectors must share the immutable event base SHA')
    expect(
      findCiSchedulingViolations(ci.replace('--profile=e2e', '--profile=test'), setup),
    ).toContain('missing workload-specific batching: --profile=e2e')
  })

  it('rejects stale-tree downloads and cache ownership tied to batch names', () => {
    expect(
      findCiSchedulingViolations(ci, `${setup}\n        restore-keys: node-modules-Linux-bun-`),
    ).toContain('node_modules must not download a stale prefix tree that fallback discards')
    expect(
      findCiSchedulingViolations(
        ci.replace(
          "if: contains(matrix.members, 'native-rest')",
          "if: startsWith(matrix.name, 'native')",
        ),
        setup,
      ),
    ).toContain('native-rest cache ownership must follow membership, not batch name')
  })

  it('requires the scheduler result payload', () => {
    expect(
      findCiSchedulingViolations(ci.replace('NEEDS_JSON: ${{ toJSON(needs) }}', ''), setup),
    ).toContain('Test must validate scheduler results and selection outputs')
  })

  it('requires restored libraries before skipping scaffold bootstrap', () => {
    const missingSkip = ci.replace("          PYREON_BOOTSTRAP_SKIP: '1'", '')
    expect(findCiSchedulingViolations(missingSkip, setup)).toContain(
      'scaffold must restore lib/ once and skip rebuilding it for temporary workspaces',
    )
    const missingLib = ci.replace(
      '      # A scaffolded app',
      "        with:\n          restore-bootstrap: 'false'\n      # A scaffolded app",
    )
    expect(findCiSchedulingViolations(missingLib, setup)).toContain(
      'scaffold must restore lib/ once and skip rebuilding it for temporary workspaces',
    )
  })
})

describe('findCiFailFastViolations', () => {
  const aggregate = "if (name === 'Fast Gates') return 'preflight'"

  it('accepts the staged fail-fast contract', () => {
    expect(findCiFailFastViolations(workflow(), aggregate)).toEqual([])
  })

  it('rejects an expensive job that bypasses preflight', () => {
    const bad = workflow({
      build: "    needs: install\n    if: ${{ needs.install.result == 'success' }}\n",
    })
    expect(findCiFailFastViolations(bad, aggregate)).toContain(
      'build: must need [install, fast-gates]',
    )
    expect(findCiFailFastViolations(bad, aggregate)).toContain(
      'build: must require Fast Gates success',
    )
  })

  it('rejects non-fail-fast matrices and an aggregate that ignores preflight', () => {
    const bad = workflow({
      'e2e-suite':
        "    needs: [install, fast-gates]\n    if: ${{ needs.install.result == 'success' && needs.fast-gates.result == 'success' }}\n    strategy:\n      fail-fast: false\n",
    })
    expect(findCiFailFastViolations(bad, '')).toContain(
      'e2e-suite: matrix must use fail-fast: true',
    )
    expect(findCiFailFastViolations(bad, '')).toContain(
      'Test aggregate must wait for and validate Fast Gates',
    )
  })

  it('rejects a workflow that continues sequential batches after a failure', () => {
    const bad = workflow().replace(
      'scaffold-smoke.ts --fail-fast $MEMBERS',
      'scaffold-smoke.ts $MEMBERS',
    )
    expect(findCiFailFastViolations(bad, aggregate)).toContain(
      'missing within-cell fail-fast contract: scaffold-smoke.ts --fail-fast $MEMBERS',
    )
  })

  it('rejects an aggregate that occupies a runner while matrices execute', () => {
    const bad = workflow().replace(
      'needs: [install, fast-gates, typecheck-cell, test-cell, e2e-suite, scaffold-smoke-cell]',
      'needs: install',
    )
    expect(findCiFailFastViolations(bad, aggregate)).toContain(
      'Test aggregate must not occupy a runner while matrices execute',
    )
  })
})
