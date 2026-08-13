---
'@pyreon/primitives': minor
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

Add `<Audio>` — sound playback on web, iOS and Android.

Mirrors `<Video>` in shape: same `src` dispatch (a bare name is a bundled
asset), the same three-value `onStatusChange` vocabulary
(`waiting`/`playing`/`paused`), and a declarative prop surface rather than a
player-controller hook.

**It is deliberately NON-VISUAL, which is the one place it does not mirror
`<Video>`.** Audio has no view on the native targets — `AVAudioPlayer` and
Media3 are objects, not views — so there is no `controls` prop. The web's
browser-styled control bar has no cross-platform counterpart, and a prop that
silently no-ops on two of three targets is the failure this API family
refuses; `useScreenOrientation` omits `lock()` for exactly the same reason.
Compose a transport from Pyreon primitives and drive it with these props.

`volume` is **clamped** to 0..1 rather than rejected — on all three arms, and
at emit time too, so `volume={1.7}` bakes as `1` and the generated native
source is honest about what will actually play. An out-of-range value is a
caller slip, and refusing to play is a worse answer than the nearest legal
level.

The native host is a concrete zero-size view rather than `EmptyView`: a
modifier attached to `EmptyView` is silently inert, which is how a `<Modal>`
sheet once shipped that never presented. The playback engine is injected on
both targets, so the status machine and the clamp are testable with no
AVFoundation, no Android SDK and no device.

Adds `useAudioRecorder` alongside it — the input half of the same concept.
`start()` resolves `false` on a denied microphone permission rather than
throwing: that is the most likely outcome of the call and an ordinary branch
in any UI that uses it, so callers get an `if` rather than a `try`, matching
`useWakeLock.request()`. `stop()` resolves a URL — an object URL on the web,
a file URL natively — because that is the one representation all three targets
produce and every consumer can use; a zero-length capture resolves `null`
rather than an empty URL that plays nothing. Disposal releases the microphone
tracks, which is what turns the OS recording indicator off.

And `useCamera` — take a photo through the SYSTEM capture UI on every target.
It mirrors `useImagePicker` exactly, because the two differ only in which
system flow they open: `capture()` resolves a URI or `null` and never
rejects, since a cancel and an unavailable camera are the same outcome to a
caller. The system UI owns the permission prompt, so there is no permission
plumbing to get subtly different per platform.

A CUSTOM in-app viewfinder is deliberately out of scope. An AVCaptureSession
layer, a CameraX PreviewView and a `<video>` element are not one thing
wearing three hats, and a surface that only half-crosses is worse than one
that says what it covers — `useNativeModule` is the escape hatch there, as it
is for Bluetooth GATT.

Plus `useSpeech` and `useDeviceMotion`, the last two Tier-1 crossers.

`useSpeech` CANCELS before each `speak()` — queueing is the platform default
on all three, so without it a second press talks over the first instead of
replacing it. Rate, pitch and voice are deliberately out of scope: the
platforms disagree on ranges and on how voices are identified, so one name
would mean three different things.

`useDeviceMotion` has an explicit `start()` rather than listening on mount,
because an always-on hook would be wrong on all three targets: iOS Safari
gates the event behind a gesture-triggered prompt, and both native targets
want start/stop so the sensor is not draining battery for a screen nobody is
looking at. Where `requestPermission` does not exist (everything but iOS
Safari) its ABSENCE is a grant, not a failure.

