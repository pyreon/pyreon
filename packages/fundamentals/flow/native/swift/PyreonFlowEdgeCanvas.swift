import SwiftUI

// The native twin of `@pyreon/flow`'s SVG edge layer. Draws the SAME geometry
// the web `path` string encodes, without parsing SVG syntax — see
// `EdgeSegment` in `types.ts` for why this shape exists (the closed 4-command
// vocabulary every built-in path builder reduces to).
//
// `PyreonFlowEdgeSegment` mirrors `PyreonDrawCmd`'s fat-struct shape
// (PyreonChartCanvas.swift): one `kind` discriminant, every variant's fields
// optional. That is deliberate, not incidental — a TS discriminated union
// with this exact shape (`{kind}|{kind,x,y}|...`) is what PMTC's fat-struct
// union lowering already knows how to construct (built for `@pyreon/charts`'
// `DrawCmd`), so a future compiler recognizer over `EdgeSegment` reuses that
// feature verbatim instead of needing a new one.
//
// What this file does NOT do: compute segments FROM node positions. That is
// `computeEdgeGeometry`/`getEdgePath` on the web — pure functions, and a
// genuine candidate for the SAME "engine bundle → generator script → commit
// generated Swift/Kotlin" treatment `PyreonChartEngine` got, but that is its
// own follow-up (mirrors the layout-engine crossing). Until then, a native
// screen constructs `PyreonFlowEdgeSegment` values itself (the math for a
// straight or bezier edge between two known points is a few lines) or reads
// them off a value bridged from web (e.g. via the `<WebView>` JSON bridge).

/// One drawing primitive in an edge's path — `move`/`line`/`cubic`/`quad`,
/// the exact vocabulary `EdgeSegment` (`types.ts`) defines.
public struct PyreonFlowEdgeSegment: Equatable {
    public var kind: String
    public var x: Double
    public var y: Double
    public var c1x: Double?
    public var c1y: Double?
    public var c2x: Double?
    public var c2y: Double?
    public var cx: Double?
    public var cy: Double?

    public init(
        kind: String,
        x: Double,
        y: Double,
        c1x: Double? = nil,
        c1y: Double? = nil,
        c2x: Double? = nil,
        c2y: Double? = nil,
        cx: Double? = nil,
        cy: Double? = nil
    ) {
        self.kind = kind
        self.x = x
        self.y = y
        self.c1x = c1x
        self.c1y = c1y
        self.c2x = c2x
        self.c2y = c2y
        self.cx = cx
        self.cy = cy
    }

    /// `move`(x, y).
    public static func move(_ x: Double, _ y: Double) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "move", x: x, y: y)
    }
    /// `line`(x, y).
    public static func line(_ x: Double, _ y: Double) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "line", x: x, y: y)
    }
    /// `cubic`(x, y) with two control points.
    public static func cubic(
        _ x: Double, _ y: Double, c1x: Double, c1y: Double, c2x: Double, c2y: Double
    ) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "cubic", x: x, y: y, c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y)
    }
    /// `quad`(x, y) with one control point.
    public static func quad(_ x: Double, _ y: Double, cx: Double, cy: Double) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "quad", x: x, y: y, cx: cx, cy: cy)
    }
}

/// Builds a SwiftUI `Path` from a segment list. Pure — no SwiftUI View
/// dependency beyond the `Path`/`CGPoint` types, so it unit-tests headlessly
/// by inspecting the resulting path's bounding box / element count.
public func pyreonFlowEdgePath(_ segments: [PyreonFlowEdgeSegment]) -> Path {
    var p = Path()
    for seg in segments {
        switch seg.kind {
        case "move":
            p.move(to: CGPoint(x: seg.x, y: seg.y))
        case "line":
            p.addLine(to: CGPoint(x: seg.x, y: seg.y))
        case "cubic":
            guard let c1x = seg.c1x, let c1y = seg.c1y, let c2x = seg.c2x, let c2y = seg.c2y else {
                continue
            }
            p.addCurve(
                to: CGPoint(x: seg.x, y: seg.y),
                control1: CGPoint(x: c1x, y: c1y),
                control2: CGPoint(x: c2x, y: c2y))
        case "quad":
            guard let cx = seg.cx, let cy = seg.cy else { continue }
            p.addQuadCurve(to: CGPoint(x: seg.x, y: seg.y), control: CGPoint(x: cx, y: cy))
        default:
            continue
        }
    }
    return p
}

/// Parses `#rgb` / `#rrggbb` into a SwiftUI `Color`, falling back to gray for
/// anything else. Deliberately SELF-CONTAINED rather than reusing
/// `@pyreon/charts`' `pyreonChartColor` (same hex-parsing logic, smaller
/// scope — flow's edge colors are never CSS `rgb()`/`rgba()` strings): the
/// co-source verify gate compiles each package's `native/swift/` files in
/// ISOLATION, and a real app that depends on `@pyreon/flow` but NOT
/// `@pyreon/charts` would never link `PyreonChartCanvas.swift` at all — an
/// implicit cross-package symbol dependency here would be a real, silent
/// break in exactly that app, invisible until someone omits charts.
func pyreonFlowEdgeColor(_ s: String) -> Color {
    let str = s.trimmingCharacters(in: .whitespaces)
    guard str.hasPrefix("#") else { return Color.gray }
    let hex = String(str.dropFirst())
    func code(_ c: Character) -> Double {
        guard let v = c.hexDigitValue else { return 0 }
        return Double(v)
    }
    let chars = Array(hex)
    if chars.count == 3 {
        return Color(
            red: code(chars[0]) * 17.0 / 255.0,
            green: code(chars[1]) * 17.0 / 255.0,
            blue: code(chars[2]) * 17.0 / 255.0)
    }
    if chars.count == 6 {
        return Color(
            red: (code(chars[0]) * 16.0 + code(chars[1])) / 255.0,
            green: (code(chars[2]) * 16.0 + code(chars[3])) / 255.0,
            blue: (code(chars[4]) * 16.0 + code(chars[5])) / 255.0)
    }
    return Color.gray
}

/// One edge's stroke — its segment list plus how to draw it. `id` makes a
/// list of these usable as a SwiftUI `ForEach`-free `Canvas` draw list (the
/// whole canvas is one `Canvas {}` body, not per-edge views — same
/// single-draw-pass shape `PyreonChartCanvas` uses, for the same reason:
/// N edges as N SwiftUI views is real per-view overhead a flat draw list
/// avoids).
///
/// The `Path`, the resolved `Color` and the dash array are computed ONCE, when
/// the stroke is built (and again on `didSet` of the field they derive from),
/// never in the draw closure. Measured on the v1 draw path at E = 9,999: 6.9 ms
/// per draw, of which 3.3 ms was re-parsing hex colors and 2.6 ms rebuilding +
/// re-transforming paths — per frame, at gesture rate. `Equatable` so SwiftUI
/// can prove an unchanged draw list unchanged.
public struct PyreonFlowEdgeStroke: Identifiable, Equatable {
    public var id: String
    public var segments: [PyreonFlowEdgeSegment] { didSet { path = pyreonFlowEdgePath(segments) } }
    public var color: String { didSet { resolvedColor = pyreonFlowEdgeColor(color) } }
    public var width: Double
    public var dash: [Double]? { didSet { dashCG = dash.map { $0.map { CGFloat($0) } } } }

    /// The unscaled path, built once from `segments` (flow coordinates).
    public private(set) var path: Path
    /// `color` parsed once.
    public private(set) var resolvedColor: Color
    /// `dash` converted once (flow units — the canvas transform scales it).
    public private(set) var dashCG: [CGFloat]?

    public init(
        id: String,
        segments: [PyreonFlowEdgeSegment],
        color: String = "#999999",
        width: Double = 1.5,
        dash: [Double]? = nil
    ) {
        self.id = id
        self.segments = segments
        self.color = color
        self.width = width
        self.dash = dash
        self.path = pyreonFlowEdgePath(segments)
        self.resolvedColor = pyreonFlowEdgeColor(color)
        self.dashCG = dash.map { $0.map { CGFloat($0) } }
    }
}

/// Draws every edge in `edges`, applying the SAME viewport transform (pan +
/// uniform zoom) the web edge layer's CSS transform applies to its whole
/// `<svg>` — ONE transform on the drawing context, not one per edge. Each
/// stroke's `Path`/`Color`/dash are prebuilt (see `PyreonFlowEdgeStroke`), so
/// the closure does no allocation or parsing per edge: measured E = 9,999,
/// the v1 closure (rebuild + `applying` per edge + hex parse) was 6.9 ms;
/// prebuilt paths under one context transform are ~0.25 ms.
///
/// Stroke width and dash are in FLOW units and scale with the zoom through
/// the context transform — the same visual result as v1's `width * zoom`.
///
/// `Equatable` (edges + viewport): wrap the canvas in `.equatable()` (or
/// `EquatableView`) so a parent invalidation with an unchanged draw list skips
/// the redraw entirely.
public struct PyreonFlowEdgeCanvas: View, Equatable {
    public var edges: [PyreonFlowEdgeStroke]
    public var viewport: PyreonFlowViewport
    public init(edges: [PyreonFlowEdgeStroke], viewport: PyreonFlowViewport = PyreonFlowViewport()) {
        self.edges = edges
        self.viewport = viewport
    }

    public var body: some View {
        Canvas { context, _ in
            var ctx = context
            ctx.translateBy(x: CGFloat(viewport.x), y: CGFloat(viewport.y))
            ctx.scaleBy(x: CGFloat(viewport.zoom), y: CGFloat(viewport.zoom))
            for edge in edges {
                var style = StrokeStyle(lineWidth: CGFloat(edge.width), lineJoin: .round)
                if let d = edge.dashCG { style.dash = d }
                ctx.stroke(edge.path, with: .color(edge.resolvedColor), style: style)
            }
        }
    }
}
