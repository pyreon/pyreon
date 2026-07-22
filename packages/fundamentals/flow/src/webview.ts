// `@pyreon/flow/webview` — host a flow DIAGRAM inside a native `<WebView>`
// (WKWebView on iOS, Android WebView) so a graph renders on every target from
// ONE `.tsx` source, driven by the SAME `{nodes, edges}` model as `<Flow>`.
//
// WHY THIS EXISTS. `@pyreon/flow` renders SVG/DOM + custom-JSX node views —
// web-only by architecture (PMTC can't compile it to SwiftUI/Compose). The
// sanctioned multiplatform answer is the `<WebView>` bridge. Unlike charts
// (one self-contained ECharts UMD), flow's full editor needs the whole Pyreon
// web runtime, so this module ships a SELF-CONTAINED diagram renderer for the
// dominant mobile case — DISPLAY + TAP a graph: nodes (labeled rounded rects),
// edges (bezier — flow's REAL `getBezierPath` geometry), pan, pinch/zoom, and
// node-tap → a native callback. Zero external bundle; drop-in.
//
// FULL-EDITOR ESCAPE HATCH. Need custom-JSX nodes / connection-dragging /
// resizing (the full `<Flow>`)? Bundle your compiled `@pyreon/flow` web app as
// the host and pass it via `<FlowWebView html={…}>` — the component just needs
// a page that reads `window.__pyreonData` as `{nodes, edges}` and posts a
// string back via `window.pyreonPostMessage`.
//
// BRIDGE CONTRACT (identical to the native `PyreonWebView` runtime hosts):
//   • FORWARD — `graph` → `data={…}` on `<WebView>`; PMTC JSON-encodes it and
//     pushes it into the live page (`window.__pyreonData` + a `pyreondata`
//     event) WITHOUT reload — the diagram re-renders in place. `graph` is the
//     plain, JSON-pure flow model (`{ nodes:[{id,position,data?,width?,height?}],
//     edges:[{source,target,...}] }` — exactly what `createFlow`/`<Flow>` hold).
//   • REVERSE — tapping a node calls `window.pyreonPostMessage(json)` →
//     `onSelect({ id, data })`, so hosted viz drives native signals.

import { h } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { WebView } from '@pyreon/primitives'

/** A node in the pushed graph (the JSON-pure subset of `@pyreon/flow`'s `FlowNode`). */
export interface FlowWebViewNode {
  id: string
  position: { x: number; y: number }
  data?: unknown
  width?: number
  height?: number
}
/** An edge in the pushed graph. */
export interface FlowWebViewEdge {
  source: string
  target: string
  [key: string]: unknown
}
/** The graph model pushed across the bridge — the same shape `<Flow>` renders. */
export interface FlowWebViewGraph {
  nodes: FlowWebViewNode[]
  edges: FlowWebViewEdge[]
}
/** Payload delivered to `onSelect` when a node is tapped. */
export interface FlowSelectPayload {
  id: string
  data?: unknown
}

export interface BuildFlowHostHtmlOptions {
  /** Default node width when a node omits `width`. Default 150. */
  nodeWidth?: number
  /** Default node height when a node omits `height`. Default 44. */
  nodeHeight?: number
  /** Node fill color. Default `#ffffff`. */
  nodeFill?: string
  /** Node border color. Default `#c9ced6`. */
  nodeStroke?: string
  /** Node label color. Default `#1f2933`. */
  labelColor?: string
  /** Edge stroke color. Default `#98a2b3`. */
  edgeColor?: string
  /** Page background (behind the diagram). Default `transparent`. */
  background?: string
}

const scriptSafe = (s: string): string => s.replace(/<\//g, '<\\/')
const num = (n: number): string => String(Number.isFinite(n) ? n : 0)

/**
 * Build the self-contained HTML page that renders a flow diagram from the
 * `<WebView>` data bridge. Reads `window.__pyreonData` as `{nodes, edges}`,
 * draws nodes + bezier edges (flow's real curve), supports pan + wheel/pinch
 * zoom, fits the graph on first paint, re-renders on `pyreondata`, and posts a
 * tapped node's `{id, data}` via `window.pyreonPostMessage`.
 */
export function buildFlowHostHtml(options: BuildFlowHostHtmlOptions = {}): string {
  const {
    nodeWidth = 150,
    nodeHeight = 44,
    nodeFill = '#ffffff',
    nodeStroke = '#c9ced6',
    labelColor = '#1f2933',
    edgeColor = '#98a2b3',
    background = 'transparent',
  } = options

  // The renderer — dependency-free vanilla JS. Edge geometry mirrors
  // `@pyreon/flow`'s `getBezierPath` (source handle Bottom → target Top,
  // curvature 0.25).
  const script = `
(function () {
  try {
  var NS = 'http://www.w3.org/2000/svg';
  var NODE_W = ${num(nodeWidth)}, NODE_H = ${num(nodeHeight)};
  var root = document.getElementById('pyreon-flow');
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  svg.style.touchAction = 'none';
  var defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<marker id="pf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${edgeColor}"/></marker>';
  svg.appendChild(defs);
  var g = document.createElementNS(NS, 'g');
  svg.appendChild(g); root.appendChild(svg);

  var vp = { x: 0, y: 0, k: 1 }, fitted = false;
  function applyVp() { g.setAttribute('transform', 'translate(' + vp.x + ',' + vp.y + ') scale(' + vp.k + ')'); }

  // getBezierPath: dist * 0.25 control offset, source Bottom / target Top.
  function bezier(sx, sy, tx, ty) {
    var dx = Math.abs(tx - sx), dy = Math.abs(ty - sy);
    var off = Math.sqrt(dx * dx + dy * dy) * 0.25;
    return 'M' + sx + ',' + sy + ' C' + sx + ',' + (sy + off) + ' ' + tx + ',' + (ty - off) + ' ' + tx + ',' + ty;
  }

  function labelOf(n) {
    var d = n.data;
    if (d == null) return n.id;
    if (typeof d === 'object') return d.label != null ? d.label : n.id;
    return d;
  }

  function fit(nodes) {
    if (fitted || !nodes.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      var w = n.width || NODE_W, h = n.height || NODE_H;
      minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w); maxY = Math.max(maxY, n.position.y + h);
    });
    var vw = root.clientWidth || 1, vh = root.clientHeight || 1;
    var gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
    var pad = 24;
    vp.k = Math.max(0.2, Math.min(1.5, Math.min((vw - pad * 2) / gw, (vh - pad * 2) / gh)));
    vp.x = pad - minX * vp.k + Math.max(0, (vw - pad * 2 - gw * vp.k) / 2);
    vp.y = pad - minY * vp.k + Math.max(0, (vh - pad * 2 - gh * vp.k) / 2);
    fitted = true; applyVp();
  }

  function render() {
    var d = window.__pyreonData;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    d = d || {}; var nodes = d.nodes || [], edges = d.edges || [];
    while (g.firstChild) g.removeChild(g.firstChild);
    var byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
    edges.forEach(function (e) {
      var s = byId[e.source], t = byId[e.target]; if (!s || !t) return;
      var sw = s.width || NODE_W, sh = s.height || NODE_H, tw = t.width || NODE_W, th = t.height || NODE_H;
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', bezier(s.position.x + sw / 2, s.position.y + sh, t.position.x + tw / 2, t.position.y));
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', '${edgeColor}'); p.setAttribute('stroke-width', '1.5');
      p.setAttribute('marker-end', 'url(#pf-arrow)'); g.appendChild(p);
    });
    nodes.forEach(function (n) {
      var w = n.width || NODE_W, h = n.height || NODE_H;
      var grp = document.createElementNS(NS, 'g');
      grp.setAttribute('transform', 'translate(' + n.position.x + ',' + n.position.y + ')');
      grp.style.cursor = 'pointer'; grp.setAttribute('data-node-id', n.id);
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', '8');
      r.setAttribute('fill', '${nodeFill}'); r.setAttribute('stroke', '${nodeStroke}'); r.setAttribute('stroke-width', '1');
      grp.appendChild(r);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', w / 2); tx.setAttribute('y', h / 2);
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dominant-baseline', 'central');
      tx.setAttribute('font-family', 'system-ui, sans-serif'); tx.setAttribute('font-size', '13'); tx.setAttribute('fill', '${labelColor}');
      tx.textContent = String(labelOf(n)); grp.appendChild(tx);
      grp.addEventListener('click', function () {
        if (typeof window.pyreonPostMessage === 'function') {
          try { window.pyreonPostMessage(JSON.stringify({ id: n.id, data: n.data })); } catch (e) {}
        }
      });
      g.appendChild(grp);
    });
    fit(nodes);
  }

  // Pan (pointer) — bails on a node so taps aren't swallowed.
  var panning = false, moved = false, last = null;
  svg.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('[data-node-id]')) return;
    panning = true; moved = false; last = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', function (e) {
    if (!panning) return; moved = true;
    vp.x += e.clientX - last.x; vp.y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; applyVp();
  });
  window.addEventListener('pointerup', function () { panning = false; });
  // Zoom (wheel / trackpad-pinch).
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    vp.k = Math.max(0.2, Math.min(4, vp.k * (e.deltaY < 0 ? 1.1 : 0.9))); applyVp();
  }, { passive: false });

  window.addEventListener('pyreondata', render);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { fitted = false; render(); }).observe(root);
  applyVp(); render();
  } catch (e) { window.__pyreonFlowError = String(e && e.stack || e); }
})();`

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
    '<style>html,body{margin:0;padding:0;height:100%;width:100%;background:' +
    background.replace(/"/g, '&quot;') +
    '}#pyreon-flow{height:100%;width:100%}</style></head>' +
    '<body><div id="pyreon-flow"></div><script>' +
    scriptSafe(script) +
    '</script></body></html>'
  )
}

export interface FlowWebViewProps {
  /**
   * The flow graph — `{ nodes, edges }`, the same JSON-pure model
   * `createFlow`/`<Flow>` hold. Pass a signal accessor (or a compiler-reactive
   * expression); on change it's pushed into the hosted page without reload.
   */
  graph: FlowWebViewGraph | (() => FlowWebViewGraph)
  /** Node-tap callback — receives `{ id, data }`. */
  onSelect?: (payload: FlowSelectPayload) => void
  /**
   * Provide your own host HTML (advanced — e.g. a bundled full `@pyreon/flow`
   * web app). Omit to build the self-contained diagram renderer from the
   * `node*`/`*Color` options.
   */
  html?: string
  /** Diagram styling — see {@link BuildFlowHostHtmlOptions}. */
  nodeWidth?: number
  nodeHeight?: number
  nodeFill?: string
  nodeStroke?: string
  labelColor?: string
  edgeColor?: string
}

/**
 * `<FlowWebView graph={…} onSelect={…} />` — a flow diagram hosted in a native
 * `<WebView>`, driven by the `graph` signal. Compiles to a `WKWebView` on iOS,
 * an Android `WebView`, and an `<iframe srcdoc>` on web — same bridge on every
 * target. The multiplatform counterpart to `<Flow>` for the display + tap case.
 *
 * @example
 * const HOST = buildFlowHostHtml()
 * <FlowWebView
 *   html={HOST}
 *   graph={() => ({ nodes: nodes(), edges: edges() })}
 *   onSelect={(n) => selected.set(n.id)}
 * />
 */
export function FlowWebView(props: FlowWebViewProps): VNode {
  const built: BuildFlowHostHtmlOptions = {}
  if (props.nodeWidth !== undefined) built.nodeWidth = props.nodeWidth
  if (props.nodeHeight !== undefined) built.nodeHeight = props.nodeHeight
  if (props.nodeFill !== undefined) built.nodeFill = props.nodeFill
  if (props.nodeStroke !== undefined) built.nodeStroke = props.nodeStroke
  if (props.labelColor !== undefined) built.labelColor = props.labelColor
  if (props.edgeColor !== undefined) built.edgeColor = props.edgeColor
  const html = props.html ?? buildFlowHostHtml(built)

  const webViewProps: Record<string, unknown> = { html }
  // Forward `graph` to `<WebView data>` reactively (getter re-reads each access
  // — see the ChartWebView note on why an eager read breaks compiler reactivity).
  Object.defineProperty(webViewProps, 'data', {
    enumerable: true,
    configurable: true,
    get(): unknown {
      const gph = props.graph
      return typeof gph === 'function' ? (gph as () => unknown)() : gph
    },
  })
  if (props.onSelect) {
    const onSelect = props.onSelect
    webViewProps.onMessage = (message: string): void => {
      let payload: FlowSelectPayload
      try {
        payload = JSON.parse(message) as FlowSelectPayload
      } catch {
        payload = { id: message }
      }
      onSelect(payload)
    }
  }
  return h(WebView as (p: unknown) => VNodeChild, webViewProps) as VNode
}
