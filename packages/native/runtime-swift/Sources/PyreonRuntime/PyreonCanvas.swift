import SwiftUI
import Foundation

// `<Canvas>` from @pyreon/primitives — a fixed-size vector drawing surface.
//
// The compiler emits:
//
//   PyreonCanvas(width: 200, height: 120) {
//     PyreonShape(PyreonCanvasPath.rect(x: 10, y: 10, width: 80, height: 50, radius: 6),
//                 fill: Color(...), stroke: nil, lineWidth: 0)
//     …
//   }
//
// Each shape is a SwiftUI `Path` filling the canvas frame, so its coordinates
// are the canvas's own (top-left origin, y down, points) and later shapes
// draw over earlier ones — the same model as the web's stacked <svg> layers
// and Compose's stacked draw layers.

/// A clipped, fixed-size, top-leading drawing surface.
public struct PyreonCanvas<Content: View>: View {
    private let width: Double
    private let height: Double
    private let content: Content

    public init(width: Double, height: Double, @ViewBuilder content: () -> Content) {
        self.width = width
        self.height = height
        self.content = content()
    }

    public var body: some View {
        ZStack(alignment: .topLeading) { content }
            .frame(width: CGFloat(width), height: CGFloat(height), alignment: .topLeading)
            .clipped()
    }
}

/// One filled and/or stroked path. Drawn fill first, stroke on top — the
/// SVG paint order.
public struct PyreonShape: View {
    private let path: Path
    private let fill: Color?
    private let stroke: Color?
    private let lineWidth: Double

    public init(_ path: Path, fill: Color?, stroke: Color?, lineWidth: Double) {
        self.path = path
        self.fill = fill
        self.stroke = stroke
        self.lineWidth = lineWidth
    }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            if let fill { path.fill(fill) }
            if let stroke { path.stroke(stroke, lineWidth: CGFloat(lineWidth)) }
        }
    }
}

/// `<CanvasText>`: text whose TOP-LEFT sits at (x, y) in canvas coordinates
/// (the web draws it with `dominant-baseline="hanging"`, so the same numbers
/// place it the same way).
public struct PyreonCanvasText<Content: View>: View {
    private let x: Double
    private let y: Double
    private let size: Double
    private let color: Color
    private let content: Content

    public init(x: Double, y: Double, size: Double, color: Color, @ViewBuilder content: () -> Content) {
        self.x = x
        self.y = y
        self.size = size
        self.color = color
        self.content = content()
    }

    public var body: some View {
        content
            .font(.system(size: CGFloat(size)))
            .foregroundColor(color)
            // Its natural size, never wrapped or truncated by the canvas width.
            .fixedSize()
            .offset(x: CGFloat(x), y: CGFloat(y))
    }
}

/// Path builders for the shape primitives. Arguments are Double so the
/// emit can pass any numeric expression without per-call conversions.
public enum PyreonCanvasPath {
    public static func rect(x: Double, y: Double, width: Double, height: Double, radius: Double) -> Path {
        let r = CGRect(x: x, y: y, width: width, height: height)
        // A radius past half the short side is clamped, as SVG `rx` is.
        let maxR = min(abs(width), abs(height)) / 2
        return radius > 0
            ? Path(roundedRect: r, cornerRadius: CGFloat(min(radius, maxR)))
            : Path(r)
    }

    public static func circle(cx: Double, cy: Double, r: Double) -> Path {
        Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
    }

    public static func line(x1: Double, y1: Double, x2: Double, y2: Double) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: x1, y: y1))
        p.addLine(to: CGPoint(x: x2, y: y2))
        return p
    }

    /// SVG path data → `Path`. Malformed input stops at the first bad token
    /// and keeps what was parsed so far, which is what browsers do.
    public static func svg(_ d: String) -> Path {
        var parser = PyreonSVGPathParser(d)
        return parser.parse()
    }
}

/// An SVG path-data parser covering the whole command set (M L H V C S Q T A Z,
/// absolute and relative), with arcs converted to cubic Béziers.
public struct PyreonSVGPathParser {
    private let chars: [Character]
    private var i = 0
    private var path = Path()
    private var current = CGPoint.zero
    private var start = CGPoint.zero
    /// The previous command's second control point, for S / T reflection.
    private var lastCubic: CGPoint?
    private var lastQuad: CGPoint?

    public init(_ d: String) { chars = Array(d) }

    public mutating func parse() -> Path {
        var command: Character?
        while true {
            skipSeparators()
            guard i < chars.count else { break }
            let c = chars[i]
            if c.isLetter {
                command = c
                i += 1
            } else if command == nil {
                break // data must start with a command
            }
            guard let cmd = command else { break }
            if !apply(cmd) { break }
            // After a moveto, implicit repeats are linetos (SVG 9.3.3).
            if cmd == "M" { command = "L" } else if cmd == "m" { command = "l" }
            if cmd == "Z" || cmd == "z" { command = nil }
        }
        return path
    }

    private mutating func apply(_ cmd: Character) -> Bool {
        let rel = cmd.isLowercase
        let base = rel ? current : .zero
        func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: base.x + x, y: base.y + y) }
        switch cmd.uppercased() {
        case "M":
            guard let x = number(), let y = number() else { return false }
            current = pt(x, y); start = current
            path.move(to: current)
            lastCubic = nil; lastQuad = nil
        case "L":
            guard let x = number(), let y = number() else { return false }
            current = pt(x, y)
            path.addLine(to: current)
            lastCubic = nil; lastQuad = nil
        case "H":
            guard let x = number() else { return false }
            current = CGPoint(x: (rel ? current.x : 0) + x, y: current.y)
            path.addLine(to: current)
            lastCubic = nil; lastQuad = nil
        case "V":
            guard let y = number() else { return false }
            current = CGPoint(x: current.x, y: (rel ? current.y : 0) + y)
            path.addLine(to: current)
            lastCubic = nil; lastQuad = nil
        case "C":
            guard let x1 = number(), let y1 = number(), let x2 = number(), let y2 = number(),
                  let x = number(), let y = number() else { return false }
            let c2 = pt(x2, y2)
            current = pt(x, y)
            path.addCurve(to: current, control1: pt(x1, y1), control2: c2)
            lastCubic = c2; lastQuad = nil
        case "S":
            guard let x2 = number(), let y2 = number(), let x = number(), let y = number() else { return false }
            let c1 = lastCubic.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
            let c2 = pt(x2, y2)
            current = pt(x, y)
            path.addCurve(to: current, control1: c1, control2: c2)
            lastCubic = c2; lastQuad = nil
        case "Q":
            guard let x1 = number(), let y1 = number(), let x = number(), let y = number() else { return false }
            let c = pt(x1, y1)
            current = pt(x, y)
            path.addQuadCurve(to: current, control: c)
            lastQuad = c; lastCubic = nil
        case "T":
            guard let x = number(), let y = number() else { return false }
            let c = lastQuad.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
            current = pt(x, y)
            path.addQuadCurve(to: current, control: c)
            lastQuad = c; lastCubic = nil
        case "A":
            guard let rx = number(), let ry = number(), let rot = number(),
                  let large = flag(), let sweep = flag(),
                  let x = number(), let y = number() else { return false }
            let end = pt(x, y)
            arc(to: end, rx: rx, ry: ry, rotation: rot, largeArc: large, sweep: sweep)
            current = end
            lastCubic = nil; lastQuad = nil
        case "Z":
            path.closeSubpath()
            current = start
            lastCubic = nil; lastQuad = nil
        default:
            return false
        }
        return true
    }

    // MARK: - Arc (SVG implementation notes F.6.5 → cubic segments)

    private mutating func arc(to end: CGPoint, rx rx0: Double, ry ry0: Double, rotation: Double, largeArc: Bool, sweep: Bool) {
        let p0 = current
        if p0 == end { return }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { path.addLine(to: end); return }
        let phi = rotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (Double(p0.x) - Double(end.x)) / 2
        let dy = (Double(p0.y) - Double(end.y)) / 2
        let x1p = cosPhi * dx + sinPhi * dy
        let y1p = -sinPhi * dx + cosPhi * dy
        // Scale radii up when they cannot span the endpoints.
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { let s = lambda.squareRoot(); rx *= s; ry *= s }
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coef = den == 0 ? 0 : max(0, num / den).squareRoot()
        if largeArc == sweep { coef = -coef }
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * -(ry * x1p / rx)
        let cx = cosPhi * cxp - sinPhi * cyp + (Double(p0.x) + Double(end.x)) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (Double(p0.y) + Double(end.y)) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            return a
        }
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi } else if sweep && delta < 0 { delta += 2 * .pi }
        // Split into segments of at most 90°; each is one cubic.
        let segments = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
        let step = delta / Double(segments)
        let k = 4.0 / 3.0 * tan(step / 4)
        var t = theta1
        func point(_ a: Double) -> (Double, Double) {
            let x = rx * cos(a), y = ry * sin(a)
            return (cosPhi * x - sinPhi * y + cx, sinPhi * x + cosPhi * y + cy)
        }
        func deriv(_ a: Double) -> (Double, Double) {
            let x = -rx * sin(a), y = ry * cos(a)
            return (cosPhi * x - sinPhi * y, sinPhi * x + cosPhi * y)
        }
        for _ in 0..<segments {
            let t2 = t + step
            let (x1, y1) = point(t), (x2, y2) = point(t2)
            let (d1x, d1y) = deriv(t), (d2x, d2y) = deriv(t2)
            path.addCurve(
                to: CGPoint(x: x2, y: y2),
                control1: CGPoint(x: x1 + k * d1x, y: y1 + k * d1y),
                control2: CGPoint(x: x2 - k * d2x, y: y2 - k * d2y))
            t = t2
        }
    }

    // MARK: - Tokens

    private mutating func skipSeparators() {
        while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" || chars[i] == "\t" || chars[i] == "\r" {
            i += 1
        }
    }

    /// An arc flag: a single `0` / `1`, which may be written with no separator
    /// before the next number (`a10 10 0 0110 10` is valid).
    private mutating func flag() -> Bool? {
        skipSeparators()
        guard i < chars.count else { return nil }
        let c = chars[i]
        guard c == "0" || c == "1" else { return nil }
        i += 1
        return c == "1"
    }

    /// One number: optional sign, digits, optional fraction, optional exponent.
    /// A second `.` or a sign ends it (`1.5.5` is `1.5`, `.5`; `1-2` is `1`, `-2`).
    private mutating func number() -> Double? {
        skipSeparators()
        let begin = i
        if i < chars.count, chars[i] == "+" || chars[i] == "-" { i += 1 }
        var digits = false
        while i < chars.count, chars[i].isASCII, chars[i].isNumber { i += 1; digits = true }
        if i < chars.count, chars[i] == "." {
            i += 1
            while i < chars.count, chars[i].isASCII, chars[i].isNumber { i += 1; digits = true }
        }
        guard digits else { i = begin; return nil }
        if i < chars.count, chars[i] == "e" || chars[i] == "E" {
            var j = i + 1
            if j < chars.count, chars[j] == "+" || chars[j] == "-" { j += 1 }
            if j < chars.count, chars[j].isASCII, chars[j].isNumber {
                i = j
                while i < chars.count, chars[i].isASCII, chars[i].isNumber { i += 1 }
            }
        }
        return Double(String(chars[begin..<i]))
    }
}
