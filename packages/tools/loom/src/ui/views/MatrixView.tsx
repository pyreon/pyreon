/**
 * The matrix view, two readings over the same scan:
 *
 *  - `versions` (default, the design's matrix): rows are EXTERNAL
 *    dependencies, columns the packages declaring them, cells the declared
 *    range. Drift is coloured — cross-major red, same-major amber — on the
 *    declarations that disagree with the usual range; phantom imports and
 *    unused declarations are marked in place. "drift only" narrows the rows to
 *    the externals with a `version-drift` finding.
 *  - `imports`: the internal adjacency DSM — rows depend on columns,
 *    foundations first, so a mark above the diagonal is a back-edge.
 *
 * Performance shape (why this is plain DOM + global classes, not rocketstyle
 * components — see `global-css.ts`): both grids render only the cells that
 * EXIST, each placed by `grid-area` (the empty cells' dot and hairlines are
 * one background), and each is built once per row/id set. Selection is one
 * reactive `<style>` (bands + lit header), so a selection change rewrites a
 * single text node.
 */
import { cx, type VNode, type VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { shortName, versionMatrix, type ObservatoryModel, type VersionMatrix } from '../model'
import { matrixIds, matrixSelectionCss, versionSelectionCss } from '../selection-css'

export function MatrixView(props: { model: ObservatoryModel }) {
  const m = props.model
  return () =>
    m.matrixMode() === 'versions' ? <VersionGrid model={m} /> : <ImportGrid model={m} />
}

function VersionGrid(props: { model: ObservatoryModel }) {
  const m = props.model
  const depthOf = (id: string) => m.byId.get(id)?.depth ?? 0
  const vm = computed(() => versionMatrix(m.report, depthOf, m.driftOnly()))
  const colName = (u: string) => (u === 'ROOT' ? '(root)' : shortName(u))

  const build = (x: VersionMatrix): VNode => {
    if (x.rows.length === 0) {
      return (
        <div class="lm-pk-empty" data-testid="matrix-empty">
          {m.driftOnly()
            ? 'Every external dependency is declared with one range across the workspace — no drift. Turn off “drift only” to see every declaration.'
            : 'This workspace declares no external dependencies.'}
        </div>
      )
    }
    const ci = new Map(x.cols.map((c, i) => [c, i]))
    const children: VNodeChild[] = [<div class="lm-vm-corner">external dependency</div>]
    x.cols.forEach((u, i) => {
      children.push(
        <div class={cx(['lm-vm-ch', `lm-vc${i}`])} style={`grid-column:${i + 2}`}>
          <button type="button" title={u} onClick={() => m.byId.has(u) && m.select(u)}>
            {colName(u)}
          </button>
        </div>,
      )
    })
    x.rows.forEach((row, r) => {
      children.push(
        <div class={cx(['lm-vm-rl', `lm-vr${r}`])} style={`grid-row:${r + 2}`}>
          <button type="button" title={row.dep} onClick={() => m.select(row.dep)}>
            {row.dep}
          </button>
          <small>{row.use}</small>
        </div>,
      )
      for (const [user, cell] of row.cells) {
        const c = ci.get(user)!
        const text = cell.note === 'unused' ? `${cell.text} · unused` : cell.text
        children.push(
          <span
            class={cx(['lm-vm-c', cell.tone && `lm-vm-c--${cell.tone}`])}
            style={`grid-area:${r + 2}/${c + 2}`}
            title={`${colName(user)} → ${row.dep}: ${text}`}
            data-cell={`${user}|${row.dep}`}
          >
            {cell.note === 'phantom' ? '— phantom' : text}
          </span>,
        )
      }
    })
    children.push(<div class="lm-vm-band lm-vm-bandc" />, <div class="lm-vm-band lm-vm-bandr" />)
    return (
      <div
        class="lm-vm"
        data-testid="version-grid"
        style={`--lm-n:${x.cols.length};--lm-r:${x.rows.length}`}
      >
        {children}
      </div>
    )
  }

  return (
    <div class="lm-mxwrap" data-testid="matrix-view">
      <style>
        {() =>
          versionSelectionCss(
            vm().cols,
            vm().rows.map((r) => r.dep),
            m.selId(),
          )
        }
      </style>
      <div class="lm-mxnote">
        {() =>
          `${vm().rows.length} external ${vm().rows.length === 1 ? 'dependency' : 'dependencies'} × ${vm().cols.length} declaring packages · a coloured range disagrees with the usual one · · = not declared`
        }
      </div>
      {() => build(vm())}
    </div>
  )
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

function ImportGrid(props: { model: ObservatoryModel }) {
  const m = props.model
  const ids = computed(() => matrixIds(m), { equals: sameIds })

  const build = (list: string[]) => {
    if (list.length === 0) {
      return (
        <div class="lm-pk-empty" data-testid="matrix-empty">
          This workspace has no internal packages to relate.
        </div>
      )
    }
    const index = new Map(list.map((id, i) => [id, i]))
    const depthOf = (id: string) => m.byId.get(id)?.depth ?? 0
    const children: VNodeChild[] = [
      <div class="lm-mx-corner" />,
      <div class="lm-mx-band lm-mx-bandr" />,
      <div class="lm-mx-band lm-mx-bandc" />,
    ]
    list.forEach((id, i) => {
      const name = shortName(id)
      children.push(
        <div class={cx(['lm-mx-ch', `lm-cl${i}`])} style={`grid-column:${i + 2}`} title={id}>
          <span>{name}</span>
        </div>,
        <button
          type="button"
          class={cx(['lm-mx-rl', `lm-rl${i}`])}
          style={`grid-row:${i + 2}`}
          title={id}
          onClick={() => m.select(id)}
        >
          {name}
        </button>,
        <span class="lm-mx-d" style={`grid-area:${i + 2}/${i + 2}`} />,
      )
    })
    for (const r of list) {
      const ri = index.get(r)!
      for (const c of m.byId.get(r)?.deps ?? []) {
        const ci = index.get(c)
        if (ci === undefined) continue
        const back = depthOf(c) <= depthOf(r) && m.cycleNodes.has(r) && m.cycleNodes.has(c)
        // A real <button> per edge cell: keyboard-reachable. Empty cells are
        // not rendered at all.
        children.push(
          <button
            type="button"
            class={cx(['lm-mx-c', `lm-r${ri}`, `lm-c${ci}`, back && 'lm-back'])}
            style={`grid-area:${ri + 2}/${ci + 2}`}
            title={`${r} → ${c}`}
            aria-label={`${r} depends on ${c}`}
            onClick={() => m.select(c)}
          />,
        )
      }
    }
    return (
      <div
        class="lm-mx"
        data-testid="matrix-grid"
        style={`--lm-n:${list.length}`}
        data-cyc={() => (m.showCycles() ? 'on' : 'off')}
      >
        {children}
      </div>
    )
  }

  return (
    <div class="lm-mxwrap" data-testid="matrix-view">
      <style>{() => matrixSelectionCss(ids(), m.selId())}</style>
      <div class="lm-mxnote">
        {`rows depend on columns · ${m.report.stats.edges} edges · foundations first — marks above the diagonal are back-edges · scope prefix stripped`}
      </div>
      {() => build(ids())}
    </div>
  )
}
