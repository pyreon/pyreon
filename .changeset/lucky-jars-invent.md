---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

Add `useDeviceInfo` — describe the device from one call on web, iOS and Android.

`platform` needs no runtime on native: it lowers to a compile-time constant
per target. `model`, `osVersion`, `isTouch` and `screen` come from a
`PyreonDeviceInfo` runtime co-located in `@pyreon/hooks`, with the platform
queries behind an injected probe so the shape is testable with no UIKit, no
Android SDK and no device.

Two deliberate contracts:

**`model` and `osVersion` are empty strings on the web.** The browser cannot
answer them reliably — `navigator.platform` is deprecated, User-Agent Client
Hints are Chromium-only, and parsing the UA string is a well-known source of
answers that look right and rot as browsers change their strings. These are
the fields that end up in analytics and support tickets, where a plausible
wrong answer costs more than a missing one, so empty means "not knowable
here" rather than a guess. Branch on `platform()` before reading them.

**`screen` reads through on every access** instead of caching at
construction. A fold, a rotation or a Stage Manager resize moves it while the
app is live, and a value captured once would silently describe the old
geometry. Both native suites assert this by mutating the probe after
construction.
