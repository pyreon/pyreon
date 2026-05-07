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
import { useFormState } from '@pyreon/form'
import { install } from '@pyreon/perf-harness'
import { mount } from '@pyreon/runtime-dom'
import {
  App,
  confirmPasswordSignal,
  formStressLastSelectorValue,
  formStressLastSummary,
  formStressScale,
  longFormFields,
  passwordSignal,
} from './App'

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

// ── Forms-stress journey hooks ──────────────────────────────────────────────
//
// Drive the FormStressSection from Playwright. The journey calls these via
// `page.evaluate(() => __pyreon_perf_forms.setScale(10000))`. Counter resets
// happen in `record.ts:170` BEFORE the journey body runs, so every counter
// emission inside `setScale` / `triggerStateRead` lands in the run's
// snapshot.

interface FormsStressHooks {
  setScale: (n: number) => void
  triggerStateRead: () => void
  triggerStateReadSelector: () => void
  fillField: (name: string, value: string) => void
}

;(window as unknown as { __pyreon_perf_forms: FormsStressHooks }).__pyreon_perf_forms = {
  // Set the scale signal. Default is 0 (unmounted). Setting to N > 0 mounts
  // FormAtScale with N fields. Going N → M (both > 0) UNMOUNTS old + MOUNTS
  // fresh because FormStressSection's <For> is keyed by scale.
  setScale: (n: number) => {
    formStressScale.set(n)
  },
  // Read useFormState WITHOUT a selector. Triggers a full O(N) scan.
  // Stores the snapshot on `formStressLastSummary` so a follow-up read
  // can confirm the scan ran (and what it returned).
  triggerStateRead: () => {
    const active = (
      window as unknown as { __pyreon_perf_forms_active?: { form: unknown; scale: number } }
    ).__pyreon_perf_forms_active
    if (!active) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = useFormState(active.form as any)()
    formStressLastSummary.set(summary)
  },
  // Read useFormState WITH a selector that touches just `isValid`. The
  // current implementation scans all N fields anyway (the bottleneck this
  // benchmark surfaces); PR 3 candidate fix narrows the scan to only the
  // signals the selector actually reads.
  triggerStateReadSelector: () => {
    const active = (
      window as unknown as { __pyreon_perf_forms_active?: { form: unknown; scale: number } }
    ).__pyreon_perf_forms_active
    if (!active) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = useFormState(active.form as any, (s) => s.isValid)()
    formStressLastSelectorValue.set(value)
  },
  // Fill a single field by name without DOM round-trip — direct signal
  // write through the form's exposed `fields[name].value.set(...)`. Used
  // by the `formEditSingle-10k` and `formEditBatch-10k` journeys to
  // measure per-field write cost without Playwright's `page.fill` adding
  // noise (locator resolution + event dispatch + re-render).
  fillField: (name: string, value: string) => {
    const active = (
      window as unknown as {
        __pyreon_perf_forms_active?: {
          form: { fields: Record<string, { value: { set: (v: unknown) => void } }> }
          scale: number
        }
      }
    ).__pyreon_perf_forms_active
    if (!active) return
    const f = active.form.fields[name]
    if (f) f.value.set(value)
  },
}

const root = document.getElementById('app')
if (!root) throw new Error('#app root element missing')
mount(h(App, null), root)
