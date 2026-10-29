import SwiftUI

/// The three date kinds of `<Field kind>`.
public enum PyreonDateFieldKind: Sendable {
    case date, time, datetime
}

/// The `<Field kind="date" | "time" | "datetime">` value contract — the web's
/// own zone-free wall-clock strings (`<input type="date" | "time" |
/// "datetime-local">`):
///
/// - `.date` → `"YYYY-MM-DD"`
/// - `.time` → `"HH:mm"` (24-hour)
/// - `.datetime` → `"YYYY-MM-DDTHH:mm"`
///
/// Parsed and formatted in the DEVICE time zone with a fixed POSIX locale and
/// the Gregorian calendar, so the string means the same wall-clock value the
/// user picked whatever their locale displays. A `.time` value is anchored to
/// TODAY, so a time range (`min="09:00"`) bounds the same day as the selection.
public enum PyreonDateValue {
    private static func formatter(_ kind: PyreonDateFieldKind) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone.current
        switch kind {
        case .date: f.dateFormat = "yyyy-MM-dd"
        case .time: f.dateFormat = "HH:mm"
        case .datetime: f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        }
        // Strict: a value the web would not accept is "no value", not a guess.
        f.isLenient = false
        return f
    }

    /// The value as a date, or `nil` for `""` and anything not in the format.
    public static func parse(_ value: String, _ kind: PyreonDateFieldKind) -> Date? {
        guard !value.isEmpty, let parsed = formatter(kind).date(from: value) else { return nil }
        guard kind == .time else { return parsed }
        // `HH:mm` parses onto 2000-01-01; move it onto today.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone.current
        let hm = cal.dateComponents([.hour, .minute], from: parsed)
        return cal.date(bySettingHour: hm.hour ?? 0, minute: hm.minute ?? 0, second: 0, of: Date())
    }

    public static func format(_ date: Date, _ kind: PyreonDateFieldKind) -> String {
        formatter(kind).string(from: date)
    }
}

/// `<Field kind="date" | "time" | "datetime" value onChangeText min max placeholder>`
/// — a SwiftUI `DatePicker`, bounded by `min` / `max`.
///
/// With no value the web input is EMPTY, which a `DatePicker` cannot be, so the
/// field shows a button instead — labelled with the `placeholder`, or with the
/// locale's own date pattern (`M/d/y`), as the browser shows its format hint.
/// Tapping it starts at the current date / time (clamped to the bounds) and
/// reveals the picker; a clear button returns to empty. `disabled` is the
/// caller's `.disabled(_:)` modifier, read here from the environment.
public struct PyreonDateField: View {
    @Binding private var value: String
    private let kind: PyreonDateFieldKind
    private let min: String?
    private let max: String?
    private let placeholder: String?
    @Environment(\.isEnabled) private var isEnabled

    public init(
        value: Binding<String>,
        kind: PyreonDateFieldKind,
        min: String? = nil,
        max: String? = nil,
        placeholder: String? = nil
    ) {
        self._value = value
        self.kind = kind
        self.min = min
        self.max = max
        self.placeholder = placeholder
    }

    private var components: DatePickerComponents {
        switch kind {
        case .date: return [.date]
        case .time: return [.hourAndMinute]
        case .datetime: return [.date, .hourAndMinute]
        }
    }

    private var lower: Date? { min.flatMap { PyreonDateValue.parse($0, kind) } }
    private var upper: Date? { max.flatMap { PyreonDateValue.parse($0, kind) } }

    private func clamp(_ d: Date) -> Date {
        var out = d
        if let lower, out < lower { out = lower }
        if let upper, out > upper { out = upper }
        return out
    }

    private var emptyPrompt: String {
        if let placeholder, !placeholder.isEmpty { return placeholder }
        let template: String
        switch kind {
        case .date: template = "yMd"
        case .time: template = "jmm"
        case .datetime: template = "yMdjmm"
        }
        return DateFormatter.dateFormat(fromTemplate: template, options: 0, locale: .current) ?? ""
    }

    // ONE accessibility container: the caller's `.accessibilityIdentifier` /
    // `.accessibilityLabel` then name the field, not each of its parts (the
    // picker AND the clear button would otherwise both carry the id).
    public var body: some View {
        content.accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var content: some View {
        if let current = PyreonDateValue.parse(value, kind) {
            SwiftUI.HStack(spacing: 8) {
                picker(Binding(
                    get: { current },
                    set: { value = PyreonDateValue.format(clamp($0), kind) }
                ))
                .labelsHidden()
                .accessibilityLabel(SwiftUI.Text(placeholder ?? ""))
                SwiftUI.Button {
                    value = ""
                } label: {
                    SwiftUI.Image(systemName: "xmark.circle.fill")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel(SwiftUI.Text("Clear"))
                .opacity(isEnabled ? 1 : 0)
            }
        } else {
            SwiftUI.Button(emptyPrompt) {
                value = PyreonDateValue.format(clamp(Date()), kind)
            }
        }
    }

    // One DatePicker per bound shape: SwiftUI takes a ClosedRange, a
    // PartialRangeFrom or a PartialRangeThrough — there is no "optional bound".
    @ViewBuilder
    private func picker(_ selection: Binding<Date>) -> some View {
        switch (lower, upper) {
        case let (l?, u?) where l <= u:
            SwiftUI.DatePicker(placeholder ?? "", selection: selection, in: l...u, displayedComponents: components)
        case let (l?, nil):
            SwiftUI.DatePicker(placeholder ?? "", selection: selection, in: l..., displayedComponents: components)
        case let (nil, u?):
            SwiftUI.DatePicker(placeholder ?? "", selection: selection, in: ...u, displayedComponents: components)
        default:
            SwiftUI.DatePicker(placeholder ?? "", selection: selection, displayedComponents: components)
        }
    }
}
