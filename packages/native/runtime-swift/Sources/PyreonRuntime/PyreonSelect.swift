import SwiftUI

/// One choice of a `<Select>` — `SelectOption` from `@pyreon/primitives`.
///
/// `disabled` is OPTIONAL, mirroring `disabled?: boolean`: an emitted literal
/// that leaves it out constructs the type directly, and `nil` reads as enabled.
public struct PyreonSelectOption: Hashable, Identifiable, Codable {
    public var value: String
    public var label: String
    public var disabled: Bool?

    public var id: String { value }

    public init(value: String, label: String, disabled: Bool? = nil) {
        self.value = value
        self.label = label
        self.disabled = disabled
    }
}

/// The name `@pyreon/primitives` exports, so a file typed with
/// `signal<SelectOption[]>(…)` emits a type that exists here.
public typealias SelectOption = PyreonSelectOption

/// `<Select value options onChange placeholder? disabled?>` — a menu-style
/// `Picker`, the platform's own single-choice control.
///
/// Matches the web `<select>` the same source renders:
/// - A value no option has (`""` included) selects nothing; the picker then
///   shows the placeholder row, which exists ALWAYS (blank without a
///   placeholder) and can never be picked — the web's disabled `<option value="">`.
/// - A disabled option is listed but not selectable (`.selectionDisabled`).
/// - The placeholder is also the picker's accessibility label.
/// `disabled` on the whole control is the caller's `.disabled(_:)` modifier.
public struct PyreonSelect: View {
    @Binding private var selection: String
    private let options: [PyreonSelectOption]
    private let placeholder: String?

    public init(selection: Binding<String>, options: [PyreonSelectOption], placeholder: String? = nil) {
        self._selection = selection
        self.options = options
        self.placeholder = placeholder
    }

    // SwiftUI names are module-QUALIFIED: an app component called `Picker` or
    // `Text` compiled into the same module as this file (a co-located build, the
    // real-SDK compile gate) would otherwise shadow them.
    public var body: some View {
        SwiftUI.Picker(selection: $selection) {
            SwiftUI.Text(placeholder ?? "").tag("").selectionDisabled(true)
            SwiftUI.ForEach(options) { option in
                SwiftUI.Text(option.label).tag(option.value).selectionDisabled(option.disabled == true)
            }
        } label: {
            SwiftUI.Text(placeholder ?? "")
        }
        .pickerStyle(.menu)
    }
}
