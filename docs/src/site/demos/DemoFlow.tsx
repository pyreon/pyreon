import { onMount, onUnmount } from '@pyreon/core'
// This module IS the lazy chunk: registry.tools.ts loads it through island(() => import(…)).
// pyreon-lint-disable-next-line pyreon/no-eager-import
import { Background, Controls, Flow, flowStyles, useFlow } from '@pyreon/flow'
import type { FlowEdge, FlowNode, NodeComponentProps } from '@pyreon/flow'
import { signal } from '@pyreon/reactivity'
import { createGlobalStyle } from '@pyreon/styler'
import { font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { Pill } from '../kit/controls'

/**
 * The package's own stylesheet (hover, selection, focus rings, reduced
 * motion and the visually hidden keyboard instructions). Created when this
 * island's chunk loads, so only the flow page carries it. Without it the
 * screen-reader instructions paint over the canvas until #4342 (flow keeps
 * that text hidden on its own) merges.
 */
const FlowStyles = createGlobalStyle`${flowStyles}`

type Step = { label: string; kind: string }

/**
 * How many times a node component body has run, over the module's life. A
 * node mounts once per graph, so after the first seven runs this number
 * stays put however much the visitor drags, selects or lays out.
 */
const nodeBodyRuns = signal(0)

const NodeCard = el
  .config({ name: 'FlowDemoNode' })
  .attrs({ block: true, gap: 2 })
  .theme((_t, m) => ({
    position: 'relative',
    minWidth: 132,
    paddingTop: 9,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.control,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: tone(m, 'raised'),
    color: tone(m, 'text'),
    cursor: 'grab',
    userSelect: 'none',
  }))

const NodeKind = txt
  .config({ name: 'FlowDemoNodeKind' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const NodeLabel = txt
  .config({ name: 'FlowDemoNodeLabel' })
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: font.sans, fontSize: 14, whiteSpace: 'nowrap' }))

/**
 * The one custom node type. Its body runs once per node; everything after
 * that is the package patching in place. No `<Handle>`s: edges then meet the
 * node where the centre-to-centre line crosses its border, which reads right
 * in both the left-to-right and the top-down layout.
 */
function StepNode(props: NodeComponentProps<Step>) {
  nodeBodyRuns.update((n) => n + 1)
  return (
    <NodeCard data-flow-card="">
      <NodeKind>{() => props.data().kind}</NodeKind>
      <NodeLabel>{() => props.data().label}</NodeLabel>
    </NodeCard>
  )
}

const NODE_TYPES = { step: StepNode }
/** `flow.layout()`'s default animation length. */
const LAYOUT_TWEEN_MS = 300
/** Below this canvas width the graph is laid out top-down. */
const NARROW_PX = 560

const STEPS: readonly [string, string, string][] = [
  ['a', 'Webhook', 'trigger'],
  ['b', 'Validate', 'check'],
  ['c', 'Enrich', 'fetch'],
  ['d', 'Score lead', 'model'],
  ['e', 'CRM', 'write'],
  ['f', 'Slack alert', 'notify'],
  ['g', 'Archive', 'store'],
]
/** A deterministic "dropped by hand" start, so the server and the first client render agree. */
const START: Record<string, { x: number; y: number }> = {
  a: { x: 20, y: 150 },
  b: { x: 250, y: 40 },
  c: { x: 210, y: 270 },
  d: { x: 470, y: 180 },
  e: { x: 690, y: 40 },
  f: { x: 720, y: 300 },
  g: { x: 480, y: 360 },
}
const EDGES: FlowEdge[] = [
  ['a', 'b'],
  ['b', 'c'],
  ['b', 'g'],
  ['c', 'd'],
  ['d', 'e'],
  ['d', 'f'],
].map(([source, target]) => ({
  id: `${source}-${target}`,
  source: source ?? '',
  target: target ?? '',
}))

const initialNodes = (): FlowNode<Step>[] =>
  STEPS.map(([id, label, kind]) => ({
    id,
    type: 'step',
    position: START[id] ?? { x: 0, y: 0 },
    data: { label, kind },
    ariaLabel: `${label} (${kind})`,
  }))

const Bar = el
  .config({ name: 'FlowDemoBar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: { xs: 16, sm: 20 },
    paddingRight: { xs: 16, sm: 20 },
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const Counter = txt
  .config({ name: 'FlowDemoCounter' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginLeft: 'auto',
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'fog'),
    extendCss: '& b { font-weight: 500; font-variant-numeric: tabular-nums; }',
  }))

const CounterValue = txt
  .config({ name: 'FlowDemoCounterValue' })
  .attrs({ tag: 'b' })
  .theme((_t, m) => ({ color: tone(m, 'accentText') }))

const Hint = txt
  .config({ name: 'FlowDemoHint' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    paddingTop: 12,
    paddingBottom: 14,
    paddingLeft: { xs: 16, sm: 20 },
    paddingRight: { xs: 16, sm: 20 },
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.caption.size,
    lineHeight: text.caption.lineHeight,
    color: tone(m, 'fog'),
  }))

/**
 * The canvas box. The package reads every colour through a
 * `--pyreon-flow-*` variable; setting them here to the site's tokens makes
 * the diagram follow the page's theme (each token is itself a variable that
 * flips with `<html data-theme>`). `<Flow colorMode="light">` keeps the
 * package's own dark palette from overriding them.
 */
const Canvas = el
  .config({ name: 'FlowDemoCanvas' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    position: 'relative',
    height: { xs: 460, md: 440 },
    minWidth: 0,
    extendCss: `
      --pyreon-flow-node-color: ${tone(m, 'text')};
      --pyreon-flow-node-selected: ${tone(m, 'accent')};
      --pyreon-flow-selection-glow: ${tone(m, 'hotRing')};
      --pyreon-flow-edge: ${tone(m, 'accent')};
      --pyreon-flow-edge-label: ${tone(m, 'mist')};
      --pyreon-flow-accent: ${tone(m, 'focus')};
      --pyreon-flow-accent-bg: ${tone(m, 'currentFill')};
      --pyreon-flow-handle-bg: ${tone(m, 'accent')};
      --pyreon-flow-handle-border: ${tone(m, 'card')};
      --pyreon-flow-handle-valid: ${tone(m, 'ok')};
      --pyreon-flow-panel-bg: ${tone(m, 'card')};
      --pyreon-flow-panel-border: ${tone(m, 'line2')};
      --pyreon-flow-control-color: ${tone(m, 'text')};
      --pyreon-flow-control-muted: ${tone(m, 'fog')};
      --pyreon-flow-controls-hover: ${tone(m, 'raised')};
      --pyreon-flow-controls-active: ${tone(m, 'line')};
      --pyreon-flow-bg-pattern: ${tone(m, 'line2')};
      & .pyreon-flow { background: transparent; }
      & .pyreon-flow-edge-path { stroke-opacity: .75; }
      & .pyreon-flow-node.selected [data-flow-card] { border-color: ${tone(m, 'accent')}; box-shadow: 0 0 0 3px ${tone(m, 'currentFill')}; }
      & .pyreon-flow-node.dragging [data-flow-card] { cursor: grabbing; }
      & .pyreon-flow-node:focus-visible { outline-color: ${tone(m, 'focus')}; border-radius: ${radius.control}px; }
    `,
  }))

/**
 * Flow demo (`flow.json` → demo): a real `@pyreon/flow` instance
 * (`useFlow`) rendered by `<Flow>` with one custom node type. Nodes drag
 * with the pointer, or take focus and move with the arrow keys (the
 * package's own keyboard model). "Auto-layout" runs the built-in layered
 * engine on the measured node sizes (left to right; top-down in a
 * phone-width canvas); "Scramble" writes random positions
 * through `updateNodePosition`. The counter is the node component's own
 * body-run count since mount.
 */
export default function DemoFlow() {
  // maxZoom keeps a fitted seven-node graph from blowing up on a wide screen.
  const flow = useFlow<Step>({
    nodes: initialNodes(),
    edges: EDGES,
    fitViewPadding: 0.15,
    maxZoom: 1.5,
  })
  // 0 on the server and in the first client render; set once the nodes have mounted.
  const baseline = signal<number | null>(null)
  const reRuns = () => {
    const b = baseline()
    return b === null ? 0 : nodeBodyRuns() - b
  }

  let fitTimer: ReturnType<typeof setTimeout> | undefined
  /** Fit the graph to the box once `after` ms have passed (node sizes measured, a layout's tween done). */
  const fit = (after: number) => {
    clearTimeout(fitTimer)
    // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
    fitTimer = setTimeout(() => flow.fitView(undefined, undefined, { duration: 250 }), after)
  }
  // A five-layer left-to-right graph is unreadable in a phone-width box
  // (about 30% zoom), so a narrow canvas lays out top-down instead.
  let canvasEl: HTMLElement | null = null
  const narrow = () => (canvasEl?.clientWidth ?? 1024) < NARROW_PX
  const direction = () => (narrow() ? ('DOWN' as const) : ('RIGHT' as const))

  onMount(() => {
    baseline.set(nodeBodyRuns.peek())
    if (narrow()) {
      void flow
        .layout('layered', { direction: 'DOWN', nodeSpacing: 36, layerSpacing: 50, animate: false })
        .then(() => fit(60))
    } else fit(60)
  })
  onUnmount(() => clearTimeout(fitTimer))

  const autoLayout = async () => {
    // Resolves when the positions are known; the 300 ms tween then runs.
    await flow.layout('layered', {
      direction: direction(),
      nodeSpacing: 36,
      layerSpacing: narrow() ? 50 : 70,
    })
    fit(LAYOUT_TWEEN_MS + 40)
  }
  const scramble = () => {
    for (const [id] of STEPS)
      flow.updateNodePosition(id, {
        x: Math.round(Math.random() * 720),
        y: Math.round(Math.random() * 360),
      })
    fit(0)
  }

  return (
    <GlowCard padding="flush">
      <FlowStyles />
      <Bar>
        <Pill variant="solid" onClick={() => void autoLayout()}>
          Auto-layout
        </Pill>
        <Pill onClick={scramble}>Scramble</Pill>
        <Counter aria-live="polite">
          node re-runs since mount: <CounterValue>{() => String(reRuns())}</CounterValue>
        </Counter>
      </Bar>
      <Canvas>
        <div ref={(el: HTMLElement | null) => (canvasEl = el)} style="position: absolute; inset: 0">
          <Flow
            instance={flow}
            nodeTypes={NODE_TYPES}
            colorMode="light"
            ariaLabel="Lead-routing workflow: seven steps, six connections"
          >
            <Background variant="dots" gap={20} />
            <Controls />
          </Flow>
        </div>
      </Canvas>
      <Hint>
        Drag a node, or Tab to one and use the arrow keys (Shift for bigger steps). Drag the empty
        canvas to pan; the buttons in the corner zoom and fit.
      </Hint>
    </GlowCard>
  )
}
