import { For, useContext, type VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { getEffectiveDimensions } from '../edges'
import type { FlowInstance, FlowNode, MiniMapProps } from '../types'
import { FlowContext } from './flow-context'

const MINIMAP_PADDING = 40

/**
 * Miniature overview of the flow diagram showing all nodes
 * and the current viewport position. Click to navigate.
 *
 * @remarks
 * Sibling order vs `<Controls>` no longer matters on current
 * `@pyreon/compiler` versions (the template ref-hoist fix). On OLDER
 * compilers, place `<MiniMap>` FIRST — a `<Controls>` mounted before a
 * sibling `<MiniMap>` silently failed to render (a compiler
 * slot-ordering bug, since fixed). See `<Controls>` and
 * `.claude/rules/anti-patterns.md` → "Flow overlay child order".
 *
 * @example
 * ```tsx
 * <Flow instance={flow}>
 *   <MiniMap nodeColor={(n) => n.type === 'error' ? 'red' : '#ddd'} />
 *   <Controls />
 * </Flow>
 * ```
 */
export function MiniMap(props: MiniMapProps & { instance?: FlowInstance }): VNodeChild {
  // Resolve the instance from an explicit prop, else the <Flow> context.
  const instance = props.instance ?? useContext(FlowContext)
  if (!instance) return null

  // The minimap is mounted STATICALLY and patched in place (P4 — the P0
  // viewport-div shape). It used to be ONE reactive accessor that read
  // `nodes()` + `measurements()` + `viewport()` + `containerSize()` at its top
  // and returned the whole `<div><svg>…` subtree — so EVERY pan/zoom frame
  // tore down and re-created the full svg (measured: ~306 element creations
  // PER viewport write at 300 nodes). Now:
  //   • node `<rect>`s are keyed `<For>` rows whose attr thunks read the
  //     per-id `_nodeById` computed — a node drag patches ITS rect only;
  //   • the viewport indicator `<rect>` patches on pan/zoom;
  //   • a pan/zoom frame touches NOTHING else (bounds don't depend on the
  //     viewport).
  //
  // Props are read INSIDE thunks (components run once — a body-scope
  // destructure would freeze a signal-driven `width`/`nodeColor`; same reason
  // the old accessor destructured per run).
  const widthOf = (): number => props.width ?? 200
  const heightOf = (): number => props.height ?? 150
  const maskColorOf = (): string =>
    props.maskColor ?? 'var(--pyreon-flow-minimap-mask, rgba(0, 0, 0, 0.08))'
  const nodeColorOf = (node: FlowNode<any>): string => {
    const c = props.nodeColor ?? 'var(--pyreon-flow-minimap-node, #e2e8f0)'
    return typeof c === 'function' ? c(node) : c
  }

  // Graph bounds + minimap scale — depends on nodes/measurements/size props
  // ONLY (NOT the viewport), and is equality-gated on its numeric fields so a
  // drag that doesn't move the graph's bounding box re-notifies nothing
  // downstream (only the dragged node's own rect patches, via `_nodeById`).
  //
  // `let`, not `const` (oxlint-disable below): `computed()` is a STATEFUL
  // factory, and the compiler's reactive-props inlining re-invokes a
  // prop-derived `const` initializer at every JSX use site — which would mint
  // a DISCONNECTED computed per thunk (the documented inlining footgun).
  // `let` bindings are skipped by the inliner.
  // oxlint-disable-next-line prefer-const
  let bounds = computed(
    () => {
      const nodes = instance.nodes()
      const measured = instance.measurements()
      const width = widthOf()
      const height = heightOf()
      if (nodes.length === 0) return { empty: true, minX: 0, minY: 0, scale: 1 }

      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (const node of nodes) {
        const { width: w, height: h } = getEffectiveDimensions(node, measured.get(node.id))
        minX = Math.min(minX, node.position.x)
        minY = Math.min(minY, node.position.y)
        maxX = Math.max(maxX, node.position.x + w)
        maxY = Math.max(maxY, node.position.y + h)
      }
      const graphW = maxX - minX + MINIMAP_PADDING * 2
      const graphH = maxY - minY + MINIMAP_PADDING * 2
      const scale = Math.min(width / graphW, height / graphH)
      return { empty: false, minX, minY, scale }
    },
    {
      equals: (a, b) =>
        a.empty === b.empty && a.minX === b.minX && a.minY === b.minY && a.scale === b.scale,
    },
  )

  // Viewport indicator box in minimap coordinates — pan/zoom re-runs ONLY the
  // indicator's attr thunks. Plain accessor (cheap math), no per-call state.
  const vpBox = (): { left: number; top: number; w: number; h: number } => {
    const b = bounds()
    const vp = instance.viewport()
    const cs = instance.containerSize()
    return {
      left: (-vp.x / vp.zoom - b.minX + MINIMAP_PADDING) * b.scale,
      top: (-vp.y / vp.zoom - b.minY + MINIMAP_PADDING) * b.scale,
      w: (cs.width / vp.zoom) * b.scale,
      h: (cs.height / vp.zoom) * b.scale,
    }
  }

  const handleClick = (e: MouseEvent): void => {
    const b = bounds() // event handler — untracked read
    if (b.empty) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const flowX = (e.clientX - rect.left) / b.scale + b.minX - MINIMAP_PADDING
    const flowY = (e.clientY - rect.top) / b.scale + b.minY - MINIMAP_PADDING

    // Center viewport on clicked point
    const vp = instance.viewport.peek()
    const cs = instance.containerSize.peek()
    instance.viewport.set({
      ...vp,
      x: -(flowX * vp.zoom) + cs.width / 2,
      y: -(flowY * vp.zoom) + cs.height / 2,
    })
  }

  return (
    <div
      class="pyreon-flow-minimap"
      style={() =>
        `position: absolute; bottom: 10px; right: 10px; width: ${widthOf()}px; height: ${heightOf()}px; border: 1px solid var(--pyreon-flow-panel-border, #ddd); background: var(--pyreon-flow-panel-bg, #fff); border-radius: 4px; overflow: hidden; z-index: 5; cursor: pointer;`
      }
      onClick={handleClick}
    >
      <svg
        role="img"
        aria-label="minimap"
        width={() => String(widthOf())}
        height={() => String(heightOf())}
      >
        {/* Mask outside viewport */}
        <rect
          width={() => String(widthOf())}
          height={() => String(heightOf())}
          fill={() => maskColorOf()}
        />

        {/* Nodes — keyed rows mounted once per id; each rect's attr thunks
            read the per-id `_nodeById` computed + the equality-gated bounds,
            so a single-node drag patches one rect in place. The static <g>
            wrapper predates the compiler ref-hoist fix and stays (harmless). */}
        <g>
          <For each={() => instance.nodes()} by={(n: FlowNode<any>) => n.id}>
            {(initialNode: FlowNode<any>) => {
              const id = initialNode.id
              // `let` for the same inlining reason as `bounds` above.
              // oxlint-disable-next-line prefer-const
              let box = (): { x: number; y: number; w: number; h: number } => {
                const n = instance._nodeById(id)() ?? initialNode
                const b = bounds()
                const d = getEffectiveDimensions(n, instance.measurements().get(id))
                return {
                  x: (n.position.x - b.minX + MINIMAP_PADDING) * b.scale,
                  y: (n.position.y - b.minY + MINIMAP_PADDING) * b.scale,
                  w: d.width * b.scale,
                  h: d.height * b.scale,
                }
              }
              return (
                <rect
                  x={() => String(box().x)}
                  y={() => String(box().y)}
                  width={() => String(box().w)}
                  height={() => String(box().h)}
                  fill={() => nodeColorOf(instance._nodeById(id)() ?? initialNode)}
                  rx="2"
                />
              )
            }}
          </For>
        </g>

        {/* Viewport indicator — hidden while the graph is empty. */}
        <rect
          class="pyreon-flow-minimap-viewport"
          x={() => String(Math.max(0, vpBox().left))}
          y={() => String(Math.max(0, vpBox().top))}
          width={() => String(Math.min(vpBox().w, widthOf()))}
          height={() => String(Math.min(vpBox().h, heightOf()))}
          // stroke via `style`, not the presentation attr — `var()` is
          // INVALID in an SVG presentation attribute (dropped → stroke:none).
          style={() =>
            bounds().empty
              ? 'display: none;'
              : 'fill: none; stroke: var(--pyreon-flow-accent, #3b82f6); stroke-width: 1.5;'
          }
          rx="2"
        />
      </svg>
    </div>
  )
}
