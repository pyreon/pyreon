/**
 * Real-Chromium proof (issue #3805) that `atlas verify-browser` DRIVES
 * handlers without FOLLOWING them: an ordinary `<a href>`, a native form, a
 * download link, `window.open`, dialogs, `history.pushState` and a
 * programmatic `form.submit()` must all be neutralised in-page, and the one
 * thing no in-page guard can stop (`location.assign`) must be caught from
 * outside — reported by name, with the run continuing to the next scenario.
 *
 * Before the fix the first anchor unloaded the workbench and the whole run
 * died with `page.evaluate: Execution context was destroyed`.
 *
 * Needs Chromium. Where it is absent the suite SKIPS LOUDLY — and under CI a
 * missing browser is a FAILURE, because a spec that silently skips is a gate
 * that reports green over nothing.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runScan } from '../../cli/run'
import { INTERACTION_GUARD_SOURCE, runBrowserVerify, summarizeSuppressed } from '../runner'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/side-effects')

async function chromiumAvailable(): Promise<boolean> {
  try {
    const pw = (await import('playwright-core')) as unknown as {
      chromium: { executablePath(): string }
    }
    return existsSync(pw.chromium.executablePath())
  } catch {
    return false
  }
}

const HAS_CHROMIUM = await chromiumAvailable()
if (!HAS_CHROMIUM) {
  console.warn(
    '[atlas] side-effects.test.ts: real-Chromium specs SKIPPED — Chromium is not installed (bunx playwright-core install chromium)',
  )
}

describe('verify-browser interaction guard (pure)', () => {
  it('summarizeSuppressed collapses repeats and keeps first-seen order', () => {
    expect(summarizeSuppressed(['anchor navigation', 'alert', 'anchor navigation'])).toBe(
      'anchor navigation ×2, alert',
    )
    expect(summarizeSuppressed([])).toBe('')
  })

  it('the guard source is a parseable expression with an uninstall hook', () => {
    // It is evaluated inside the page; a syntax error would only surface as a
    // browser run dying, so parse it eagerly here.
    expect(() => new Function(`return ${INTERACTION_GUARD_SOURCE}`)).not.toThrow()
    expect(INTERACTION_GUARD_SOURCE).toContain('uninstall')
  })
})

describe('verify-browser side effects (real Chromium)', () => {
  it('has Chromium in CI', () => {
    if (process.env.CI) expect(HAS_CHROMIUM, 'Chromium must be installed in CI').toBe(true)
  })

  const work = HAS_CHROMIUM ? mkdtempSync(join(FIXTURE, '..', 'run-')) : ''
  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true })
  })

  it.skipIf(!HAS_CHROMIUM)(
    'neutralises in-page side effects, reports the unpreventable one, and finishes the catalog',
    async () => {
      cpSync(FIXTURE, work, { recursive: true })
      await runScan({ cwd: work, mount: false })
      const summary = await runBrowserVerify({ cwd: work, port: 5391, axe: false })

      // Every scenario was driven — nothing aborted the catalog.
      expect(summary.scenarios).toBeGreaterThanOrEqual(7)
      // ONLY the location.assign scenario left the document, and it says where.
      expect(summary.navigatedAway).toHaveLength(1)
      expect(summary.navigatedAway[0]?.id).toMatch(/location/i)
      expect(summary.navigatedAway[0]?.url).toContain('/elsewhere')
      // Every other scenario was MEASURED (including those after the escapes).
      expect(summary.coverageMeasured).toBe(summary.scenarios - 1)
      // …and snapshotted: the reloaded scenario too.
      expect(
        readdirSync(join(work, 'atlas-snapshots')).filter((f) => f.endsWith('.png')),
      ).toHaveLength(summary.scenarios)

      const catalog = JSON.parse(readFileSync(join(work, 'atlas-catalog.json'), 'utf8')) as {
        components: {
          name: string
          scenarios: {
            id: string
            verify: {
              reactivityCoverage: { status: string; findings?: { code: string; message: string }[] }
            }
          }[]
        }[]
      }
      const byName = new Map(
        catalog.components.map((c) => [c.name, c.scenarios[0]?.verify.reactivityCoverage]),
      )
      // Never a silent pass: the navigated scenario is a SKIP with a named code.
      const nav = byName.get('LocationAssign')
      expect(nav?.status).toBe('skip')
      expect(nav?.findings?.[0]?.code).toBe('navigated-away')
      // A suppressed default action is reported on the pass, by kind.
      const anchor = byName.get('PlainAnchor')
      expect(anchor?.status).toBe('pass')
      expect(anchor?.findings?.map((f) => f.code)).toContain('interaction-side-effects-suppressed')
      expect(
        anchor?.findings?.find((f) => f.code === 'interaction-side-effects-suppressed')?.message,
      ).toContain('anchor navigation')
      const escapes = byName
        .get('EscapeHatches')
        ?.findings?.find((f) => f.code === 'interaction-side-effects-suppressed')
      for (const kind of ['window.open', 'alert', 'confirm', 'prompt', 'history.pushState']) {
        expect(escapes?.message, kind).toContain(kind)
      }
      expect(
        byName
          .get('SubmitForm')
          ?.findings?.map((f) => f.message)
          .join(),
      ).toContain('form submit')
      expect(
        byName
          .get('ProgrammaticSubmit')
          ?.findings?.map((f) => f.message)
          .join(),
      ).toContain('form.submit()')
      expect(byName.get('Counter')?.status).toBe('pass')
    },
    300_000,
  )
})
