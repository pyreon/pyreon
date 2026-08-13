---
'@pyreon/native-compiler': minor
---

Lower `useToggle` and `useCounter` — pure state needed a lowering, not a runtime

Both are pure state containers: a signal plus a few mutators, with no platform
dependency at all. Neither lowered, so the call emitted verbatim and the native
build failed with `cannot find 'useToggle' in scope`.

That is the shape of most of the unlowered hook surface. Of `@pyreon/hooks`'
56 exported hooks, 22 lower; roughly a dozen of the remainder are logic both
targets already have (`usePrevious`, `useDebouncedValue`, `useInterval`,
`useTimeAgo`, …). This closes the first two and establishes the pattern.

The state becomes a plain `@State` / `mutableStateOf` field and every mutator
is rewritten at its USE SITE into the arithmetic it stands for — no runtime,
no wrapper type, and `useCounter`'s clamp visible in the emitted output. The
clamp expression is written once and shared by both emitters, because a
counter that clamped differently per platform is precisely the divergence a
shared helper prevents.

Values that cannot be baked in decline BY NAME rather than silently dropping:
a non-literal initial value, and — the one that matters — a non-literal bound,
which would otherwise emit a counter that simply stopped clamping on device.

Measured against the web rather than between the two targets: the web arm in
`@pyreon/hooks` pins the semantics both emits reproduce, including the subtle
one — `reset()` restores the CLAMPED initial, not the raw argument, so an
out-of-bounds seed cannot reappear. Both emits compile on real `swiftc` and
`kotlinc`.
