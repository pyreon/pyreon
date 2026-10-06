import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CompilerPlugin,
  type DeclEmitter,
  type ElementLowering,
  type FunctionLowering,
  type IdentifierLowering,
  type IntrinsicLowering,
} from '@pyreon/native-compiler/plugin-api'
import { flowFileOf, prepareFlowFile } from './collect'
import {
  emitKotlinFlowElement,
  emitKotlinFlowWebViewElement,
  flowFunctionKotlin,
  flowIntrinsicsKotlin,
  flowLifecycleKotlin,
  flowMemberReadKotlin,
  flowReceiverKotlin,
  flowStateDeclKotlin,
} from './kotlin'
import { DROPPED_FLOW_COMPONENTS, LOWERED_FLOW_RUNTIME_EXPORTS } from './lowering'
import { FLOW_PLUGIN_NAME, FLOW_STATE_TYPE } from './names'
import { connectionLineProps, edgeComponentProps, nodeComponentProps } from './props-types'
import { recognizeFlow } from './recognize'
import { flowStubs } from './stubs'
import {
  emitSwiftFlowElement,
  emitSwiftFlowWebViewElement,
  flowFunctionSwift,
  flowIntrinsicsSwift,
  flowLifecycleSwift,
  flowMemberReadSwift,
  flowReceiverSwift,
  flowStateDeclSwift,
} from './swift'

export { FLOW_PLUGIN_NAME, FLOW_STATE_TYPE }

/** The plain helper functions the plugin lowers (`getBezierPath({…})`, `computeLayout(…)`, the marker and handle helpers). */
const FLOW_FUNCTIONS = [
  'computeLayout',
  'getBezierPath',
  'getSmoothStepPath',
  'getStepPath',
  'getStraightPath',
  'getWaypointPath',
  'resolveMarker',
  'markerId',
  'resolveEdgeMarkers',
  'collectEdgeMarkers',
  'getHandlePosition',
  'getEdgePath',
  'getNodeIntersection',
  'getEffectiveDimensions',
  'getFloatingEndpoints',
  'getSmartHandlePositions',
  'resolveHandleAnchor',
] as const

const flowFunctions: Record<string, FunctionLowering> = Object.fromEntries(
  FLOW_FUNCTIONS.map((name) => [
    name,
    {
      // `computeLayout` kept this IR spelling before functions were plugin-owned; it is hashed into synthesized struct names.
      ...(name === 'computeLayout' ? { irName: '__pyreonFlowComputeLayout' } : {}),
      swift: flowFunctionSwift(name),
      kotlin: flowFunctionKotlin(name),
    },
  ]),
)

/** Library constants a bare identifier names: the default node size (native `Double`s differ by target) and the default marker. */
const flowIdentifiers: Record<string, IdentifierLowering> = {
  DEFAULT_NODE_WIDTH: { swift: () => '150', kotlin: () => '150.0' },
  DEFAULT_NODE_HEIGHT: { swift: () => '40', kotlin: () => '40.0' },
  DEFAULT_MARKER_END: { swift: () => 'pyreonFlowDefaultMarkerEnd', kotlin: () => 'pyreonFlowDefaultMarkerEnd' },
}

const flowStateDecl: DeclEmitter = {
  // The declaration was a closed `flow-state` compiler kind before it moved here; the struct names the
  // compiler derives from a declaration's shape hash it under that name, so the emitted names did not move.
  legacyKind: 'flow-state',
  swift: flowStateDeclSwift,
  kotlin: flowStateDeclKotlin,
  lifecycle: {
    // The declaration's component gets a stable host: a `.task`-style modifier on a transparent conditional would restart forever.
    stableHost: true,
    swift: flowLifecycleSwift,
    kotlin: flowLifecycleKotlin,
  },
}

/** Every `@pyreon/flow` JSX tag the plugin lowers on its own (the tags `<Flow>` merely CONSUMES — Background, MiniMap, Panel — are read from `<Flow>`'s children, so they are not claimed). */
const FLOW_TAGS = ['Flow', 'Controls', 'Handle', 'NodeResizer', 'NodeToolbar', 'BaseEdge', 'EdgeText', 'ViewportPortal', 'EdgeLabelRenderer'] as const

const flowElements: readonly ElementLowering[] = [
  {
    module: '@pyreon/flow',
    tags: FLOW_TAGS,
    emit: { swift: (e, ctx) => emitSwiftFlowElement(e, ctx), kotlin: (e, ctx) => emitKotlinFlowElement(e, ctx) },
  },
  {
    // `<FlowWebView>` is also imported under an alias (`import { FlowWebView as Hosted } from '@pyreon/flow/webview'`).
    module: '@pyreon/flow',
    tags: ['FlowWebView'],
    aliasable: true,
    emit: { swift: (e, ctx) => emitSwiftFlowWebViewElement(e, ctx), kotlin: (e, ctx) => emitKotlinFlowWebViewElement(e, ctx) },
  },
]

const flowIntrinsics: readonly IntrinsicLowering[] = [
  {
    // `<path>` is a custom edge path wherever it appears; the rest only inside a component a `<Flow>` renders with.
    tags: ['path'],
    applies: () => true,
    emit: { swift: flowIntrinsicsSwift, kotlin: flowIntrinsicsKotlin },
  },
  {
    tags: ['div', 'p', 'span', 'svg'],
    applies: (ctx) => flowFileOf(ctx).renderers.has(ctx.component().name),
    emit: { swift: flowIntrinsicsSwift, kotlin: flowIntrinsicsKotlin },
  },
]

/**
 * The `@pyreon/flow` native plugin: how `createFlow` / `useFlow`, `<Flow>` and its
 * satellites, the edge-path and marker helpers and `<FlowWebView>` cross to
 * SwiftUI and Compose. Shipped by `@pyreon/flow` itself and discovered from its
 * manifest (`pyreon.native.plugin`) when a source file imports the package.
 */
export const flowPlugin: CompilerPlugin = {
  name: FLOW_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/flow'],
  calls: { createFlow: recognizeFlow, useFlow: recognizeFlow },
  decls: { [FLOW_STATE_TYPE]: flowStateDecl },
  receivers: { [FLOW_STATE_TYPE]: { swift: flowReceiverSwift, kotlin: flowReceiverKotlin } },
  functions: flowFunctions,
  identifiers: flowIdentifiers,
  memberReads: { swift: flowMemberReadSwift, kotlin: flowMemberReadKotlin },
  elements: flowElements,
  intrinsics: flowIntrinsics,
  prepareEmit: prepareFlowFile,
  intrinsicAdvice:
    'for a `<Flow>` node or edge renderer built from DOM, CSS or SVG, host the diagram with `<FlowWebView>` from `@pyreon/flow/webview`, which runs the web renderer unchanged on both platforms',
  propsTypes: {
    NodeComponentProps: nodeComponentProps,
    EdgeComponentProps: edgeComponentProps,
    ConnectionLineProps: connectionLineProps,
  },
  unlowered: {
    '@pyreon/flow': {
      // `createFlow` lowers (PyreonFlowState — CRUD/selection/viewport/graph
      // queries), and `<Flow>` lowers to the native interactive host. Without
      // this entry unsupported names emitted VERBATIM as if
      // they were real SwiftUI/Compose types — `Flow(instance: flow) {
      // Background() }` — which fails at the native BUILD with "cannot find
      // 'Flow' in scope" and no indication anywhere that `<Flow>` itself is
      // the unsupported part, not `createFlow` (which by then has correctly
      // lowered right above it). The five public edge-path builders lower to
      // the same native geometry used by the Flow canvas.
      advice:
        '`createFlow({ nodes, edges })`, `useFlow({ nodes, edges })`, `computeLayout(...)`, edge-path and marker helpers, literal `<Flow nodeTypes={{ type: Component }}>`, literal `<Flow edgeTypes={{ type: Component }}>` maps whose renderer uses the shipped path helpers, static `<Handle>`, `<NodeResizer>`, and one literal-config `<NodeToolbar>` declaration inside custom nodes, `<Background>`, `<Controls>`, `<MiniMap>`, `<Panel>`, `<EdgeLabelRenderer>`, `<BaseEdge>` and `<EdgeText>` LOWER to the native PyreonFlowState/PyreonFlowView engine. Arbitrary SVG path strings or browser-only DOM/CSS inside a custom renderer still require NativeIOS/NativeAndroid branches or the `@pyreon/flow/webview` bridge',
      supported: [...LOWERED_FLOW_RUNTIME_EXPORTS],
      // Web-only Flow components the emitters DROP with their own named warning at the use site.
      dropped: [...DROPPED_FLOW_COMPONENTS],
    },
  },
  stubs: flowStubs,
}
