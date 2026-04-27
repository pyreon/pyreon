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
  // Dev-mode gate via bare `process.env.NODE_ENV !== 'production'` — the
  // bundler-agnostic library convention. Used by React, Vue, Preact, Solid,
  // MobX, Redux, and every other major published JS library.
  //
  // **Why this pattern, not `import.meta.env.DEV`** (the previous reference
  // implementation): `import.meta.env.DEV` is Vite/Rolldown-only. In a Pyreon
  // library shipped to a Next.js (Webpack), esbuild, Rollup, Parcel, or Bun
  // app, `import.meta.env.DEV` is `undefined` and dev warnings never fire —
  // even in development. PR #200 introduced `import.meta.env.DEV` to fix the
  // broken `typeof process` compound; that direction was right for app code
  // but wrong for library code.
  //
  // **Why this pattern, not `typeof process !== 'undefined' && ...`** (the
  // first broken pattern): the `typeof process` guard isn't replaced by Vite,
  // evaluates to `false` in the browser, and the whole expression is dead
  // code in Vite browser bundles. Wrapped warnings never fire for users.
  //
  // **How bare `process.env.NODE_ENV` works across bundlers**:
  //
  // - **Vite / Rolldown**: replace `process.env.NODE_ENV` with literal
  //   `"production"` or `"development"` at build time. Tree-shakes the
  //   dead branch in prod.
  // - **Webpack (Next.js)**: same — DefinePlugin replaces it by default.
  // - **esbuild**: same — `--define` is automatic for libraries.
  // - **Rollup**: same via `@rollup/plugin-replace` (standard library setup).
  // - **Parcel**: same — built-in env replacement.
  // - **Bun**: same — built-in `define`. Direct Bun execution also resolves
  //   it natively from the runtime env.
  // - **Node SSR direct**: real env var read at runtime.
  // - **vitest**: Vite-based, replaces it automatically, warnings fire in tests.
  //
  // Reference for future dev-mode warnings — keep this comment in sync if the
  // pattern ever changes. Enforced by `@pyreon/lint`'s `pyreon/no-process-dev-gate`
  // rule which flags both `typeof process` compounds and `import.meta.env.DEV`.
  if (process.env.NODE_ENV === 'production') return

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
