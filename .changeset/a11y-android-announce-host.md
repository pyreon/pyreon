---
'@pyreon/a11y': minor
---

`announce()` now reaches TalkBack on Android without any setup, and keeps its politeness.

Android speaks a live region that is on screen, so `announce()` needed a host. Until now that meant calling `PyreonA11y.setAnnouncer` from the app, and nothing did, so `announce()` compiled and silently did nothing on Android. The compiler now wraps every component that calls `announce()` in `PyreonA11yHost`. That host renders a polite and an assertive live region, so `{ politeness: 'assertive' }` interrupts on Android as it does on iOS and the web. Before, Android ignored the flag.

Breaking for apps that wired an announcer by hand: `PyreonA11y.setAnnouncer(fn)` is replaced by `addAnnouncer(fn)` / `removeAnnouncer(fn)`, and the announcer receives `(message, assertive)`. Most apps can delete their wiring.
