import { describe, expect, it } from 'vitest'
import {
  checkAll,
  checkWorkflowText,
  NOTIFIER_WORKFLOWS,
  splitSteps,
} from '../../../../../scripts/check-advisory-comment-steps'

// Guards the `check-advisory-comment-steps` gate — the prevention half of the
// 2026-07-16 release-PR failure (#2355): an explicitly-INFORMATIONAL workflow
// (`bundle-size-diff.yml`) turned its check RED because `issues.listComments`
// returned a transient 503. The measurement had succeeded; only the cosmetic
// comment transport failed.
//
// The gate's own value depends on it being ABLE to fail, so the specs below
// assert both verdicts on synthetic step text (the pre-fix shapes are taken
// verbatim in structure from the four real sites).

const advisoryPreFix = `
      - name: Post sticky comment
        uses: actions/github-script@v9
        with:
          script: |
            const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number })
            await github.rest.issues.createComment({ owner, repo, issue_number, body: summary })
`

const advisoryFixed = `
      - name: Post sticky comment
        uses: actions/github-script@v9
        with:
          retries: 3
          script: |
            try {
              await github.rest.issues.createComment({ owner, repo, issue_number, body: summary })
            } catch (err) {
              core.warning(\`posting failed: \${err.message}\`)
            }
`

describe('splitSteps', () => {
  it('splits a workflow into named step blocks', () => {
    const steps = splitSteps(`
      - name: One
        run: echo 1
      - name: Two
        run: echo 2
`)
    expect(steps.map((s) => s.name)).toEqual(['One', 'Two'])
    expect(steps[0]?.body).toContain('echo 1')
    expect(steps[0]?.body).not.toContain('echo 2')
  })
})

describe('checkWorkflowText — advisory workflows', () => {
  it('FLAGS an unguarded comment step (the #2355 shape)', () => {
    const findings = checkWorkflowText('bundle-size-diff.yml', advisoryPreFix)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.missing.sort()).toEqual(['catch', 'core.warning', 'retries'])
  })

  it('PASSES a retry-hardened, warning-downgraded comment step', () => {
    expect(checkWorkflowText('bundle-size-diff.yml', advisoryFixed)).toEqual([])
  })

  it('FLAGS retries-without-downgrade (a residual failure still reddens the check)', () => {
    const retriesOnly = advisoryFixed
      .replace('try {', '')
      .replace(/} catch \(err\) \{[\s\S]*?\}/, '')
    expect(checkWorkflowText('bundle-size-diff.yml', retriesOnly)[0]?.missing).toContain('catch')
  })

  it('is not satisfied by an UNRELATED catch (leak-sweep pre-fix guarded only its file read)', () => {
    // The precision property: a catch around readFileSync must not be
    // mistaken for guarding the comment post — hence the core.warning half.
    const unrelatedCatch = `
      - name: Post sweep summary as PR comment
        uses: actions/github-script@v9
        with:
          retries: 3
          script: |
            let body = ''
            try { body = fs.readFileSync(mdPath, 'utf8') } catch (err) { body = 'missing' }
            await github.rest.issues.createComment({ owner, repo, issue_number, body })
`
    const findings = checkWorkflowText('leak-sweep.yml', unrelatedCatch)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.missing).toEqual(['core.warning'])
  })

  it('ignores steps that post no comment', () => {
    expect(
      checkWorkflowText('bundle-size-diff.yml', '      - name: Measure\n        run: bun x\n'),
    ).toEqual([])
  })
})

describe('checkWorkflowText — notifier exemption', () => {
  it('requires retries but NOT a swallow-all catch (the post IS the deliverable)', () => {
    const notifier = `
      - name: Create / update / close the sticky failure issue
        uses: actions/github-script@v9
        with:
          retries: 3
          script: |
            await github.rest.issues.create({ owner, repo, title, body })
`
    expect(checkWorkflowText('native-device.yml', notifier)).toEqual([])
  })

  it('still flags a notifier with no retries at all', () => {
    const noRetries = `
      - name: Create / update / close the sticky failure issue
        uses: actions/github-script@v9
        with:
          script: |
            await github.rest.issues.create({ owner, repo, title, body })
`
    expect(checkWorkflowText('native-device.yml', noRetries)[0]?.missing).toEqual(['retries'])
  })

  it('the exemption list is explicit and minimal', () => {
    expect([...NOTIFIER_WORKFLOWS]).toEqual(['native-device.yml'])
  })
})

describe('checkAll — the live .github/workflows tree', () => {
  it('passes, and actually inspects the real comment-posting steps', () => {
    const result = checkAll()
    expect(result.findings).toEqual([])
    expect(result.ok).toBe(true)
    // Guards the structurally-unable-to-fail case: if the scan matched
    // nothing, `ok: true` would be meaningless.
    expect(result.stepsChecked).toBeGreaterThanOrEqual(4)
  })
})
