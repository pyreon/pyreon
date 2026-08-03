---
'@pyreon/kinetic': minor
'@pyreon/native-compiler': patch
---

Add asymmetric enter/leave transition timing, and give the numeric timing vocabulary a web implementation it never had.

`<Transition>` gains `enterDuration` / `leaveDuration` (and `enterEasing` / `leaveEasing`), each falling back to the symmetric `duration` / `easing`. "Quick in, slow out" is the common real shape and had no expression on any target before this.

- **Web (`@pyreon/kinetic`)**: `duration` / `easing` were never typed at all, so the numeric timing both native targets had honoured since the config arc was silently ignored in a browser — one shared source animating over 2.5s on a phone and over the CSS default on the web. `TransitionProps` now carries the timing vocabulary and synthesizes the CSS shorthand from it; an explicit `enterTransition` / `leaveTransition` still wins, so nothing that already worked changes.
- **Swift**: lowers to `.transition(.asymmetric(insertion:removal:))` with a per-side `AnyTransition.animation(_:)`. The symmetric shape is untouched, byte for byte.
- **Compose**: separate `fadeIn` / `fadeOut` tween specs.

Also brings the Swift `AnyTransition` validation stub up to the real SwiftUI surface (`asymmetric` and the per-side `animation(_:)` were missing), which failed an emit the real SDK accepts.
