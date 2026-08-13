---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

Lower `useDebouncedCallback` and `useThrottledCallback`

Both emitted verbatim, so a debounced save or a throttled scroll handler
compiled clean and never fired on device.

Unlike `useDebouncedValue`, these need a **runtime**: they return a callable
carrying `.cancel()` / `.flush()`, so there is a handle a caller reaches and a
latest-args slot to hold. A `.task(id:)` has no identity to offer. This adds
`PyreonRateLimit` — co-located in `@pyreon/hooks/native`, on both platforms.

**The edges are the contract, and were measured on the web before either port
existed** — two native ports would otherwise agree with each other on the
wrong ones:

- debounce → **no** leading edge; nothing fires until the caller goes quiet
- throttle → leading edge **and** a trailing one, carrying the latest args

Three design decisions worth stating:

- **Throttle is modelled as a WINDOW, not a clock.** The web compares
  `Date.now()` against the last invocation; porting that would make the
  runtime either untestable without real waiting or dependent on a fake clock
  whose advance rate is its own source of divergence. A window is observably
  identical and needs neither.
- **The scheduler is injected**, so both state machines are exercised
  synchronously with no real clock. Both native test programs RUN in the
  co-source gate. A timing test that actually sleeps is a timing test that
  eventually flakes on a loaded runner.
- **Swift attaches the action post-init.** A `@State` initializer runs before
  `self` exists, so a closure capturing sibling state cannot be passed to
  `init` — the emit binds it in `.onAppear`, the same late attachment
  `PyreonForm`'s `onSubmit` already uses.

Kotlin's default scheduler is a `java.util.Timer` task rather than a
`CoroutineScope`: a scope handed to a long-lived limiter either outlives the
composable that made it or is cancelled under it, and a Timer task is
cancellable by token with neither hazard.

A multi-argument callback declines BY NAME — the runtime carries one, and
silently dropping the rest would produce a callback that runs with the wrong
data rather than one that visibly does not run.
