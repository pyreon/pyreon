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

function toElkGraph(
  nodes: FlowNode[],
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
export async function computeLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  algorithm: LayoutAlgorithm = 'layered',
  options: LayoutOptions = {},
): Promise<Array<{ id: string; position: { x: number; y: number } }>> {
  const elk = await getELK()
  const graph = toElkGraph(nodes, edges, algorithm, options)
  const result: ElkResult = await elk.layout(graph)

  return (result.children ?? []).map((child) => ({
    id: child.id,
    position: { x: child.x ?? 0, y: child.y ?? 0 },
  }))
}
