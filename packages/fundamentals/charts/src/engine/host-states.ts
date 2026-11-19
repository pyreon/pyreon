// Item states for a canvas host: hover emphasis and persistent selection, as a WRAPPER over a host spec.
//
// It is a wrapper, not code inside `canvasHost`, on purpose: the host is shared by every non-cartesian family, and
// anything it carried would be paid by a pie that never selects anything. A family that wants states passes its spec
// through `withItemStates` (the map does); the others never import this file, and the host is byte-for-byte what it was.
//
// The seams it uses are the ones the host already has:
//   - the pointer moves and leaves reach it through the spec's `tooltip` / `leave` hooks (a state-aware family gets
//     the host's tooltip surface; it answers null unless the app asked for a tooltip),
//   - a click arrives at `select` and Enter / Space at `pick`, so the pointer and the keyboard run one code path,
//   - a repaint is the draw effect re-running on a signal `track` reads, and a hover is not a data update, so the
//     update tween is switched off for exactly that run,
//   - the selection is spoken through the canvas description (`describe`) and the accessible table's row names
//     ("North (selected)"), which is also what the keyboard's live region announces.
//
// A family adopts it by reporting `states.at` (the item index under a point, in the accessible table's row space) and
// `states.label`, and by painting `states` from the extra argument of its `render`. Pie (slices), treemap (cells) and
// sankey (nodes) can do the same; none does yet.

import { signal, untrack } from '@pyreon/reactivity'
import { describeChart } from './a11y'
import type { A11yInput } from './a11y'
import type { CanvasHostProps, CanvasHostSpec } from './canvas-host'
import type { ChartTheme } from './render'
import type { Double, DrawCmd, MeasureText } from './types'

/** The state of a host's items: what hover emphasis and selection paint. Item indices are the accessible table's row indices. */
export interface ItemStates {
  /** The item under the pointer, or -1. */
  hover: number
  /** The selected items, in selection order. */
  selected: readonly number[]
}

/** The props a state-aware family adds to the host's. */
export interface ItemStateProps {
  /** Hover emphasis: the item under the pointer is outlined. Default on; `false` turns it off. */
  emphasis?: boolean | undefined
  /** Persistent selection: a click (or Enter / Space on the focused item) selects; `'single'` replaces, `'multiple'` toggles. Off by default. */
  selectedMode?: false | 'single' | 'multiple' | undefined
  /** Fired with the selected item indices (the accessible table's rows) whenever the selection changes. */
  onSelectionChange?: ((indices: number[]) => void) | undefined
}

export interface StatefulHostSpec<L> extends Omit<CanvasHostSpec<L>, 'props' | 'render'> {
  props: CanvasHostProps & ItemStateProps
  /** `render`, with the current item states. */
  render: (layout: L, measure: MeasureText, theme: ChartTheme, progress: Double, time: Double, states: ItemStates) => DrawCmd[]
  /** Which item is under a point (the accessible table's row index, -1 for none) and what it is called. */
  states: {
    at: (layout: L, px: Double, py: Double) => number
    label: (layout: L, index: number) => string
  }
}

/** Wrap a family's spec so the host gives it hover emphasis and selection. */
export function withItemStates<L>(raw: StatefulHostSpec<L>): CanvasHostSpec<L> {
  const props = raw.props
  const hover = signal(-1)
  const selection = signal<readonly number[]>([])
  // The generation of the last state change, and whether the draw in flight is that change's repaint.
  let gen = 0
  let trackedGen = 0
  let snap = false
  const mode = (): false | 'single' | 'multiple' => props.selectedMode ?? false

  const setHover = (i: number): void => {
    if (i === untrack(hover)) return
    gen += 1
    hover.set(i)
  }
  const toggle = (i: number, layout: L): void => {
    const m = mode()
    if (m === false || i < 0 || i >= itemCount(layout)) return
    const cur = untrack(selection)
    const has = cur.includes(i)
    const next = m === 'single' ? (has ? [] : [i]) : has ? cur.filter((k) => k !== i) : [...cur, i]
    gen += 1
    selection.set(next)
    props.onSelectionChange?.([...next])
  }
  // The item count, from the accessible table the family already describes (rows are items).
  const itemCount = (layout: L): number => raw.a11y(layout).categories.length

  // The host reads `tooltip` and `updateAnimation` off its props: a state-aware family always has the pointer hooks
  // (the tooltip box stays hidden unless the app turned the tooltip on), and a repaint caused by a state change snaps.
  const hostProps = new Proxy(props, {
    get(target, key, receiver) {
      if (key === 'tooltip') return true
      if (key === 'updateAnimation' && snap) return false
      return Reflect.get(target, key, receiver)
    },
  })
  const withStateNames = (input: A11yInput): A11yInput => {
    const chosen = untrack(selection)
    if (chosen.length === 0) return input

    return { ...input, categories: input.categories.map((c, i) => (chosen.includes(i) ? `${c} (selected)` : c)) }
  }

  return {
    ...raw,
    props: hostProps,
    track: () => {
      raw.track()
      hover()
      selection()
      snap = gen !== trackedGen
      trackedGen = gen
    },
    render: (layout, measure, theme, progress, time) =>
      raw.render(layout, measure, theme, progress, time, { hover: props.emphasis === false ? -1 : untrack(hover), selected: untrack(selection) }),
    tooltip: (layout, px, py, theme, press) => {
      setHover(raw.states.at(layout, px, py))

      return props.tooltip === true && raw.tooltip !== undefined ? raw.tooltip(layout, px, py, theme, press) : null
    },
    leave: () => {
      setHover(-1)
      raw.leave?.()
    },
    select: (layout, px, py) => {
      toggle(raw.states.at(layout, px, py), layout)
      raw.select?.(layout, px, py)
    },
    pick: (layout, i) => {
      toggle(i, layout)
      raw.pick?.(layout, i)
    },
    a11y: (layout) => withStateNames(raw.a11y(layout)),
    describe: (layout) => {
      const base = raw.describe !== undefined ? raw.describe(layout) : describeChart(raw.a11y(layout))
      const chosen = selection()

      return chosen.length === 0 ? base : `${base} Selected: ${chosen.map((i) => raw.states.label(layout, i)).join(', ')}.`
    },
  }
}

