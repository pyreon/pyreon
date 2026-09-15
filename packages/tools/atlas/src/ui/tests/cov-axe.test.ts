/**
 * The axe panel — the REAL engine where it runs, an injected loader where the
 * shape under test is one axe does not produce on demand.
 *
 * axe-core is a dependency of this package and runs against happy-dom, so the
 * headline case is the genuine one: a real `<button></button>` through the real
 * engine, producing the real `button-name` violation. That is what pins the
 * default loader (the arm a mock can never reach) and the option set it is
 * called with.
 *
 * The remaining cases inject the loader, because they are about REPORTING what
 * axe said in shapes a curated fixture cannot force — an absent `impact`, a
 * violation with no selector, and a run that FAILED rather than passed.
 * Rebuilding axe's rule tuning is the canonical way to ship a worse axe, so
 * nothing here re-derives a verdict.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { AXE_IDLE, type AxeReport, runAxe } from '../axe'

type Loader = Parameters<typeof runAxe>[1]

const surface = (html: string): Element => {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.append(el)
  return el
}

/** A loader that resolves to a canned axe result. */
const canned = (result: unknown): Loader =>
  (async () => ({ run: async () => result })) as unknown as Loader

describe('AXE_IDLE', () => {
  it('is a ready-but-empty report, never a passing one', () => {
    expect(AXE_IDLE).toEqual({ status: 'ready', violations: [], incomplete: 0 })
  })
})

describe('runAxe — the real engine', () => {
  it('finds a real violation in a real element and shapes it for the panel', async () => {
    const report = await runAxe(surface('<button></button>'))

    expect(report.status).toBe('done')
    expect(report.violations).toEqual([
      {
        id: 'button-name',
        impact: 'critical',
        help: 'Buttons must have discernible text',
        target: 'button',
        nodes: 1,
      },
    ])
  }, 30_000)

  it('leaves a well-formed element alone — a named button is not flagged', async () => {
    const report = await runAxe(surface('<button>Save</button>'))
    expect(report.status).toBe('done')
    expect(report.violations.map((v) => v.id)).not.toContain('button-name')
  }, 30_000)

  it('does not flag the fragment for PAGE-level rules it cannot satisfy', async () => {
    // A preview is a fragment, not a document: `region`, `landmark-one-main`
    // and `page-has-heading-one` would fire on every component in the catalog,
    // so they are disabled at the call site.
    const report = await runAxe(surface('<button>Save</button>'))
    const ids = report.violations.map((v) => v.id)
    expect(ids).not.toContain('region')
    expect(ids).not.toContain('landmark-one-main')
    expect(ids).not.toContain('page-has-heading-one')
  }, 30_000)
})

describe('runAxe — reporting what axe said', () => {
  it('keeps the FIRST node as the highlight target and counts the rest', async () => {
    const report = await runAxe(
      surface('<div></div>'),
      canned({
        violations: [
          {
            id: 'button-name',
            impact: 'critical',
            help: 'Buttons must have discernible text',
            nodes: [{ target: ['button'] }, { target: ['button.b'] }],
          },
        ],
        incomplete: [],
      }),
    )
    expect(report.violations).toEqual([
      {
        id: 'button-name',
        impact: 'critical',
        help: 'Buttons must have discernible text',
        target: 'button',
        nodes: 2,
      },
    ])
  })

  it('renders a MISSING impact as "unknown" — an empty cell reads as "no impact"', async () => {
    const report = await runAxe(
      surface('<div></div>'),
      canned({ violations: [{ id: 'r', help: 'h', nodes: [{ target: ['div'] }] }], incomplete: [] }),
    )
    expect(report.violations[0]!.impact).toBe('unknown')
  })

  it('renders an EMPTY target rather than "undefined" when axe reports no selector', async () => {
    const report = await runAxe(
      surface('<div></div>'),
      canned({
        violations: [
          { id: 'a', impact: 'minor', help: 'h', nodes: [{ target: [] }] },
          { id: 'b', impact: 'minor', help: 'h', nodes: [] },
        ],
        incomplete: [],
      }),
    )
    expect(report.violations.map((v) => v.target)).toEqual(['', ''])
    expect(report.violations.map((v) => v.nodes)).toEqual([1, 0])
  })

  it('reports the incomplete count — axe’s "needs a human" category is never dropped', async () => {
    const report = await runAxe(
      surface('<div></div>'),
      canned({ violations: [], incomplete: [{ id: 'color-contrast' }, { id: 'aria-hidden-focus' }] }),
    )
    expect(report).toEqual({ status: 'done', violations: [], incomplete: 2 })
  })
})

describe('runAxe — a failed run is a FAILED run', () => {
  const failing = (thrown: unknown): Loader =>
    (async () => {
      throw thrown
    }) as unknown as Loader

  it('reports the error instead of fabricating a clean pass', async () => {
    const report: AxeReport = await runAxe(surface('<div></div>'), failing(new Error('axe unavailable')))
    expect(report).toEqual({
      status: 'failed',
      violations: [],
      incomplete: 0,
      error: 'axe unavailable',
    })
    // The distinction that matters: `done` with no violations means axe ran and
    // found nothing; `failed` means nothing was checked at all.
    expect(report.status).not.toBe('done')
  })

  it('survives a rejection that is not an Error', async () => {
    const report = await runAxe(surface('<div></div>'), failing('boom'))
    expect(report.error).toBe('boom')
  })

  it('reports the ENGINE refusing, not just the load failing', async () => {
    const report = await runAxe(
      surface('<div></div>'),
      (async () => ({
        run: async () => {
          throw new Error('no document')
        },
      })) as unknown as Loader,
    )
    expect(report.status).toBe('failed')
    expect(report.error).toBe('no document')
  })
})
