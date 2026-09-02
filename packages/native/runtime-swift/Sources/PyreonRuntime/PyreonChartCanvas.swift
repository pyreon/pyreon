import SwiftUI
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
    public var center: PyreonChartPt?
    public var radius: Double?
    public var text: String?
    public var at: PyreonChartPt?
    public var size: Double?
    public var align: String?
    public var baseline: String?
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
        baseline: String? = nil
    ) {
        self.kind = kind
        self.rect = rect
        self.fill = fill
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

/// Parse the engine's color strings — `#rgb`, `#rrggbb`, `rgb(r, g, b)` and
/// `rgba(r, g, b, a)` (what `withAlpha` and the ramps emit). An unknown
/// string paints clear rather than trapping: a wrong color must never take
/// the chart down.
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

/// A SwiftUI Canvas walking the engine's flat draw list — the native twin of
/// canvas-web's renderer (same dispatch, same text-anchor semantics).
public struct PyreonChartCanvas: View {
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
                    context.fill(
                        Path(CGRect(x: r.x, y: r.y, width: r.w, height: r.h)),
                        with: .color(pyreonChartColor(fill)))
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
                    context.fill(p, with: .color(pyreonChartColor(fill)))
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
                    context.draw(resolved, in: CGRect(x: x, y: y, width: m.width, height: m.height))
                default:
                    continue
                }
            }
        }
    }
}
