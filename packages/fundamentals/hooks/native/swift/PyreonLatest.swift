// PyreonLatest — the box behind `useLatest(initial)`: a mutable holder that is NOT view state.
//
// On the web `useLatest(v)` returns `{ current: v }` once; reading or writing `.current` never re-renders. A `@State`
// value would re-render on every write, so the native port is a plain reference box held by a `@State` (the box
// itself is the stable identity; its contents are not observed).

import Foundation

public final class PyreonLatest<T> {
    public var current: T

    public init(_ initial: T) {
        self.current = initial
    }
}
