/**
 * Create-path DECOMPOSITION target — prices each component of Pyreon's residual
 * create gap to hand-written Vanilla DOM, as a LADDER of arms that differ by
 * exactly one cost each.
 *
 * `bench-createsplit.ts` already splits the create op into JS vs forced-layout.
 * That answers "how much is addressable framework JS?" but not "WHICH framework
 * work is it?". Attributing the JS half by reasoning has already misfired on
 * this campaign, so this instrument measures the split instead.
 *
 * The ladder — each rung adds ONE thing over the rung below, and every arm
 * renders the same two-cell row into its own host:
 *
 *   V   vanilla       createElement/appendChild, plain `{id,label}` rows
 *   L1  For + static  `<For>` + `_tpl` clone + 2 `_setChild`; compiler returns
 *                     `null` for the row cleanup (verified in the emit), so this
 *                     rung carries the reconciler and template but NO
 *                     subscription and NO per-row cleanup closure
 *   L2  + label bind   adds `_bindText(r.label, …)` — one direct signal
 *                     subscription + one disposer returned as the row cleanup
 *   L3  + selector     adds `isSelected.subscribe(r.id, …)` + `_setClass`, and
 *                     the row cleanup becomes a wrapper closure `() => {…}`
 *                     — this rung IS `impl/pyreon.tsx`'s row, byte for byte
 *
 * Deltas therefore price: (L1−V) reconciler+template, (L2−L1) the per-row label
 * binding, (L3−L2) the selector subscription plus the cleanup wrapper.
 *
 * BUILD vs COMMIT is split separately because the benched op is
 * `rows.set(mkRows(n))` and `mkRows` allocates a `signal()` per row that Vanilla
 * never pays — charging that to "framework mount overhead" would be wrong. Each
 * arm exposes:
 *
 *   build   — row construction only, into a prebuilt buffer
 *   commit  — the DOM-producing half, driven from that prebuilt buffer
 *   create  — build + commit, i.e. exactly what the fair bench times
 *
 * `create` is measured independently rather than summed, so the decomposition
 * can be CHECKED against the thing it claims to explain: if
 * build + commit ≠ create, the model is wrong.
 *
 * NOT part of the timed fair bench — measurement scaffolding only, loaded
 * exclusively behind `?profileDecomp=1`. Kept separate from `profile-create.tsx`
 * so the existing `__createBench` instrument (and the baselines taken with it)
 * stays byte-identical.
 */
import { For } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { Row } from '../runner'
import { buildRows, buildRowsWith, resetRng } from '../runner'

/** See `profile-create.tsx` — assign the raw number, let WebIDL coerce it. */
type NumericText = { textContent: number }

type SigRow = { id: number; label: ReturnType<typeof signal<string>> }
type PlainRow = Row

export function setupDecompProfile(hosts: {
  vanilla: HTMLElement
  l1: HTMLElement
  l2: HTMLElement
  l3: HTMLElement
}): void {
  resetRng()

  // ─── V — hand-written Vanilla, copied from impl/vanilla.ts `renderAll` ────
  function vanillaRenderAll(newRows: PlainRow[]) {
    hosts.vanilla.innerHTML = ''
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i] as PlainRow
      const tr = document.createElement('tr')
      const td1 = document.createElement('td')
      const td2 = document.createElement('td')
      ;(td1 as unknown as NumericText).textContent = row.id
      td2.textContent = row.label
      tr.appendChild(td1)
      tr.appendChild(td2)
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    hosts.vanilla.appendChild(table)
  }

  // ─── L1 — <For> + template + static sets. No subscription, no cleanup. ───
  const l1Rows = signal<PlainRow[]>([])
  mount(
    <table>
      <tbody>
        <For each={l1Rows} by={(r: PlainRow) => r.id}>
          {(r: PlainRow) => (
            <tr>
              <td>{r.id}</td>
              <td>{r.label}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    hosts.l1,
  )

  // ─── L2 — adds the per-row label binding (_bindText + one disposer) ───────
  const l2Rows = signal<SigRow[]>([])
  mount(
    <table>
      <tbody>
        <For each={l2Rows} by={(r: SigRow) => r.id}>
          {(r: SigRow) => (
            <tr>
              <td>{r.id}</td>
              <td>{() => r.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    hosts.l2,
  )

  // ─── L3 — adds the selector class binding. IDENTICAL to impl/pyreon.tsx. ──
  const l3Rows = signal<SigRow[]>([])
  const selectedId = signal<number | null>(null)
  const isSelected = createSelector(selectedId)
  mount(
    <table>
      <tbody>
        <For each={l3Rows} by={(r: SigRow) => r.id}>
          {(r: SigRow) => (
            <tr class={() => (isSelected(r.id) ? 'selected' : '')}>
              <td>{r.id}</td>
              <td>{() => r.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    hosts.l3,
  )

  const mkSigRows = (n: number) =>
    buildRowsWith<SigRow>(n, (id, label) => ({ id, label: signal(label) }))

  // Prebuilt buffers let the `commit` drivers exclude construction without
  // re-timing it. One per arm so an arm's commit never consumes another's rows.
  let pV: PlainRow[] = []
  let p1: PlainRow[] = []
  let p2: SigRow[] = []
  let p3: SigRow[] = []

  // Named function statements so a CPU profile can key subtree attribution on a
  // stable functionName, matching profile-create.tsx's convention.
  function __vBuild(n: number) {
    pV = buildRows(n)
  }
  /**
   * Vanilla-shaped rows built through the SAME helper the reactive arms use.
   *
   * `buildRows` uses `Array.from({length}, …)` and `buildRowsWith` a
   * preallocated `new Array(n)` + loop — so a raw `l3/build - vanilla/build`
   * delta prices the per-row `signal()` PLUS that allocator difference, and the
   * loop is the faster of the two, which would UNDERSTATE the signal cost.
   * This driver isolates the two: signal() = l3/build - vanillaLoop/build, and
   * the helper difference = vanilla/build - vanillaLoop/build.
   */
  function __vBuildLoop(n: number) {
    pV = buildRowsWith<PlainRow>(n, (id, label) => ({ id, label }))
  }
  function __vCommit() {
    vanillaRenderAll(pV)
  }
  function __vCreate(n: number) {
    vanillaRenderAll(buildRows(n))
  }
  function __vClear() {
    vanillaRenderAll([])
  }

  function __l1Build(n: number) {
    p1 = buildRows(n)
  }
  function __l1Commit() {
    l1Rows.set(p1)
  }
  function __l1Create(n: number) {
    l1Rows.set(buildRows(n))
  }
  function __l1Clear() {
    l1Rows.set([])
  }

  function __l2Build(n: number) {
    p2 = mkSigRows(n)
  }
  function __l2Commit() {
    l2Rows.set(p2)
  }
  function __l2Create(n: number) {
    l2Rows.set(mkSigRows(n))
  }
  function __l2Clear() {
    l2Rows.set([])
  }

  function __l3Build(n: number) {
    p3 = mkSigRows(n)
  }
  function __l3Commit() {
    l3Rows.set(p3)
  }
  function __l3Create(n: number) {
    l3Rows.set(mkSigRows(n))
  }
  function __l3Clear() {
    l3Rows.set([])
  }

  const count = (h: HTMLElement) => h.querySelectorAll('tr').length

  ;(globalThis as Record<string, unknown>).__decompBench = {
    vanilla: {
      build: __vBuild,
      buildLoop: __vBuildLoop,
      commit: __vCommit,
      create: __vCreate,
      clear: __vClear,
      rowCount: () => count(hosts.vanilla),
    },
    l1: {
      build: __l1Build,
      commit: __l1Commit,
      create: __l1Create,
      clear: __l1Clear,
      rowCount: () => count(hosts.l1),
    },
    l2: {
      build: __l2Build,
      commit: __l2Commit,
      create: __l2Create,
      clear: __l2Clear,
      rowCount: () => count(hosts.l2),
    },
    l3: {
      build: __l3Build,
      commit: __l3Commit,
      create: __l3Create,
      clear: __l3Clear,
      rowCount: () => count(hosts.l3),
    },
  }
}
