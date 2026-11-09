// PyreonLatest — the box behind `useLatest(initial)`: a mutable holder that is NOT Compose state.
//
// On the web `useLatest(v)` returns `{ current: v }` once; reading or writing `.current` never re-renders, so this is a
// plain field, not a `MutableState` (a state write would recompose).

package com.pyreon.runtime

public class PyreonLatest<T>(initial: T) {
    public var current: T = initial
}
