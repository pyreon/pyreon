#!/usr/bin/env bun
/**
 * Correctness gate only (no timing): `bun gate.ts [stackId…]`.
 * Starts each built arm, runs `lib/gate.ts`, stops it. Exit 1 on any failure.
 */
import { chromium } from 'playwright'
import { runGate } from './lib/gate'
import { assertDataIdentical, loadStacks, portFor, startServer } from './lib/stacks'

const stacks = loadStacks(process.argv.slice(2).filter((a) => !a.startsWith('--')))
const browser = await chromium.launch()
let bad = 0
try {
  for (const { dir, m } of stacks) {
    if (m.skip) {
      console.log(`- ${m.id}: SKIPPED (${m.skip})`)
      continue
    }
    assertDataIdentical(dir, m)
    const srv = await startServer(dir, m, portFor(m.id))
    try {
      const g = await runGate(m, srv, browser)
      console.log(`${g.ok ? '✓' : '✗'} ${m.id}  cold start ${srv.coldStartMs.toFixed(0)} ms`)
      for (const f of g.failures) console.log(`    FAIL ${f}`)
      for (const n of g.notes) console.log(`    note ${n}`)
      if (!g.ok) {
        bad++
        console.log(srv.log().split('\n').slice(-30).join('\n'))
      }
    } finally {
      await srv.stop()
    }
  }
} finally {
  await browser.close()
}
process.exit(bad > 0 ? 1 : 0)
