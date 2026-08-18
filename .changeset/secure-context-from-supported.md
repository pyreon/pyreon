---
'@pyreon/hooks': patch
---

The secure-context diagnostic now also fires from a hook's capability accessor, not only when you try to use the API.

It was wired at the bail paths — `acquire()`, `start()`, `copy()`. But the idiomatic shape branches on the capability instead:

```tsx
<Show when={() => lock.supported()} fallback={<Unsupported />}>
```

An app written that way is correct, degrades gracefully, and never reaches a bail path — so it never learned that the only thing wrong was the origin. That is the same silent dead end the diagnostic exists to remove. The four gated hooks exposing a capability accessor (`useDeviceMotion`, `useAudioRecorder`, `useBluetooth`, `useWakeLock`) now report from there too.

Safe from an accessor because the warning is memoized per hook: a `supported()` read inside a render loop still produces exactly one line.
