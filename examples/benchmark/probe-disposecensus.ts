/**
 * NON-TIMING census of a 500-row subscription teardown — the load-independent
 * half of the dispose investigation.
 *
 * The same instrument PR #2912 used to kill three hypotheses about `clear
 * rows`: patch the collection primitives, drive the real teardown, and COUNT.
 * A count cannot be inflated by machine load, so this evidence stands even
 * when no quiet measurement window exists — and combined with the flat
 * ~20-25ns/delete established by `probe-setdelete.ts`, it attributes the cost
 * arithmetically rather than by sampling.
 *
 * Counts, per arm, for ONE mount+dispose cycle of 500 rows:
 *   - Set.prototype.add / delete / clear   (Pyreon subscriber sets `_s`)
 *   - Map.prototype.delete                  (selector/reconciler key maps)
 *   - Array push/pop are not patchable, so Solid's slot-array removals appear
 *     as the ABSENCE of hashed ops — which is exactly the finding.
 *
 * Run against the built bench page so it is the shipped code being censused.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = process.env.DP_PORT ?? '4189'
const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://localhost:${PORT}/?profileDispose=1`)
  await page.waitForFunction(() => '__disposeBench' in globalThis, undefined, { timeout: 30_000 })

  type Bench = {
    mount: (arm: string) => void
    dispose: (arm: string) => void
    rowCount: (arm: string) => number
    tick: (v: number) => void
    boundText: (arm: string) => string | null
  }

  // ── Reactivity gate (see `boundText`'s comment). A dead binding deletes
  // nothing either, so "0 hashed deletes" is only evidence of the direct tier
  // once the binding is PROVEN live. Arms with a reactive text bind must show
  // the ticked value; row 0 renders `v + 0`.
  const reactive = await page.evaluate(() => {
    const b = (globalThis as never as { __disposeBench: Bench }).__disposeBench
    const out: Record<string, string | null> = {}
    for (const a of ['A', 'B', 'H', 'I']) {
      b.mount(a)
      b.tick(4242)
      out[a] = b.boundText(a)
      b.dispose(a)
    }
    return out
  })
  for (const [arm, text] of Object.entries(reactive)) {
    if (text !== '4242') {
      throw new Error(
        `[reactivity gate] arm ${arm} rendered ${JSON.stringify(text)} after tick(4242) — ` +
          `expected "4242". A dead binding performs zero hashed deletes too, so this arm's ` +
          `census would be meaningless. Refusing to report.`,
      )
    }
  }
  console.log(
    `[census] reactivity gate OK — arms ${Object.keys(reactive).join(', ')} all render the ticked value`,
  )

  const census = await page.evaluate(() => {
    const b = (globalThis as never as { __disposeBench: Bench }).__disposeBench
    const arms = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

    const origSetDelete = Set.prototype.delete
    const origSetAdd = Set.prototype.add
    const origSetClear = Set.prototype.clear
    const origMapDelete = Map.prototype.delete

    const c = { setDelete: 0, setAdd: 0, setClear: 0, mapDelete: 0 }
    let counting = false

    // eslint-disable-next-line no-extend-native
    Set.prototype.delete = function (this: Set<unknown>, v: unknown) {
      if (counting) c.setDelete++
      return origSetDelete.call(this, v)
    }
    Set.prototype.add = function (this: Set<unknown>, v: unknown) {
      if (counting) c.setAdd++
      return origSetAdd.call(this, v)
    }
    Set.prototype.clear = function (this: Set<unknown>) {
      if (counting) c.setClear++
      return origSetClear.call(this)
    }
    Map.prototype.delete = function (this: Map<unknown, unknown>, k: unknown) {
      if (counting) c.mapDelete++
      return origMapDelete.call(this, k)
    }

    const out: Record<string, typeof c> = {}
    try {
      for (const a of arms) {
        // Warm once so lazy allocations are not censused as teardown work.
        b.mount(a)
        b.tick(1)
        b.dispose(a)

        b.mount(a)
        b.tick(2)
        c.setDelete = 0
        c.setAdd = 0
        c.setClear = 0
        c.mapDelete = 0
        counting = true
        b.dispose(a)
        counting = false
        out[a] = { ...c }
      }
    } finally {
      Set.prototype.delete = origSetDelete
      Set.prototype.add = origSetAdd
      Set.prototype.clear = origSetClear
      Map.prototype.delete = origMapDelete
    }
    return out
  })

  const LABEL: Record<string, string> = {
    A: 'A_full      component + effect() + reactive bind  ← benched shape',
    B: 'B_noEffect  component +           reactive bind',
    C: 'C_noBind    component + effect() + static text',
    D: 'D_bare      component,  no subscriptions',
    E: 'E_noComp    500 plain <span> vnodes',
    F: 'F_scope     500 effects in one EffectScope, no DOM',
    G: 'G_solid     SolidJS, same shape',
    H: 'H_directBind = arm B, but `value` IS THE SIGNAL (not a wrapper)',
    I: 'I_directFull = arm A, but `value` IS THE SIGNAL (not a wrapper)',
  }

  console.log('\n=== NON-TIMING census — hashed collection ops per 500-row dispose ===')
  console.log(
    `${'arm'.padEnd(12)} ${'Set.delete'.padStart(11)} ${'Set.clear'.padStart(10)} ${'Set.add'.padStart(8)} ${'Map.delete'.padStart(11)}   shape`,
  )
  for (const [arm, v] of Object.entries(census)) {
    console.log(
      `${arm.padEnd(12)} ${String(v.setDelete).padStart(11)} ${String(v.setClear).padStart(10)} ${String(v.setAdd).padStart(8)} ${String(v.mapDelete).padStart(11)}   ${LABEL[arm]}`,
    )
  }

  const a = census.A as { setDelete: number }
  const g = census.G as { setDelete: number }
  console.log(
    `\nAt the ~20-25ns/delete established by probe-setdelete.ts, arm A's ${a.setDelete} hashed ` +
      `deletes cost ${((a.setDelete * 20) / 1000).toFixed(1)}-${((a.setDelete * 25) / 1000).toFixed(1)}µs.`,
  )
  console.log(
    `Solid (arm G) performs ${g.setDelete} hashed deletes for the same 500 teardowns — it removes ` +
      `observers by SLOT INDEX from arrays (solid.js cleanNode), which the probe measures at 0-5ns.`,
  )
} finally {
  await browser.close()
  preview.kill()
}
