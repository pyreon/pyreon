/**
 * Reactive Coverage demo — run with:  bun scripts/demo-reactive-coverage.ts
 *
 * Models a tiny "cart" with some intentionally DEAD reactivity, exercises part
 * of it, and prints the coverage report. Shows what no other framework can:
 * which reactive nodes never actually fired during the run.
 */
// Relative src imports so this runs directly (`bun scripts/…`) without the
// workspace package being symlinked into root node_modules. In an app you'd
// import from '@pyreon/reactivity' and '@pyreon/reactivity/coverage'.
import { computed, effect, signal } from '../packages/core/reactivity/src/index'
import {
  formatReactiveCoverage,
  startReactiveCoverage,
  stopReactiveCoverage,
  takeReactiveCoverage,
} from '../packages/core/reactivity/src/coverage'

startReactiveCoverage()

// ── The "cart" ──────────────────────────────────────────────────────────────
const qty = signal(1, { name: 'qty' })
const unitPrice = signal(9.99, { name: 'unitPrice' }) // (never changes → dead)
const shippingFlat = signal(4.0, { name: 'shippingFlat' }) // (never changes → dead)

// total recomputes when qty or unitPrice change (shippingFlat is READ here but
// never CHANGED → its reactive-update behaviour is never exercised → dead)
const total = computed(() => qty() * unitPrice() + shippingFlat())

// a "discount" that reads nothing reactive — frozen forever (dead derived)
const discount = computed(() => 0)

// an effect that reacts to qty (will re-run)
effect(() => {
  void total()
})

// an effect that only runs at mount and never again (dead effect)
effect(() => {
  console.log('[cart] mounted') // runs once, reads nothing reactive
})

// ── Exercise SOME of the reactive graph (as a test would) ────────────────────
qty.set(2) // qty fires → total recomputes → the total-effect re-runs
void total() // read the recomputed value
void discount() // read once (never recomputes)

// ── Report ───────────────────────────────────────────────────────────────────
const report = takeReactiveCoverage()
stopReactiveCoverage()

console.log(`\n${'─'.repeat(64)}`)
console.log(formatReactiveCoverage(report, { showCovered: true }))
console.log('─'.repeat(64))
console.log(
  '\nRead: `unitPrice` / `shippingFlat` never changed, `discount` never ' +
    'recomputed, and one effect only ran at mount — all flagged as untested / ' +
    'dead reactivity that a line-coverage tool would happily report as 100%.',
)
