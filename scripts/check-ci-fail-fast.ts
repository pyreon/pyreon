#!/usr/bin/env bun
/**
 * Static regression gate for CI's resource-prioritisation contract.
 *
 * GitHub Actions has no job priority. The only reliable way to keep a broken
 * commit from occupying the org-wide runner pool is to keep expensive jobs
 * ineligible until the cheap Fast Gates job succeeds, then let matrix
 * fail-fast cancel sibling cells after the first real failure.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface JobBlock {
  name: string
  body: string
}

export function parseJobBlocks(workflow: string): JobBlock[] {
  const lines = workflow.split('\n')
  const jobs: JobBlock[] = []
  let inJobs = false
  let name: string | null = null
  let body: string[] = []
  const flush = () => {
    if (name !== null) jobs.push({ name, body: body.join('\n') })
    body = []
  }
  for (const line of lines) {
    if (line === 'jobs:') {
      inJobs = true
      continue
    }
    if (inJobs && /^[a-z]/.test(line)) {
      flush()
      name = null
      inJobs = false
    }
    if (!inJobs) continue
    const match = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)
    if (match) {
      flush()
      name = match[1]!
    } else if (name !== null) {
      body.push(line)
    }
  }
  flush()
  return jobs
}

const EXPENSIVE_JOBS = [
  'typecheck-cell',
  'test-cell',
  'e2e-suite',
  'scaffold-smoke-cell',
  'build',
  'test-browser',
  'release-build',
  'bootstrap-exit-codes',
] as const

const MATRIX_JOBS = ['typecheck-cell', 'test-cell', 'e2e-suite', 'scaffold-smoke-cell'] as const

export function findCiFailFastViolations(workflow: string, aggregateScript: string): string[] {
  const jobs = new Map(parseJobBlocks(workflow).map((job) => [job.name, job.body]))
  const violations: string[] = []

  for (const name of EXPENSIVE_JOBS) {
    const body = jobs.get(name)
    if (body === undefined) {
      violations.push(`missing expensive job: ${name}`)
      continue
    }
    if (!/^ {4}needs:\s*\[install, fast-gates\]\s*$/m.test(body)) {
      violations.push(`${name}: must need [install, fast-gates]`)
    }
    if (!body.includes("needs.install.result == 'success'")) {
      violations.push(`${name}: must require Install success`)
    }
    if (!body.includes("needs.fast-gates.result == 'success'")) {
      violations.push(`${name}: must require Fast Gates success`)
    }
  }

  for (const name of MATRIX_JOBS) {
    const body = jobs.get(name)
    if (body !== undefined && !/^ {6}fail-fast:\s*true\s*$/m.test(body)) {
      violations.push(`${name}: matrix must use fail-fast: true`)
    }
  }

  const aggregateBody = jobs.get('test')
  const aggregateNeeds =
    'needs: [install, fast-gates, typecheck-cell, test-cell, e2e-suite, scaffold-smoke-cell]'
  if (aggregateBody === undefined || !aggregateBody.includes(aggregateNeeds)) {
    violations.push('Test aggregate must not occupy a runner while matrices execute')
  }

  const workflowFailFastMarkers = [
    'first failing category: $category',
    'e2e suite failed::$suite',
    'scaffold-smoke.ts --fail-fast $MEMBERS',
  ]
  for (const marker of workflowFailFastMarkers) {
    if (!workflow.includes(marker)) {
      violations.push(`missing within-cell fail-fast contract: ${marker}`)
    }
  }

  if (!aggregateScript.includes("if (name === 'Fast Gates') return 'preflight'")) {
    violations.push('Test aggregate must wait for and validate Fast Gates')
  }
  return violations
}

/** Scheduling optimizations must preserve selection and single-writer caches. */
export function findCiSchedulingViolations(workflow: string, setupAction: string): string[] {
  const code = workflow
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  const jobs = new Map(parseJobBlocks(code).map((job) => [job.name, job.body]))
  const errors: string[] = []
  if (
    !code.includes('CI_BASE: ${{ github.event.pull_request.base.sha }}') ||
    code.includes('origin/${{ github.base_ref }}')
  )
    errors.push('all PR selectors must share the immutable event base SHA')
  const install = jobs.get('install') ?? ''
  const scaffold = jobs.get('scaffold-smoke-cell') ?? ''
  if (
    !scaffold.includes("PYREON_BOOTSTRAP_SKIP: '1'") ||
    !scaffold.includes('uses: ./.github/actions/setup-pyreon') ||
    scaffold.includes("restore-bootstrap: 'false'")
  )
    errors.push('scaffold must restore lib/ once and skip rebuilding it for temporary workspaces')
  for (const profile of ['--profile="$prefix"', '--profile=e2e', '--profile=scaffold']) {
    if (!install.includes(profile)) errors.push(`missing workload-specific batching: ${profile}`)
  }
  const tests = jobs.get('test-cell') ?? ''
  if (
    tests.includes('native-verdicts-ci-${{ runner.os }}-${{ matrix.name }}') ||
    !tests.includes("if: contains(matrix.members, 'native-rest')") ||
    !tests.includes("if: always() && contains(matrix.members, 'native-rest')")
  )
    errors.push('native-rest cache ownership must follow membership, not batch name')
  if (!(jobs.get('test') ?? '').includes('NEEDS_JSON: ${{ toJSON(needs) }}'))
    errors.push('Test must validate scheduler results and selection outputs')
  if (/restore-keys:\s*node-modules-/m.test(setupAction))
    errors.push('node_modules must not download a stale prefix tree that fallback discards')
  return errors
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..')
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
  const aggregate = readFileSync(join(root, 'scripts/ci-aggregate.ts'), 'utf8')
  const setup = readFileSync(join(root, '.github/actions/setup-pyreon/action.yml'), 'utf8')
  const violations = [
    ...findCiFailFastViolations(workflow, aggregate),
    ...findCiSchedulingViolations(workflow, setup),
  ]
  if (violations.length > 0) {
    console.error(
      '[check-ci-fail-fast] FAILED — expensive CI can bypass preflight or ignore matrix fail-fast:',
    )
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }
  console.log(
    `[check-ci-fail-fast] ✓ ${EXPENSIVE_JOBS.length} expensive jobs wait for preflight; ${MATRIX_JOBS.length} matrices fail fast`,
  )
}
