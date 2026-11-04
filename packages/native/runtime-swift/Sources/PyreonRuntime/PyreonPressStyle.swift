import SwiftUI

// A pressable's PRESSED style — rocketstyle's `active:` block on a Button or
// Press base.
//
// The compiler emits
//   Button(action: …) { … }.buttonStyle(PyreonPressStyle { label, __pyPressed in
//     label.background(__pyPressed ? A : B)
//   })
// so the style modifiers run inside `makeBody`, where SwiftUI's own
// `configuration.isPressed` is in scope. That flag is the platform's press
// state: it clears when a scroll cancels the touch, exactly as the system
// highlight does, and it needs no gesture of its own — a zero-distance
// DragGesture tracker would block the enclosing ScrollView.

public struct PyreonPressStyle<Styled: View>: ButtonStyle {
    private let styled: (ButtonStyleConfiguration.Label, Bool) -> Styled

    public init(@ViewBuilder _ styled: @escaping (ButtonStyleConfiguration.Label, Bool) -> Styled) {
        self.styled = styled
    }

    public func makeBody(configuration: Configuration) -> some View {
        styled(configuration.label, configuration.isPressed)
    }
}
