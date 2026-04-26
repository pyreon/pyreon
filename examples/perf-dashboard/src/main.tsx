/**
 * Entry point. In dev, auto-installs the perf-harness so counters are live
 * from first paint — no "click here to start measuring" step that would
 * miss the boot phase where most interesting things happen.
 *
 * The Playwright record script (scripts/perf/record.ts) depends on this
 * auto-install to capture counter values via `page.evaluate(() =>
 * __pyreon_perf__.snapshot())`.
 */
import { h } from '@pyreon/core'
import { install } from '@pyreon/perf-harness'
import { mount } from '@pyreon/runtime-dom'
import { App, confirmPasswordSignal, longFormFields, passwordSignal } from './App'

interface ViteMeta {
  readonly env?: { readonly DEV?: boolean }
}
if ((import.meta as ViteMeta).env?.DEV === true) {
  install()
}

// Expose journey-helper hooks so scripts/perf/record.ts can reset state
// between measurement runs (see journeys.ts → form journey).
;(window as unknown as { __pyreon_perf_dashboard: Record<string, () => void> }).__pyreon_perf_dashboard =
  {
    resetForm: () => {
      for (let i = 0; i < longFormFields.length; i++) {
        const f = longFormFields[i]
        if (f) f.sig.set(`field-${i}-default`)
      }
      passwordSignal.set('')
      confirmPasswordSignal.set('')
    },
  }

const root = document.getElementById('app')
if (!root) throw new Error('#app root element missing')
mount(h(App, null), root)
