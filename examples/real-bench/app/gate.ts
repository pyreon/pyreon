#!/usr/bin/env bun
/**
 * Correctness gate only: `bun gate.ts [armId…]`. Serves each built arm with
 * the harness's static server and drives it through the contract in real
 * Chromium (`harness/gate.ts` lists the checks). Exit 1 on any failure. It
 * prints no timing (it records none), so it is safe on a busy machine and in CI.
 */
import { chromium } from 'playwright'
import { assertSharedIdentical, loadArms, outDir } from './harness/arms'
import { gateArm } from './harness/gate'
import { serveStatic } from './harness/serve'

const arms = loadArms(process.argv.slice(2).filter((a) => !a.startsWith('--')))
const browser = await chromium.launch()
let bad = 0
try {
  for (const arm of arms) {
    let failures: string[]
    try {
      assertSharedIdentical(arm)
      const srv = await serveStatic(outDir(arm), arm.m.fallback)
      try {
        failures = await gateArm(browser, srv.base)
      } finally {
        await srv.stop()
      }
    } catch (e) {
      failures = [String(e)]
    }
    console.log(`${failures.length === 0 ? '✓' : '✗'} ${arm.m.id}`)
    for (const f of failures.slice(0, 10)) console.log(`    FAIL ${f}`)
    if (failures.length > 0) bad++
  }
} finally {
  await browser.close()
}
process.exit(bad > 0 ? 1 : 0)
