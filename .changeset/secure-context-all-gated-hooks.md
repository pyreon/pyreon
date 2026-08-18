---
'@pyreon/hooks': patch
'@pyreon/zero': patch
---

Wire the secure-context diagnostic into every gated hook, and correct which hooks are gated.

`https()` shipped with the diagnostic wired into three hooks — `useGeolocation`, `useShare`, `useWakeLock` — while the docs and changeset said "hooks that need a secure context now explain why they are unavailable", which reads as all of them. Five were silent: `useDeviceMotion`, `useAudioRecorder`, `useBluetooth`, `useClipboard`, `useNotifications`. All eight now report the cause.

The list itself was also wrong in the other direction. Three hooks were described as secure-context-gated and are not: `useCamera` uses an `<input type="file" capture>` picker, which works over plain HTTP; `useSpeech` uses `speechSynthesis`, which is not gated (only SpeechRecognition is); and `usePush` is host-driven, with the app owning the PushManager flow. Warning for those would send someone to configure TLS for a problem TLS cannot fix, so they are deliberately excluded.

A new static test (`secure-context-coverage.test.ts`) asserts the coverage in both directions: every hook that accesses a gated API must call `warnIfInsecureContext` with its own name, and the check is keyed on the API ACCESS rather than a hook-name list, so a mention in a comment does not count. It has to be static — the diagnostic fires only when `isSecureContext === false`, and a happy-dom suite is always a secure context, so no behavioural test can distinguish a wired hook from an unwired one.
