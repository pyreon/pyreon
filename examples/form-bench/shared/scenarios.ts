/**
 * The scenario CONTRACT — a framework-agnostic description of every operation
 * the Tier-B suite measures. Each impl (`src/impl/<framework>.ts`) MUST
 * implement exactly these `status: 'active'` scenarios under the same id, so
 * the driver can line columns up and the reader can trust that "keystroke-blur"
 * means the same user action in every column.
 *
 * `commitNote` documents the per-framework commit boundary used to make the
 * timed region fair (the DOM-bench's key objectivity fix) — synchronous
 * frameworks pay no scheduler floor, async frameworks use their tightest real
 * flush. See METHODOLOGY.md.
 */
export interface ScenarioSpec {
  id: string
  title: string
  description: string
  /** Per-framework commit boundary (what the runner's `commit` hook does). */
  commitNote: string
  status: 'active' | 'planned'
}

export const SCENARIOS: ScenarioSpec[] = [
  {
    id: 'mount-12-fields',
    title: 'Mount a 12-field form',
    description:
      'Render a fresh 12-field registration form into a clean container. Proxy for time-to-interactive of a real form. Reset disposes the previous mount.',
    commitNote: 'Pyreon: synchronous mount. RHF: flushSync(render) — commits the React tree synchronously.',
    status: 'active',
  },
  {
    id: 'keystroke-blur',
    title: 'Keystroke — validateOn:blur (hot path)',
    description:
      'Type a 12-character word (12 distinct keystrokes) into ONE field of the 12-field form with NO per-keystroke validation (Pyreon validateOn:"blur" / RHF mode:"onBlur"). The pure value-commit path. A whole word per timed run keeps the work above Chromium\'s ~100µs timer floor and matches how users actually type; each run re-clears the field first.',
    commitNote: 'Pyreon: synchronous signal write + bound-node patch. RHF: flushSync(dispatch input) — RHF is uncontrolled so the input value is native; this measures its onChange ref-write + subscription bookkeeping.',
    status: 'active',
  },
  {
    id: 'keystroke-change',
    title: 'Keystroke — validateOn:change (worst case)',
    description:
      'Same 12-keystroke word, but validating on EVERY keystroke (Pyreon validateOn:"change" / RHF mode:"onChange"). Where the architectures diverge most: Pyreon validates the one field via the schema-per-field path; RHF re-runs the resolver and re-renders the field on each keystroke.',
    commitNote: 'Pyreon: synchronous validate + error-node patch. RHF: flushSync(dispatch input) — commits the resolver run + error re-render synchronously.',
    status: 'active',
  },
  {
    id: 'reset-dirty-form',
    title: 'Reset a dirty 12-field form',
    description:
      'Dirty all 12 fields, then reset the whole form to initial values. Each timed run re-dirties before the reset so the reset always does real work.',
    commitNote: 'Pyreon: synchronous reset (per-field signal writes batched). RHF: flushSync(reset) — commits the form-state reset + uncontrolled-input clear synchronously.',
    status: 'active',
  },
  {
    id: 'validate-submit-invalid',
    title: 'Submit an invalid form (validate-all → errors render)',
    description:
      'Submit an empty form; the whole-form validation fails and every required-field error must render to the DOM. PLANNED — deferred from the MVP because RHF commits its error state through React\'s async path, which needs a fair act()/commit boundary to compare cleanly against Pyreon\'s synchronous error patch. Tracked in METHODOLOGY.md §Roadmap.',
    commitNote: 'Pyreon: await handleSubmit() (errors patch synchronously). RHF: await handleSubmit()() + a fair React commit flush (the deferred piece).',
    status: 'planned',
  },
]

export const ACTIVE_SCENARIOS = SCENARIOS.filter((s) => s.status === 'active')
