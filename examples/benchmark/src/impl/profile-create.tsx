/**
 * Create-path profiling target — the instrument behind "where does Pyreon's
 * residual gap to hand-written Vanilla DOM actually go on create?".
 *
 * Mounts the EXACT markup `impl/pyreon.tsx` benches (same `For` + per-row label
 * signal + `createSelector` class binding) alongside a hand-written Vanilla
 * builder copied line-for-line from `impl/vanilla.ts`, and exposes NAMED driver
 * functions on `globalThis` so `bench-createprofile.ts` can attribute CPU-profile
 * samples to one op by walking the subtree under a stable `functionName`.
 *
 * The drivers DECOMPOSE the timed region rather than just mirroring it, because
 * the two arms are not doing the same work: the benched Pyreon create is
 * `rows.set(mkRows(n))`, and `mkRows` allocates a `signal()` PER ROW that the
 * Vanilla arm never pays. Attributing that to "framework mount overhead" would
 * be wrong. So each arm splits into:
 *
 *   - `__build`  — row construction only (Pyreon: n signals; Vanilla: n plain objects)
 *   - `__commit` — the DOM-producing half, driven from PRE-BUILT rows
 *   - `__create` — build + commit, i.e. exactly what the fair bench times
 *
 * `__create` is NOT the sum of the other two — it is measured independently so
 * the decomposition can be checked against the thing it claims to explain.
 *
 * NOT part of the timed fair bench — measurement scaffolding only, loaded
 * exclusively behind `?profileCreate=1`.
 */
import { For } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { Row } from '../runner'

/**
 * Assign the raw number and let the WebIDL binding coerce it, instead of
 * stringifying in JS — a JS-side Number->String of many DISTINCT integers
 * grows a V8 engine cache that is held from the GC root set and lands in
 * usedJSHeapSize. Declared locally so this profiling entry does not depend
 * on an unmerged PR; the shared `NumericText` in runner.ts is the same
 * shape and this can collapse onto it once that lands.
 */
type NumericText = { textContent: number }
import { buildRows, buildRowsWith, resetRng } from '../runner'

type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }

export function setupCreateProfile(pyreonHost: HTMLElement, vanillaHost: HTMLElement): void {
  resetRng()

  // ─── Pyreon arm — byte-for-byte the markup impl/pyreon.tsx benches ────────
  const rows = signal<ReactiveRow[]>([])
  const selectedId = signal<number | null>(null)
  const isSelected = createSelector(selectedId)

  mount(
    <table>
      <tbody>
        <For each={rows} by={(row: ReactiveRow) => row.id}>
          {(row: ReactiveRow) => (
            <tr class={() => (isSelected(row.id) ? 'selected' : '')}>
              {/* raw number — mirrors impl/pyreon.tsx exactly */}
              <td>{row.id}</td>
              <td>{() => row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    pyreonHost,
  )

  const mkRows = (n: number) =>
    buildRowsWith<ReactiveRow>(n, (id, label) => ({ id, label: signal(label) }))

  // ─── Vanilla arm — copied from impl/vanilla.ts `renderAll` ────────────────
  let vRows: Row[] = []

  function vanillaRenderAll(newRows: Row[]) {
    vRows = newRows
    vanillaHost.innerHTML = ''
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')

    for (let i = 0; i < vRows.length; i++) {
      const row = vRows[i] as Row
      const tr = document.createElement('tr')
      const td1 = document.createElement('td')
      const td2 = document.createElement('td')
      // raw number — see runner.ts "Row-id rendering rule"
      ;(td1 as unknown as NumericText).textContent = row.id
      td2.textContent = row.label
      tr.appendChild(td1)
      tr.appendChild(td2)
      tbody.appendChild(tr)
    }

    table.appendChild(tbody)
    vanillaHost.appendChild(table)
  }

  // NAMED function statements so profile nodes carry stable functionNames the
  // driver can key subtree attribution on. Prebuilt row buffers let the
  // `__commit` drivers exclude construction without re-timing it.
  let pyreonPrebuilt: ReactiveRow[] = []
  let vanillaPrebuilt: Row[] = []

  function __pyreonBuild(n: number): void {
    pyreonPrebuilt = mkRows(n)
  }
  function __pyreonCommit(): void {
    rows.set(pyreonPrebuilt)
  }
  function __pyreonCreate(n: number): void {
    rows.set(mkRows(n))
  }
  function __pyreonClear(): void {
    rows.set([])
  }

  function __vanillaBuild(n: number): void {
    vanillaPrebuilt = buildRows(n)
  }
  function __vanillaCommit(): void {
    vanillaRenderAll(vanillaPrebuilt)
  }
  function __vanillaCreate(n: number): void {
    vanillaRenderAll(buildRows(n))
  }
  function __vanillaClear(): void {
    vanillaRenderAll([])
  }

  ;(globalThis as Record<string, unknown>).__createBench = {
    pyreon: {
      build: __pyreonBuild,
      commit: __pyreonCommit,
      create: __pyreonCreate,
      clear: __pyreonClear,
      rowCount: () => pyreonHost.querySelectorAll('tr').length,
    },
    vanilla: {
      build: __vanillaBuild,
      commit: __vanillaCommit,
      create: __vanillaCreate,
      clear: __vanillaClear,
      rowCount: () => vanillaHost.querySelectorAll('tr').length,
    },
  }
}
