import SwiftUI
import Foundation
#if canImport(UIKit)
import UIKit
#endif

// The chart draw-list contract. The RUNTIME owns these types; the generated
// PyreonChartEngine geometry (gen-native-chart-engine, follow-up) references
// them rather than re-declaring — one declaration, no concat collisions.
// Field-for-field the fat-struct lowering of the engine's `DrawCmd` union:
// `kind` discriminates, variant fields are optional.
public struct PyreonChartPt: Codable, Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
}

public struct PyreonChartRect: Codable, Equatable {
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    public init(x: Double, y: Double, w: Double, h: Double) {
        self.x = x; self.y = y; self.w = w; self.h = h
    }
}

/// One colour along a gradient's axis — runtime-owned like Pt/Rect/DrawCmd,
/// because `PyreonDrawCmd` is `Codable, Equatable` and a stored property whose
/// type is neither breaks that conformance.
public struct PyreonChartGradientStop: Codable, Equatable {
    public var offset: Double
    public var color: String
    public init(offset: Double, color: String) {
        self.offset = offset
        self.color = color
    }
}

/// A linear gradient in the shape's own coordinate space.
public struct PyreonChartGradient: Codable, Equatable {
    public var from: PyreonChartPt
    public var to: PyreonChartPt
    public var stops: [PyreonChartGradientStop]
    public init(from: PyreonChartPt, to: PyreonChartPt, stops: [PyreonChartGradientStop]) {
        self.from = from
        self.to = to
        self.stops = stops
    }
}

public struct PyreonChartPattern: Codable, Equatable {
    public var kind: String
    public var color: String
    public var spacing: Double
    public var width: Double
    public init(kind: String, color: String, spacing: Double, width: Double) {
        self.kind = kind; self.color = color; self.spacing = spacing; self.width = width
    }
}

public struct PyreonDrawCmd: Codable, Equatable {
    public var kind: String
    public var rect: PyreonChartRect?
    public var from: PyreonChartPt?
    public var to: PyreonChartPt?
    public var stroke: String?
    public var width: Double?
    public var dash: [Double]?
    public var points: [PyreonChartPt]?
    public var fill: String?
    /// Corner radii for a `rect` — [topLeft, topRight, bottomRight, bottomLeft],
    /// already in engine units. Clamped through the engine's `cornerRadii`, so
    /// this canvas rounds by the same numbers the web canvas and the SVG do.
    public var corners: [Double]?
    /// Paint the fill as a linear gradient; `fill` stays the fallback.
    public var grad: PyreonChartGradient?
    public var pattern: PyreonChartPattern?
    public var center: PyreonChartPt?
    public var radius: Double?
    public var text: String?
    public var at: PyreonChartPt?
    public var size: Double?
    public var align: String?
    public var baseline: String?
    /// Rotation about `at` in degrees, clockwise positive — a slanted axis label.
    public var rotate: Double?
    // Full defaulted-parameter init in the GENERATED engine's field order —
    // the emitted geometry constructs commands as named-subset calls
    // (`PyreonDrawCmd(kind: "rect", rect: r, fill: f)`), and Swift requires
    // call-site argument order to match this parameter order. The order is
    // the compiler's synthesized fat-struct order (first-seen across the
    // DrawCmd union's arms), locked by the chart-engine drift test.
    public init(
        kind: String,
        rect: PyreonChartRect? = nil,
        fill: String? = nil,
        corners: [Double]? = nil,
        grad: PyreonChartGradient? = nil,
        pattern: PyreonChartPattern? = nil,
        from: PyreonChartPt? = nil,
        to: PyreonChartPt? = nil,
        stroke: String? = nil,
        width: Double? = nil,
        dash: [Double]? = nil,
        points: [PyreonChartPt]? = nil,
        center: PyreonChartPt? = nil,
        radius: Double? = nil,
        text: String? = nil,
        at: PyreonChartPt? = nil,
        size: Double? = nil,
        align: String? = nil,
        baseline: String? = nil,
        rotate: Double? = nil
    ) {
        self.kind = kind
        self.rect = rect
        self.fill = fill
        self.corners = corners
        self.grad = grad
        self.pattern = pattern
        self.from = from
        self.to = to
        self.stroke = stroke
        self.width = width
        self.dash = dash
        self.points = points
        self.center = center
        self.radius = radius
        self.text = text
        self.at = at
        self.size = size
        self.align = align
        self.baseline = baseline
        self.rotate = rotate
    }
}

/// Text width in engine units (points) — the MeasureText the layout
/// functions take, so a frame laid out natively sizes its gutters from the
/// real glyphs exactly as the web canvas does. Outside UIKit (the macOS
/// typecheck gate) an average-glyph estimate stands in.
public func pyreonChartMeasure(_ text: String, _ size: Double) -> Double {
    #if canImport(UIKit)
    let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: CGFloat(size))]
    return Double((text as NSString).size(withAttributes: attrs).width)
    #else
    return Double(text.count) * size * 0.6
    #endif
}

/// Int→Double coercion for accessor-mapped fields. Two overloads where
/// Double(_:) has twenty: four such coercions in one struct init otherwise
/// send swiftc past its type-check budget.
public func pyreonChartDouble(_ v: Double) -> Double { v }
public func pyreonChartDouble(_ v: Int) -> Double { Double(v) }

/// Locale-aware chart formatters matching the web host's `Intl` defaults:
/// grouped numbers with at most two fraction digits, and a short month/day.
/// They are factories so each chart owns its formatter; Foundation formatter
/// instances are mutable and must not be shared across concurrent views.
public func pyreonLocaleNumberFormatter(_ tag: String) -> (Double) -> String {
    let candidate = Locale(identifier: tag)
    let locale = candidate.language.languageCode?.identifier.isEmpty == false ? candidate : Locale(identifier: "en")
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 0
    formatter.maximumFractionDigits = 2
    formatter.usesGroupingSeparator = true
    return { value in
        guard value.isFinite else { return "" }
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}

public func pyreonLocaleDateFormatter(_ tag: String) -> (Double) -> String {
    let candidate = Locale(identifier: tag)
    let locale = candidate.language.languageCode?.identifier.isEmpty == false ? candidate : Locale(identifier: "en")
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.setLocalizedDateFormatFromTemplate("MMMd")
    return { value in
        guard value.isFinite else { return "" }
        return formatter.string(from: Date(timeIntervalSince1970: value / 1000.0))
    }
}

/// Move a draw list down the canvas — the host sits a plot below the title
/// and legend it drew at (0, 0). Translating the commands rather than
/// threading an origin through the engine keeps every layout function at
/// (0, 0), exactly as the web hosts do (`shiftCmd` in Chart.tsx).
public func pyreonShiftCmds(_ cmds: [PyreonDrawCmd], _ dy: Double) -> [PyreonDrawCmd] {
    pyreonShiftCmdsXY(cmds, 0.0, dy)
}

/// The two-axis form: a legend placed on the LEFT indents the plot as well as
/// a title pushes it down, so the host needs both offsets in one pass.
public func pyreonShiftCmdsXY(_ cmds: [PyreonDrawCmd], _ dx: Double, _ dy: Double) -> [PyreonDrawCmd] {
    if dx == 0.0 && dy == 0.0 { return cmds }
    var out: [PyreonDrawCmd] = []
    out.reserveCapacity(cmds.count)
    for c in cmds {
        var s = c
        if let r = c.rect { s.rect = PyreonChartRect(x: r.x + dx, y: r.y + dy, w: r.w, h: r.h) }
        if let f = c.from { s.from = PyreonChartPt(x: f.x + dx, y: f.y + dy) }
        if let t = c.to { s.to = PyreonChartPt(x: t.x + dx, y: t.y + dy) }
        if let pts = c.points { s.points = pts.map { PyreonChartPt(x: $0.x + dx, y: $0.y + dy) } }
        if let ctr = c.center { s.center = PyreonChartPt(x: ctr.x + dx, y: ctr.y + dy) }
        if let at = c.at { s.at = PyreonChartPt(x: at.x + dx, y: at.y + dy) }
        out.append(s)
    }
    return out
}

/// Parse the engine's color strings — `#rgb`, `#rrggbb`, `rgb(r, g, b)` and
/// `rgba(r, g, b, a)` (what `withAlpha` and the ramps emit). An unknown
/// string paints clear rather than trapping: a wrong color must never take
/// the chart down.
/// Mirror a draw list about the canvas's vertical centreline — a right-to-left
/// chart IS the mirror of its left-to-right one.
///
/// The twin of `mirrorCmds` in the web engine (`engine/rtl.ts`), hand-written
/// here for the same reason `pyreonShiftCmds` is: the draw command is a
/// discriminated union in TypeScript and this flat struct on native, so the
/// web switch has no lowering. `native-chart-mirror-parity.test.ts` runs the
/// same commands through both and compares the numbers, so the two cannot
/// drift.
///
/// A rect's `x` is its LEFT edge, so the mirrored left edge is the mirror of
/// its RIGHT edge; corner radii swap left-to-right; a text anchor flips and a
/// rotated label's angle negates. Strings are never reversed.
public func pyreonMirrorCmds(_ cmds: [PyreonDrawCmd], _ width: Double) -> [PyreonDrawCmd] {
    func mx(_ x: Double) -> Double { width - x }
    func mp(_ p: PyreonChartPt) -> PyreonChartPt { PyreonChartPt(x: mx(p.x), y: p.y) }
    var out: [PyreonDrawCmd] = []
    out.reserveCapacity(cmds.count)
    for c in cmds {
        var m = c
        if let r = c.rect { m.rect = PyreonChartRect(x: mx(r.x + r.w), y: r.y, w: r.w, h: r.h) }
        if let f = c.from { m.from = mp(f) }
        if let t = c.to { m.to = mp(t) }
        if let pts = c.points { m.points = pts.map { mp($0) } }
        if let ctr = c.center { m.center = mp(ctr) }
        if let at = c.at { m.at = mp(at) }
        if let cs = c.corners, cs.count == 4 { m.corners = [cs[1], cs[0], cs[3], cs[2]] }
        if let g = c.grad {
            m.grad = PyreonChartGradient(from: mp(g.from), to: mp(g.to), stops: g.stops)
        }
        if let a = c.align { m.align = a == "start" ? "end" : a == "end" ? "start" : a }
        if let r = c.rotate { m.rotate = -r }
        out.append(m)
    }
    return out
}

/// Transpose a draw list — a VERTICAL sankey / calendar / parallel is the
/// horizontal one reflected across the diagonal. The twin of the web engine's
/// `transposeCmds`; parity is asserted by EXECUTION, so every field it touches
/// must match the web switch field for field.
public func pyreonTransposeCmds(_ cmds: [PyreonDrawCmd]) -> [PyreonDrawCmd] {
    func tp(_ p: PyreonChartPt) -> PyreonChartPt { PyreonChartPt(x: p.y, y: p.x) }
    var out: [PyreonDrawCmd] = []
    out.reserveCapacity(cmds.count)
    for c in cmds {
        var m = c
        if let r = c.rect { m.rect = PyreonChartRect(x: r.y, y: r.x, w: r.h, h: r.w) }
        if let f = c.from { m.from = tp(f) }
        if let t = c.to { m.to = tp(t) }
        if let pts = c.points { m.points = pts.map { tp($0) } }
        if let ctr = c.center { m.center = tp(ctr) }
        if let at = c.at { m.at = tp(at) }
        // Corners run top-left, top-right, bottom-right, bottom-left; the
        // diagonal fixes the first and third and swaps the other two.
        if let cs = c.corners, cs.count == 4 { m.corners = [cs[0], cs[3], cs[2], cs[1]] }
        if let g = c.grad {
            m.grad = PyreonChartGradient(from: tp(g.from), to: tp(g.to), stops: g.stops)
        }
        // Text is anchored, never reflected: the horizontal anchor becomes the vertical one and back.
        let a = c.align
        let b = c.baseline
        if b != nil { m.align = b == "top" ? "start" : b == "bottom" ? "end" : "middle" }
        if a != nil { m.baseline = a == "start" ? "top" : a == "end" ? "bottom" : "middle" }
        if let r = c.rotate { m.rotate = 90.0 - r }
        out.append(m)
    }
    return out
}

public func pyreonChartColor(_ s: String) -> Color {
    let str = s.trimmingCharacters(in: .whitespaces)
    if str.hasPrefix("#") {
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
        return Color.clear
    }
    if str.hasPrefix("rgba(") || str.hasPrefix("rgb(") {
        let inner = str.drop(while: { $0 != "(" }).dropFirst().dropLast()
        let parts = inner.split(separator: ",").map {
            Double($0.trimmingCharacters(in: .whitespaces)) ?? 0
        }
        if parts.count >= 3 {
            let a = parts.count >= 4 ? parts[3] : 1.0
            return Color(red: parts[0] / 255.0, green: parts[1] / 255.0, blue: parts[2] / 255.0)
                .opacity(a)
        }
    }
    return Color.clear
}

/// A SwiftUI shading from the engine's gradient — or the solid colour when
/// there is none. `.linearGradient` takes UNIT points, so the engine's chart
/// coordinates are handed over as-is via `.point()`-free absolute geometry:
/// SwiftUI's GraphicsContext gradient takes real points, which is what the
/// engine already speaks.
func pyreonChartShading(_ fill: String, _ grad: PyreonChartGradient?) -> GraphicsContext.Shading {
    guard let g = grad, !g.stops.isEmpty else { return .color(pyreonChartColor(fill)) }
    let stops = g.stops.map {
        Gradient.Stop(
            color: pyreonChartColor($0.color), location: CGFloat(min(1.0, max(0.0, $0.offset))))
    }
    return .linearGradient(
        Gradient(stops: stops),
        startPoint: CGPoint(x: g.from.x, y: g.from.y),
        endPoint: CGPoint(x: g.to.x, y: g.to.y))
}

/// The four arcs of a rounded rect — the twin of canvas-web's `traceRoundedRect`
/// and svg.ts's path builder, corner for corner.
func pyreonRoundedRectPath(_ r: PyreonChartRect, _ radii: [Double]) -> Path {
    let tl = CGFloat(radii[0])
    let tr = CGFloat(radii[1])
    let br = CGFloat(radii[2])
    let bl = CGFloat(radii[3])
    let x = CGFloat(r.x)
    let y = CGFloat(r.y)
    let w = CGFloat(r.w)
    let h = CGFloat(r.h)
    var p = Path()
    p.move(to: CGPoint(x: x + tl, y: y))
    p.addLine(to: CGPoint(x: x + w - tr, y: y))
    if tr > 0 {
        p.addArc(
            center: CGPoint(x: x + w - tr, y: y + tr), radius: tr,
            startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
    }
    p.addLine(to: CGPoint(x: x + w, y: y + h - br))
    if br > 0 {
        p.addArc(
            center: CGPoint(x: x + w - br, y: y + h - br), radius: br,
            startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
    }
    p.addLine(to: CGPoint(x: x + bl, y: y + h))
    if bl > 0 {
        p.addArc(
            center: CGPoint(x: x + bl, y: y + h - bl), radius: bl,
            startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
    }
    p.addLine(to: CGPoint(x: x, y: y + tl))
    if tl > 0 {
        p.addArc(
            center: CGPoint(x: x + tl, y: y + tl), radius: tl,
            startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
    }
    p.closeSubpath()
    return p
}

/// A SwiftUI Canvas walking the engine's flat draw list — the native twin of
/// canvas-web's renderer (same dispatch, same text-anchor semantics).
private func pyreonPaintPattern(_ context: inout GraphicsContext, _ pattern: PyreonChartPattern?, _ clip: Path, _ bounds: CGRect) {
    guard let pattern else { return }
    let spacing = max(2.0, pattern.spacing)
    let width = max(0.5, pattern.width)
    context.drawLayer { layer in
        layer.clip(to: clip)
        let shade = GraphicsContext.Shading.color(pyreonChartColor(pattern.color))
        if pattern.kind == "dots" {
            var y = bounds.minY
            while y <= bounds.maxY {
                var x = bounds.minX
                while x <= bounds.maxX {
                    layer.fill(Path(ellipseIn: CGRect(x: x - width / 2.0, y: y - width / 2.0, width: width, height: width)), with: shade)
                    x += spacing
                }
                y += spacing
            }
        } else {
            let span = bounds.width + bounds.height
            var d = -bounds.height
            while d <= bounds.width {
                var p = Path()
                p.move(to: CGPoint(x: bounds.minX + d, y: bounds.maxY))
                p.addLine(to: CGPoint(x: bounds.minX + d + span, y: bounds.minY))
                layer.stroke(p, with: shade, lineWidth: width)
                if pattern.kind == "cross" {
                    var q = Path()
                    q.move(to: CGPoint(x: bounds.minX + d, y: bounds.minY))
                    q.addLine(to: CGPoint(x: bounds.minX + d + span, y: bounds.maxY))
                    layer.stroke(q, with: shade, lineWidth: width)
                }
                d += spacing
            }
        }
    }
}

private func pyreonChartMix(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
private func pyreonChartMixPoint(_ a: PyreonChartPt, _ b: PyreonChartPt, _ t: Double) -> PyreonChartPt {
    PyreonChartPt(x: pyreonChartMix(a.x, b.x, t), y: pyreonChartMix(a.y, b.y, t))
}

public func pyreonSameChartCommandShape(_ a: [PyreonDrawCmd], _ b: [PyreonDrawCmd]) -> Bool {
    guard a.count == b.count else { return false }
    for i in a.indices {
        if a[i].kind != b[i].kind { return false }
        if (a[i].kind == "polyline" || a[i].kind == "polygon") && a[i].points?.count != b[i].points?.count { return false }
        if a[i].kind == "text" && a[i].text != b[i].text { return false }
    }
    return true
}

public func pyreonTweenChartCommands(_ from: [PyreonDrawCmd], _ to: [PyreonDrawCmd], _ progress: Double) -> [PyreonDrawCmd] {
    if progress >= 1.0 || !pyreonSameChartCommandShape(from, to) { return to }
    return to.indices.map { i in
        let a = from[i]
        var b = to[i]
        switch b.kind {
        case "rect":
            if let x = a.rect, let y = b.rect {
                b.rect = PyreonChartRect(x: pyreonChartMix(x.x, y.x, progress), y: pyreonChartMix(x.y, y.y, progress), w: pyreonChartMix(x.w, y.w, progress), h: pyreonChartMix(x.h, y.h, progress))
            }
        case "line":
            if let af = a.from, let at = a.to, let bf = b.from, let bt = b.to {
                b.from = pyreonChartMixPoint(af, bf, progress); b.to = pyreonChartMixPoint(at, bt, progress)
            }
        case "polyline", "polygon":
            if let ap = a.points, let bp = b.points, ap.count == bp.count {
                b.points = bp.indices.map { pyreonChartMixPoint(ap[$0], bp[$0], progress) }
            }
        case "circle":
            if let ac = a.center, let bc = b.center, let ar = a.radius, let br = b.radius {
                b.center = pyreonChartMixPoint(ac, bc, progress); b.radius = pyreonChartMix(ar, br, progress)
            }
        case "text":
            if let aa = a.at, let ba = b.at {
                b.at = pyreonChartMixPoint(aa, ba, progress)
                b.size = pyreonChartMix(a.size ?? b.size ?? 0.0, b.size ?? 0.0, progress)
            }
        default: break
        }
        return b
    }
}

private func pyreonChartBounds(_ command: PyreonDrawCmd) -> PyreonChartRect {
    var points: [PyreonChartPt] = []
    if let r = command.rect { points = [PyreonChartPt(x: r.x, y: r.y), PyreonChartPt(x: r.x + r.w, y: r.y + r.h)] }
    else if let f = command.from, let t = command.to { points = [f, t] }
    else if let p = command.points { points = p }
    else if let c = command.center, let r = command.radius { points = [PyreonChartPt(x: c.x - r, y: c.y - r), PyreonChartPt(x: c.x + r, y: c.y + r)] }
    else if let at = command.at { points = [at] }
    guard let first = points.first else { return PyreonChartRect(x: 0, y: 0, w: 0, h: 0) }
    var minX = first.x, maxX = first.x, minY = first.y, maxY = first.y
    for point in points.dropFirst() {
        minX = min(minX, point.x); maxX = max(maxX, point.x)
        minY = min(minY, point.y); maxY = max(maxY, point.y)
    }
    return PyreonChartRect(x: minX, y: minY, w: maxX - minX, h: maxY - minY)
}

private func pyreonCollapsedChartCommand(_ command: PyreonDrawCmd) -> PyreonDrawCmd {
    let box = pyreonChartBounds(command)
    let center = PyreonChartPt(x: box.x + box.w / 2.0, y: box.y + box.h / 2.0)
    var result = command
    switch command.kind {
    case "rect": result.rect = PyreonChartRect(x: center.x, y: center.y, w: 0, h: 0)
    case "line": result.from = center; result.to = center
    case "polyline", "polygon": result.points = Array(repeating: center, count: command.points?.count ?? 0)
    case "circle": result.center = center; result.radius = 0
    case "text": result.at = center; result.size = 0
    default: break
    }
    return result
}

private func pyreonChartTarget(_ target: PyreonDrawCmd, at source: PyreonDrawCmd?) -> PyreonDrawCmd {
    guard let source else { return pyreonCollapsedChartCommand(target) }
    let box = pyreonChartBounds(source)
    let center = PyreonChartPt(x: box.x + box.w / 2.0, y: box.y + box.h / 2.0)
    var result = target
    switch target.kind {
    case "rect": result.rect = box
    case "line": result.from = PyreonChartPt(x: box.x, y: box.y); result.to = PyreonChartPt(x: box.x + box.w, y: box.y + box.h)
    case "polyline", "polygon": result.points = Array(repeating: center, count: target.points?.count ?? 0)
    case "circle": result.center = center; result.radius = max(box.w, box.h) / 2.0
    case "text": result.at = center; result.size = source.kind == "text" ? source.size : 0
    default: break
    }
    return result
}

public func pyreonUniversalTweenChartCommands(_ from: [PyreonDrawCmd], _ to: [PyreonDrawCmd], _ progress: Double) -> [PyreonDrawCmd] {
    if progress >= 1.0 { return to }
    if pyreonSameChartCommandShape(from, to) { return pyreonTweenChartCommands(from, to, progress) }
    var used = Set<Int>()
    var out: [PyreonDrawCmd] = []
    for target in to {
        var sourceIndex = from.indices.first { !used.contains($0) && from[$0].kind == target.kind }
        if sourceIndex == nil { sourceIndex = from.indices.first { !used.contains($0) } }
        if let index = sourceIndex { used.insert(index) }
        let start = pyreonChartTarget(target, at: sourceIndex.map { from[$0] })
        out.append(pyreonTweenChartCommands([start], [target], progress)[0])
    }
    for i in from.indices where !used.contains(i) {
        out.append(pyreonTweenChartCommands([from[i]], [pyreonCollapsedChartCommand(from[i])], progress)[0])
    }
    return out
}

private struct PyreonStaticChartCanvas: View {
    public var cmds: [PyreonDrawCmd]
    public var fontFamily: String?
    public init(cmds: [PyreonDrawCmd], fontFamily: String? = nil) {
        self.cmds = cmds
        self.fontFamily = fontFamily
    }

    public var body: some View {
        Canvas { context, _ in
            for c in cmds {
                switch c.kind {
                case "rect":
                    guard let r = c.rect, let fill = c.fill else { continue }
                    let shade = pyreonChartShading(fill, c.grad)
                    let radii = cornerRadii(r, c.corners)
                    if hasCorners(radii) {
                        let path = pyreonRoundedRectPath(r, radii)
                        context.fill(path, with: shade)
                        pyreonPaintPattern(&context, c.pattern, path, CGRect(x: r.x, y: r.y, width: r.w, height: r.h))
                    } else {
                        let box = CGRect(x: r.x, y: r.y, width: r.w, height: r.h)
                        let path = Path(box)
                        context.fill(path, with: shade)
                        pyreonPaintPattern(&context, c.pattern, path, box)
                    }
                case "line":
                    guard let f = c.from, let t = c.to, let stroke = c.stroke else { continue }
                    var p = Path()
                    p.move(to: CGPoint(x: f.x, y: f.y))
                    p.addLine(to: CGPoint(x: t.x, y: t.y))
                    var style = StrokeStyle(lineWidth: CGFloat(c.width ?? 1.0))
                    if let d = c.dash { style.dash = d.map { CGFloat($0) } }
                    context.stroke(p, with: .color(pyreonChartColor(stroke)), style: style)
                case "polyline":
                    guard let pts = c.points, pts.count > 1, let stroke = c.stroke else { continue }
                    var p = Path()
                    p.move(to: CGPoint(x: pts[0].x, y: pts[0].y))
                    for q in pts.dropFirst() { p.addLine(to: CGPoint(x: q.x, y: q.y)) }
                    var style = StrokeStyle(lineWidth: CGFloat(c.width ?? 1.0), lineJoin: .round)
                    if let d = c.dash { style.dash = d.map { CGFloat($0) } }
                    context.stroke(p, with: .color(pyreonChartColor(stroke)), style: style)
                case "polygon":
                    guard let pts = c.points, pts.count > 2, let fill = c.fill else { continue }
                    var p = Path()
                    p.move(to: CGPoint(x: pts[0].x, y: pts[0].y))
                    for q in pts.dropFirst() { p.addLine(to: CGPoint(x: q.x, y: q.y)) }
                    p.closeSubpath()
                    context.fill(p, with: pyreonChartShading(fill, c.grad))
                    let xs = pts.map { $0.x }
                    let ys = pts.map { $0.y }
                    if let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() {
                        pyreonPaintPattern(&context, c.pattern, p, CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY))
                    }
                case "circle":
                    guard let ctr = c.center, let rad = c.radius, let fill = c.fill else { continue }
                    let rect = CGRect(
                        x: ctr.x - rad, y: ctr.y - rad, width: rad * 2.0, height: rad * 2.0)
                    context.fill(Path(ellipseIn: rect), with: .color(pyreonChartColor(fill)))
                case "text":
                    guard let txt = c.text, let at = c.at, let fill = c.fill else { continue }
                    let size = CGFloat(c.size ?? 12.0)
                    let font: Font =
                        fontFamily != nil ? .custom(fontFamily!, size: size) : .system(size: size)
                    var resolved = context.resolve(
                        Text(txt).font(font))
                    resolved.shading = .color(pyreonChartColor(fill))
                    let m = resolved.measure(in: CGSize(width: 10000, height: 10000))
                    // web: textAlign start|center|end; textBaseline top|middle|alphabetic
                    let x: Double
                    switch c.align ?? "start" {
                    case "middle": x = at.x - m.width / 2.0
                    case "end": x = at.x - m.width
                    default: x = at.x
                    }
                    let y: Double
                    switch c.baseline ?? "bottom" {
                    case "top": y = at.y
                    case "middle": y = at.y - m.height / 2.0
                    default: y = at.y - m.height  // bottom ≈ alphabetic
                    }
                    let rot = c.rotate ?? 0.0
                    if rot != 0.0 {
                        // Rotate about the anchor; align/baseline apply in the
                        // rotated frame (the web canvas's translate + rotate).
                        var rc = context
                        rc.translateBy(x: at.x, y: at.y)
                        rc.rotate(by: Angle(degrees: rot))
                        rc.draw(resolved, in: CGRect(x: x - at.x, y: y - at.y, width: m.width, height: m.height))
                    } else {
                        context.draw(resolved, in: CGRect(x: x, y: y, width: m.width, height: m.height))
                    }
                default:
                    continue
                }
            }
        }
    }
}

/// Draw-list transition host used for reactive chart updates. Geometry is
/// interpolated in the runtime so native applications need no browser renderer.
public struct PyreonChartCanvas: View {
    public var cmds: [PyreonDrawCmd]
    public var durationMs: Double
    public var universal: Bool
    public var animated: Bool
    public var fontFamily: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var from: [PyreonDrawCmd]
    @State private var target: [PyreonDrawCmd]
    @State private var startedAt = Date()
    @State private var animating = false
    @State private var generation = 0

    public init(cmds: [PyreonDrawCmd], durationMs: Double = 350.0, universal: Bool = false, animated: Bool = true, fontFamily: String? = nil) {
        self.cmds = cmds
        self.durationMs = durationMs
        self.universal = universal
        self.animated = animated
        self.fontFamily = fontFamily
        _from = State(initialValue: cmds)
        _target = State(initialValue: cmds)
    }

    private func tween(_ progress: Double) -> [PyreonDrawCmd] {
        universal ? pyreonUniversalTweenChartCommands(from, target, progress) : pyreonTweenChartCommands(from, target, progress)
    }

    public var body: some View {
        TimelineView(.animation(paused: !animating)) { context in
            let elapsed = context.date.timeIntervalSince(startedAt) * 1000.0
            let progress = reduceMotion || durationMs <= 0.0 ? 1.0 : min(1.0, max(0.0, elapsed / durationMs))
            PyreonStaticChartCanvas(cmds: animating ? tween(progress) : target, fontFamily: fontFamily)
        }
        .onChange(of: cmds) { next in
            let elapsed = Date().timeIntervalSince(startedAt) * 1000.0
            let progress = animating && durationMs > 0.0 ? min(1.0, max(0.0, elapsed / durationMs)) : 1.0
            from = animating ? tween(progress) : target
            target = next
            startedAt = Date()
            generation += 1
            let current = generation
            animating = animated && !reduceMotion && durationMs > 0.0 && from != target
            guard animating else { return }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(durationMs * 1_000_000.0))
                if current == generation { animating = false; from = target }
            }
        }
    }
}

// ── Radial chart components ─────────────────────────────────────────────
//
// The native twins of `@pyreon/charts/plot`'s `<PieChart>` / `<GaugeChart>`.
// PMTC lowers those JSX components to these views; the geometry comes from
// the GENERATED PyreonChartEngine (renderPie / renderGauge), so web and
// native draw from the same byte-locked math. Defaults mirror the web
// component bodies exactly (PieChart.tsx) — width 300/height 240 for pie,
// 240/140 for gauge, the same palette, the same label colors.

/// The web `<PieChart>` fallback palette, byte-for-byte.
public let pyreonChartPalette: [String] = [
    "#0f766e", "#b45309", "#1d4ed8", "#b42318", "#15803d", "#7c3aed",
]

public struct PyreonPieChart<T>: View {
    let data: [T]
    let value: (T) -> Double
    let label: (T) -> String
    let color: ((T) -> String)?
    let width: Double
    let height: Double
    let innerRadius: Double
    let showLabels: Bool

    public init(
        data: [T],
        value: @escaping (T) -> Double,
        label: @escaping (T) -> String,
        color: ((T) -> String)? = nil,
        width: Double = 300.0,
        height: Double = 240.0,
        innerRadius: Double = 0.0,
        showLabels: Bool = true
    ) {
        self.data = data
        self.value = value
        self.label = label
        self.color = color
        self.width = width
        self.height = height
        self.innerRadius = innerRadius
        self.showLabels = showLabels
    }

    /// Int-returning value accessor — a TS `amount: number` field infers Int,
    /// so `value={(t) => t.amount}` arrives as `(T) -> Int`; convert at the
    /// seam rather than failing every integer column.
    public init(
        data: [T],
        value: @escaping (T) -> Int,
        label: @escaping (T) -> String,
        color: ((T) -> String)? = nil,
        width: Double = 300.0,
        height: Double = 240.0,
        innerRadius: Double = 0.0,
        showLabels: Bool = true
    ) {
        self.init(
            data: data,
            value: { Double(value($0)) },
            label: label,
            color: color,
            width: width,
            height: height,
            innerRadius: innerRadius,
            showLabels: showLabels)
    }

    public var body: some View {
        let slices = data.enumerated().map { (i, d) in
            Slice(
                value: value(d),
                label: label(d),
                color: color?(d) ?? pyreonChartPalette[i % pyreonChartPalette.count])
        }
        let cmds = renderPie(
            slices,
            PyreonChartRect(x: 0.0, y: 0.0, w: width, h: height),
            PieOptions(
                innerRadius: innerRadius,
                showLabels: showLabels,
                labelColor: "#ffffff",
                fontSize: 11.0))
        return PyreonChartCanvas(cmds: cmds).frame(width: width, height: height)
    }
}

public struct PyreonGaugeChart: View {
    let value: Double
    let min: Double
    let max: Double
    let width: Double
    let height: Double
    let thickness: Double
    let trackColor: String
    let valueColor: String
    let showValue: Bool

    public init(
        value: Double,
        min: Double = 0.0,
        max: Double = 100.0,
        width: Double = 240.0,
        height: Double = 140.0,
        thickness: Double = 22.0,
        trackColor: String = "rgba(132,150,165,0.22)",
        valueColor: String = "#0f766e",
        showValue: Bool = true
    ) {
        self.value = value
        self.min = min
        self.max = max
        self.width = width
        self.height = height
        self.thickness = thickness
        self.trackColor = trackColor
        self.valueColor = valueColor
        self.showValue = showValue
    }

    public var body: some View {
        // The half-circle occupies the top half of its box, so the drawing
        // box is twice the visible height — the web component's exact shape.
        var cmds = renderGauge(
            value,
            PyreonChartRect(x: 0.0, y: 0.0, w: width, h: height * 2.0),
            GaugeOptions(
                min: min,
                max: max,
                sweep: Double.pi,
                thickness: thickness,
                trackColor: trackColor,
                valueColor: valueColor))
        if showValue {
            cmds.append(
                PyreonDrawCmd(
                    kind: "text",
                    fill: "#10161d",
                    text: plain(value),
                    at: PyreonChartPt(x: width / 2.0, y: height - 6.0),
                    size: 20.0,
                    align: "middle",
                    baseline: "bottom"))
        }
        return PyreonChartCanvas(cmds: cmds).frame(width: width, height: height)
    }
}

// MARK: - Entrance tween

/// The web canvas host's entrance easing: cubic ease-out over `durationMs`,
/// clamped. Pure, so the three targets share one curve exactly.
public func pyreonEntranceProgress(_ elapsedMs: Double, _ durationMs: Double) -> Double {
    if durationMs <= 0.0 { return 1.0 }
    let t = min(1.0, max(0.0, elapsedMs / durationMs))
    let u = 1.0 - t
    return 1.0 - u * u * u
}

/// Drives a chart's one-time entrance (`animate`, on by default): `content`
/// receives the progress 0..1 on every frame of the tween and 1 for the rest
/// of the view's life — the same `progress` the engine's render functions
/// take on the web. Honours Reduce Motion (the web host's
/// `prefers-reduced-motion` twin) by rendering fully formed at once. The
/// timeline is PAUSED once the tween has finished, so a settled chart costs
/// nothing per frame; a Canvas inside the closure re-evaluates on each tick.
public struct PyreonChartEntrance<Content: View>: View {
    public var durationMs: Double
    public var content: (Double) -> Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date = Date()
    @State private var finished: Bool = false

    public init(durationMs: Double, @ViewBuilder content: @escaping (Double) -> Content) {
        self.durationMs = durationMs
        self.content = content
    }

    public var body: some View {
        if reduceMotion || durationMs <= 0.0 {
            content(1.0)
        } else {
            TimelineView(.animation(paused: finished)) { context in
                content(finished ? 1.0 : pyreonEntranceProgress(context.date.timeIntervalSince(start) * 1000.0, durationMs))
            }
            .onAppear { start = Date() }
            .task {
                try? await Task.sleep(nanoseconds: UInt64(durationMs * 1_000_000.0))
                finished = true
            }
        }
    }
}
