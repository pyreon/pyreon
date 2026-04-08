import { applySnapshot, getSnapshot, model, onPatch } from '@pyreon/state-tree'
import {
  type AccountValues,
  DEFAULT_WIZARD,
  type PreferencesValues,
  type ProfileValues,
  type WizardSnapshot,
} from './schema'

/**
 * Wizard state-tree model.
 *
 * Holds the merged data the user has filled in across every step. We
 * use `@pyreon/state-tree` (rather than a plain composition store)
 * specifically for two features:
 *
 *   1. **Snapshots** — `getSnapshot(wizard)` produces a JSON-safe
 *      object that the Review step renders as a table and the final
 *      "Submit" action would POST to a real backend.
 *   2. **Patches** — every write emits a JSON patch via `onPatch`,
 *      which we collect into an `undoStack` so the user can undo
 *      edits across steps. The patch tape is also a free audit log.
 */
export const WizardModel = model({
  state: {
    account: DEFAULT_WIZARD.account,
    profile: DEFAULT_WIZARD.profile,
    preferences: DEFAULT_WIZARD.preferences,
  },
  views: () => ({}),
  actions: (self) => ({
    setAccount(values: AccountValues) {
      self.account.set(values)
    },
    setProfile(values: ProfileValues) {
      self.profile.set(values)
    },
    setPreferences(values: PreferencesValues) {
      self.preferences.set(values)
    },
    /** Restore the wizard to its initial empty state. */
    reset() {
      self.account.set(DEFAULT_WIZARD.account)
      self.profile.set(DEFAULT_WIZARD.profile)
      self.preferences.set(DEFAULT_WIZARD.preferences)
    },
  }),
})

/** Singleton hook so every step component shares one wizard instance. */
export const useWizard = WizardModel.asHook('forms-wizard')

/**
 * Subscribe to patches and return a stable accessor over the most
 * recent patch — used by the route component to show "step state
 * captured" feedback in the dev sidebar.
 *
 * Returns the registered cleanup so the route can dispose it on unmount.
 */
export function trackPatches(
  instance: ReturnType<typeof useWizard>,
  onChange: (patchCount: number) => void,
): () => void {
  let count = 0
  return onPatch(instance, () => {
    count += 1
    onChange(count)
  })
}

/** Helper that re-exports getSnapshot/applySnapshot at the section's API level. */
export function snapshotWizard(instance: ReturnType<typeof useWizard>): WizardSnapshot {
  return getSnapshot<{ account: AccountValues; profile: ProfileValues; preferences: PreferencesValues }>(
    instance,
  ) as WizardSnapshot
}

/** Restore from a previously captured snapshot (e.g. for "load draft"). */
export function restoreWizard(
  instance: ReturnType<typeof useWizard>,
  snap: WizardSnapshot,
): void {
  // The state-tree types use a `StateShape` index-signature constraint
  // that our concrete `WizardSnapshot` doesn't quite satisfy at the
  // type level. The runtime accepts any plain object with matching
  // keys, so a single cast at the section boundary is the right call.
  applySnapshot(instance, snap as unknown as Record<string, unknown>)
}
