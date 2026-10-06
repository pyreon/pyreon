/**
 * Real-Chromium proof (issue #3837) that `atlas verify-browser` captures a
 * scenario only once its preview holds still.
 *
 * Before the fix the runner screenshotted one frame after the click-walk, so a
 * finite JavaScript canvas animation was recorded MID-FLIGHT (4,900 red pixels,
 * zero green in the issue's reproduction) — `animations: 'disabled'` fast-forwards
 * CSS / Web Animations but cannot stop a `requestAnimationFrame` loop. A loop
 * that never ends must FAIL explicitly instead of being sampled.
 *
 * Needs Chromium; skips loudly without it (and fails when the job says it
 * provisions one — `PYREON_REQUIRE_CHROMIUM`, see side-effects.test.ts).
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runScan } from '../../cli/run'
import { decodePng } from '../png'
import { runBrowserVerify, unsettledOutcome } from '../runner'
import { SETTLE_SOURCE, unsettledMessage } from '../settle'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/settle')

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
    '[atlas] settle.test.ts: real-Chromium specs SKIPPED — Chromium is not installed (bunx playwright-core install chromium). CI runs them in the atlas-verify-browser e2e suite, which sets PYREON_REQUIRE_CHROMIUM=1.',
  )
}

describe('capture readiness (pure)', () => {
  it('the in-page settle source is a parseable async function', () => {
    expect(() => new Function(`return ${SETTLE_SOURCE}`)).not.toThrow()
  })

  it('an unsettled preview is a FAIL with a named code and no baseline', () => {
    const outcome = unsettledOutcome(
      { status: 'unsettled', waitedMs: 5000, reasons: ['canvas #0 pixels'] },
      300,
      5000,
    )
    expect(outcome.created).toBe(false)
    expect(outcome.snapshot.status).toBe('fail')
    expect(outcome.snapshot.findings?.[0]?.code).toBe('capture-unsettled')
    expect(outcome.snapshot.findings?.[0]?.message).toContain('canvas #0 pixels')
    expect(outcome.snapshot.findings?.[0]?.fix).toBeTruthy()
  })

  it('a settle wait that could not run is a failure too, never a silent capture', () => {
    const outcome = unsettledOutcome({ status: 'error', reason: 'boom' }, 300, 5000)
    expect(outcome.snapshot.status).toBe('fail')
    expect(outcome.snapshot.findings?.[0]?.message).toContain('boom')
  })

  it('names the unsettled window and cap', () => {
    expect(unsettledMessage({ status: 'unsettled', waitedMs: 1, reasons: [] }, 300, 5000)).toContain('300ms within 5000ms')
  })
})

interface SettlePage {
  setContent(html: string): Promise<void>
  evaluate<T>(script: string): Promise<T>
  route(url: string, handler: (route: { fulfill(o: object): Promise<void> }) => unknown): Promise<void>
  close(): Promise<void>
}

describe('settle wait in a real page (real Chromium)', () => {
  it('has Chromium wherever the job says it provisions one', () => {
    if (process.env.PYREON_REQUIRE_CHROMIUM) {
      expect(HAS_CHROMIUM, 'Chromium must be installed in this job').toBe(true)
    }
  })

  async function withPage<T>(body: string, fn: (run: (stable?: number, cap?: number) => Promise<{ status: string; waitedMs: number; reasons?: string[] }>, page: SettlePage) => Promise<T>): Promise<T> {
    const pw = (await import('playwright-core')) as unknown as {
      chromium: { launch(): Promise<{ newPage(): Promise<SettlePage>; close(): Promise<void> }> }
    }
    const browser = await pw.chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent(`<div id="surface">${body}</div>`)
      await page.evaluate(`globalThis.__ATLAS_MODEL__ = { previewElement: () => document.getElementById('surface') }`)
      const run = (stable = 300, cap = 5000) =>
        page.evaluate<{ status: string; waitedMs: number; reasons?: string[] }>(`(${SETTLE_SOURCE})(${stable}, ${cap}, 100)`)
      return await fn(run, page)
    } finally {
      await browser.close()
    }
  }

  it.skipIf(!HAS_CHROMIUM)('a STATIC preview settles within the quiet window, not the full cap', async () => {
    await withPage('<p>hello</p>', async (run) => {
      const out = await run(300, 5000)
      expect(out.status).toBe('settled')
      // Quiet previews wait ~100ms; the bound is loose on purpose (load-sensitive).
      expect(out.waitedMs).toBeLessThan(1500)
    })
  }, 60_000)

  it.skipIf(!HAS_CHROMIUM)('a FINITE canvas animation settles on its final frame', async () => {
    await withPage('<canvas id="c" width="100" height="50"></canvas>', async (run, page) => {
      await page.evaluate(`(() => {
        const c = document.getElementById('c'); const x = c.getContext('2d'); const t0 = performance.now()
        const draw = (now) => { const p = Math.min(1, (now - t0) / 800); x.clearRect(0,0,100,50); x.fillStyle = p === 1 ? '#0f0' : '#f00'; x.fillRect(p * 50, 0, 50, 50); if (p < 1) requestAnimationFrame(draw) }
        draw(t0)
      })()`)
      const out = await run(300, 5000)
      expect(out.status).toBe('settled')
      expect(out.waitedMs).toBeGreaterThanOrEqual(600)
      const final = await page.evaluate<string>(`document.getElementById('c').getContext('2d').getImageData(75, 25, 1, 1).data.join(',')`)
      expect(final).toBe('0,255,0,255')
    })
  }, 60_000)

  it.skipIf(!HAS_CHROMIUM)('an ENDLESS animation is reported unsettled at the cap, naming what kept changing', async () => {
    await withPage('<canvas id="c" width="100" height="50"></canvas>', async (run, page) => {
      await page.evaluate(`(() => {
        const x = document.getElementById('c').getContext('2d')
        const loop = (now) => { x.clearRect(0,0,100,50); x.fillRect((now / 10) % 50, 0, 20, 50); requestAnimationFrame(loop) }
        loop(performance.now())
      })()`)
      const out = await run(300, 1200)
      expect(out.status).toBe('unsettled')
      expect(out.reasons?.join()).toContain('canvas #0 pixels')
    })
  }, 60_000)

  it.skipIf(!HAS_CHROMIUM)('CSS animations settle: a finite transition finishes, an infinite spinner is frozen, not "unsettled"', async () => {
    await withPage(
      `<style>
        @keyframes spin { to { transform: rotate(360deg) } }
        #s { width: 20px; height: 20px; background: red; animation: spin 1s linear infinite }
        #t { width: 10px; height: 10px; background: blue; transition: width 1.5s linear }
        #t.go { width: 100px }
      </style><div id="s"></div><div id="t"></div>`,
      async (run, page) => {
        await page.evaluate(`document.getElementById('t').className = 'go'`)
        const out = await run(300, 3000)
        expect(out.status).toBe('settled')
        expect(await page.evaluate<number>(`document.getElementById('t').getBoundingClientRect().width`)).toBe(100)
      },
    )
  }, 60_000)

  it.skipIf(!HAS_CHROMIUM)('a still-loading image holds the wait open until it is complete', async () => {
    await withPage('', async (run, page) => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      )
      await page.route('http://atlas.test/slow.png', async (route) => {
        await new Promise((r) => setTimeout(r, 900))
        await route.fulfill({ status: 200, contentType: 'image/png', body: png })
      })
      await page.evaluate(`document.getElementById('surface').innerHTML = '<img id="i" src="http://atlas.test/slow.png" width="10" height="10">'`)
      const out = await run(200, 5000)
      expect(out.status).toBe('settled')
      expect(await page.evaluate<boolean>(`document.getElementById('i').complete`)).toBe(true)
      expect(out.waitedMs).toBeGreaterThanOrEqual(700)
    })
  }, 60_000)
})

describe('verify-browser capture readiness (real Chromium, end to end)', () => {
  const work = HAS_CHROMIUM ? mkdtempSync(join(FIXTURE, '..', 'run-settle-')) : ''
  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true })
  })

  it.skipIf(!HAS_CHROMIUM)(
    'captures the finished canvas frame, fails the endless one without a screenshot, and keeps static scenarios',
    async () => {
      cpSync(FIXTURE, work, { recursive: true })
      await runScan({ cwd: work, mount: false })
      const summary = await runBrowserVerify({
        cwd: work,
        port: 5392,
        axe: false,
        settleMs: 300,
        settleTimeoutMs: 4500,
      })

      expect(summary.scenarios).toBe(3)
      // ONLY the endless animation never settled, and it is named.
      expect(summary.unsettled).toHaveLength(1)
      expect(summary.unsettled[0]).toMatch(/endlesscanvas/)
      expect(summary.snapshotsFailed).toBe(1)

      // The finite canvas animation was captured in its FINAL state: green, no red.
      const png = decodePng(readFileSync(join(work, 'atlas-snapshots', 'settle-movingcanvas--default.png')))
      let red = 0
      let green = 0
      for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!]
        if (r > 200 && g < 60 && b < 60) red += 1
        if (g > 200 && r < 60 && b < 60) green += 1
      }
      expect(red, 'mid-flight red pixels').toBe(0)
      expect(green, 'final green pixels').toBeGreaterThan(1000)

      // The unsettled scenario recorded NO baseline — an arbitrary frame is not a baseline.
      expect(existsSync(join(work, 'atlas-snapshots', 'settle-endlesscanvas--default.png'))).toBe(false)
      expect(existsSync(join(work, 'atlas-snapshots', 'settle-staticcard--default.png'))).toBe(true)

      const catalog = JSON.parse(readFileSync(join(work, 'atlas-catalog.json'), 'utf8')) as {
        components: { name: string; scenarios: { verify: { ok: boolean; snapshot: { status: string; findings?: { code: string }[] } } }[] }[]
      }
      const snap = (name: string) => catalog.components.find((c) => c.name === name)?.scenarios[0]?.verify.snapshot
      expect(snap('EndlessCanvas')?.status).toBe('fail')
      expect(snap('EndlessCanvas')?.findings?.[0]?.code).toBe('capture-unsettled')
      expect(snap('MovingCanvas')?.status).toBe('pass')
      expect(snap('StaticCard')?.status).toBe('pass')
    },
    300_000,
  )
})
