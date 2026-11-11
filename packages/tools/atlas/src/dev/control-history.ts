/**
 * When each control first appeared during an `atlas dev` session.
 *
 * The Schema panel shows a control added to the source while the workbench
 * was open as "added 2 min ago" — the feedback that a prop you just typed was
 * picked up, without diffing two catalogs by eye. Only a RESCAN can add one,
 * so the history is seeded with the boot catalog (those carry no time: they
 * were there before anyone was watching) and stamps what each later rescan
 * brings in.
 *
 * Memory (anti-patterns, "Memory Leak Classes", class C): one entry per
 * control in the CURRENT catalog. Every `record` drops the keys the new
 * catalog no longer has, so the map can never outgrow the catalog — and a
 * control removed then re-added is stamped again, which is what "added"
 * should mean.
 */
import { componentKey, type ComponentIntelligence } from '../core'

export interface ControlHistory {
  /** Fold in a rescan's components, stamping new controls with `now`. */
  record(components: readonly ComponentIntelligence[], now: number): void
  /** Epoch ms the control appeared, or `undefined` for one present at boot. */
  addedAt(componentKey: string, controlKey: string): number | undefined
  /** Entries held — for the bound test. */
  readonly size: number
}

const BOOT = 0

function keysOf(components: readonly ComponentIntelligence[]): string[] {
  const out: string[] = []
  for (const c of components) {
    const owner = componentKey(c)
    for (const control of c.controls) out.push(`${owner}\u0000${control.name}`)
  }
  return out
}

export function createControlHistory(boot: readonly ComponentIntelligence[]): ControlHistory {
  const seen = new Map<string, number>()
  for (const key of keysOf(boot)) seen.set(key, BOOT)
  return {
    record(components, now) {
      const current = new Set(keysOf(components))
      for (const key of seen.keys()) if (!current.has(key)) seen.delete(key)
      for (const key of current) if (!seen.has(key)) seen.set(key, now)
    },
    addedAt(owner, control) {
      const at = seen.get(`${owner}\u0000${control}`)
      return at === undefined || at === BOOT ? undefined : at
    },
    get size() {
      return seen.size
    },
  }
}
