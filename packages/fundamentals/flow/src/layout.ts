import type { FlowEdge, FlowNode, LayoutAlgorithm, LayoutOptions } from './types'

// ─── ELK algorithm mapping ───────────────────────────────────────────────────

const ELK_ALGORITHMS: Record<LayoutAlgorithm, string> = {
  layered: 'org.eclipse.elk.layered',
  force: 'org.eclipse.elk.force',
  stress: 'org.eclipse.elk.stress',
  tree: 'org.eclipse.elk.mrtree',
  radial: 'org.eclipse.elk.radial',
  box: 'org.eclipse.elk.box',
  rectpacking: 'org.eclipse.elk.rectpacking',
}

const ELK_DIRECTIONS: Record<string, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
}

// ─── Algorithm-specific option applicability ─────────────────────────────────
//
// ELK options are namespaced under specific algorithms — passing
// `elk.direction` to a force layout, for example, has zero effect.
// The truth table below was verified empirically by running each
// algorithm twice with two different values for the option and
// checking whether the resulting node positions differ. The probe
// script lives in the PR description for the catalog item that
// added this table.
//
// Used by `warnIgnoredOptions` (dev mode only) to surface "you set
// this and it did nothing" mistakes that would otherwise be silent.
const DIRECTION_ALGORITHMS = new Set<LayoutAlgorithm>(['layered', 'tree'])
const LAYER_SPACING_ALGORITHMS = new Set<LayoutAlgorithm>(['layered'])
const EDGE_ROUTING_ALGORITHMS = new Set<LayoutAlgorithm>(['layered'])

function warnIgnoredOptions(algorithm: LayoutAlgorithm, options: LayoutOptions): void {
  // Dev-mode gate via `import.meta.env.DEV` — the Vite/Rolldown standard.
  //
  // - **Vite browser dev** build: literal-replaced with `true` →
  //   `!true` is `false` → falls through → warning fires.
  // - **Vite browser prod** build (minified): literal-replaced with
  //   `false` → `!false` is `true` → returns. esbuild's minifier
  //   then proves the rest of the function body is unreachable and
  //   tree-shakes it to **zero bytes**. Verified empirically by
  //   feeding this file to esbuild with the same defines Vite uses
  //   (`'import.meta.env.DEV': 'false'`, `minify: true`,
  //   `treeShaking: true`) and inspecting the output bundle — the
  //   warning function disappears entirely from prod output.
  // - **vitest**: vitest is Vite-based and sets
  //   `import.meta.env.DEV === true` automatically, so the warning
  //   fires in the regression tests below without any extra setup.
  //
  // Why NOT `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
  // (the pattern used by `runtime-dom/src/transition.ts` and other
  // files in this codebase): in a real Vite browser bundle, `process`
  // is `undefined` (Vite does not polyfill it by default), so the
  // guard is `false` and the warning is dead code WHERE USERS
  // ACTUALLY HIT THE BUG. The codebase-wide pattern bug is tracked
  // separately as a catalog finding — this file is the reference
  // implementation for future dev-mode warnings.
  // @ts-ignore — `import.meta.env.DEV` is provided by Vite/Rolldown
  // at build time, not in the standard ImportMeta lib types.
  if (!import.meta.env?.DEV) return

  if (options.direction !== undefined && !DIRECTION_ALGORITHMS.has(algorithm)) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow.layout: \`direction\` is silently ignored by the \`${algorithm}\` algorithm. ` +
        `It applies to \`layered\` and \`tree\` only — switch the algorithm or remove the option to silence this warning.`,
    )
  }
  if (options.layerSpacing !== undefined && !LAYER_SPACING_ALGORITHMS.has(algorithm)) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow.layout: \`layerSpacing\` is silently ignored by the \`${algorithm}\` algorithm. ` +
        `It applies to \`layered\` only — use \`nodeSpacing\` for general spacing or switch to \`layered\`.`,
    )
  }
  if (options.edgeRouting !== undefined && !EDGE_ROUTING_ALGORITHMS.has(algorithm)) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow.layout: \`edgeRouting\` is silently ignored by the \`${algorithm}\` algorithm. ` +
        `It applies to \`layered\` only — switch to \`layered\` or remove the option to silence this warning.`,
    )
  }
}

// ─── Lazy-loaded ELK instance ────────────────────────────────────────────────

let elkInstance: any = null
let elkPromise: Promise<any> | null = null

async function getELK(): Promise<any> {
  if (elkInstance) return elkInstance
  if (elkPromise) return elkPromise

  elkPromise = import('elkjs/lib/elk.bundled.js').then((mod) => {
    const ELK = mod.default || mod
    elkInstance = new ELK()
    return elkInstance
  })

  return elkPromise
}

// ─── Convert flow graph to ELK format ────────────────────────────────────────

interface ElkNode {
  id: string
  width: number
  height: number
}

interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
}

interface ElkGraph {
  id: string
  layoutOptions: Record<string, string>
  children: ElkNode[]
  edges: ElkEdge[]
}

interface ElkResult {
  children: Array<{ id: string; x: number; y: number }>
}

function toElkGraph<TData>(
  nodes: FlowNode<TData>[],
  edges: FlowEdge[],
  algorithm: LayoutAlgorithm,
  options: LayoutOptions,
): ElkGraph {
  const layoutOptions: Record<string, string> = {
    'elk.algorithm': ELK_ALGORITHMS[algorithm] ?? ELK_ALGORITHMS.layered,
  }

  if (options.direction) {
    layoutOptions['elk.direction'] = ELK_DIRECTIONS[options.direction] ?? 'DOWN'
  }

  if (options.nodeSpacing !== undefined) {
    layoutOptions['elk.spacing.nodeNode'] = String(options.nodeSpacing)
  }

  if (options.layerSpacing !== undefined) {
    layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(options.layerSpacing)
  }

  if (options.edgeRouting) {
    const routingMap: Record<string, string> = {
      orthogonal: 'ORTHOGONAL',
      splines: 'SPLINES',
      polyline: 'POLYLINE',
    }
    layoutOptions['elk.edgeRouting'] = routingMap[options.edgeRouting] ?? 'ORTHOGONAL'
  }

  return {
    id: 'root',
    layoutOptions,
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? 150,
      height: node.height ?? 40,
    })),
    edges: edges.map((edge, i) => ({
      id: edge.id ?? `e-${i}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute a layout for the given nodes and edges using elkjs.
 * Returns an array of { id, position } for each node.
 *
 * elkjs is lazy-loaded — zero bundle cost until this function is called.
 *
 * **Algorithm-specific options**: not every option in `LayoutOptions`
 * applies to every algorithm. `direction` and `layerSpacing` are
 * namespaced under ELK's layered/tree pipelines and are silently
 * ignored by `force`, `stress`, `radial`, `box`, and `rectpacking`.
 * See the JSDoc on each `LayoutOptions` field for the exact
 * applicability rules.
 *
 * @example
 * ```ts
 * const positions = await computeLayout(nodes, edges, 'layered', {
 *   direction: 'RIGHT',
 *   nodeSpacing: 50,
 *   layerSpacing: 100,
 * })
 * // positions: [{ id: '1', position: { x: 0, y: 0 } }, ...]
 * ```
 */
export async function computeLayout<TData = Record<string, unknown>>(
  nodes: FlowNode<TData>[],
  edges: FlowEdge[],
  algorithm: LayoutAlgorithm = 'layered',
  options: LayoutOptions = {},
): Promise<Array<{ id: string; position: { x: number; y: number } }>> {
  warnIgnoredOptions(algorithm, options)
  const elk = await getELK()
  const graph = toElkGraph(nodes, edges, algorithm, options)
  const result: ElkResult = await elk.layout(graph)

  return (result.children ?? []).map((child) => ({
    id: child.id,
    position: { x: child.x ?? 0, y: child.y ?? 0 },
  }))
}
