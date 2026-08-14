---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

Add `useSafeArea` and `useScreenOrientation` — the display-environment pair,
across web, iOS and Android.

**`useSafeArea`** returns the insets content must avoid: notch / Dynamic
Island, home indicator, gesture bar, rounded corners. This is the one device
fact a multiplatform app cannot work around at the app level — without it,
content draws under the notch, or every screen pads by a hard-coded guess that
is wrong on the next device.

It returns ONE accessor rather than four, because the values move together on
rotation and separate accessors invite a torn read. On the web the numbers
come from `env(safe-area-inset-*)` read off an inert probe element, since CSS
environment variables are not exposed to script any other way; that needs
`viewport-fit=cover` in the viewport meta, and reports zeros without it —
which is correct (nothing is obscured) rather than broken. Natively they come
from `safeAreaInsets` and `WindowInsets`.

**`useScreenOrientation`** is deliberately read-only. Locking does not cross:
`screen.orientation.lock()` is Chromium-only and fullscreen-gated on the web,
and on iOS orientation is an app-level declaration
(`supportedInterfaceOrientations`), not something a view can request. A
`lock()` that silently no-ops on two of three targets is worse than a surface
that states what it covers. `type` is normalised to `'portrait' | 'landscape'`
— the part true everywhere — and the primary/secondary distinction the web
exposes lives in `angle`, so nothing is lost.

Both runtimes read THROUGH on every access rather than caching at
construction: a rotation, fold or Stage Manager resize moves them while the
app is live, and a captured value would silently describe the old display.
Both native suites assert that by mutating the probe after construction.
