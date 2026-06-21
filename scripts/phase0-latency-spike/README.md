# Phase 0 latency micro-spike — JS↔native boundary cost

The multiplatform strategy ([`.claude/plans/multiplatform-runtime-native-strategy.md`](../../.claude/plans/multiplatform-runtime-native-strategy.md))
proposes a **signal-driven native runtime** (Option B): drive real native
widgets at runtime, with **one signal write → one native mutation command**
across a JS↔native boundary, instead of transpiling to SwiftUI/Compose at build
time. The whole bet rests on one number: **is that crossing cheap enough at
60fps?**

`harness.swift` measures it, isolating the *crossing* (the Option-B-specific
cost) with a near-no-op native function — the real widget mutation/layout/render
cost is unavoidable in any native-UI architecture and is deliberately excluded.

## Run it yourself (don't trust the numbers — reproduce them)

```sh
cd scripts/phase0-latency-spike
swiftc -O harness.swift -framework JavaScriptCore -o harness && ./harness
```

macOS only (it ships JavaScriptCore). Absolute numbers are machine-dependent;
the **order of magnitude** vs the 60fps frame budget is the signal.

## Measured (one run, Apple M3 Max / macOS 26.5 / Swift 6.3, JavaScriptCore)

| crossing | cost |
|---|---|
| JS→native `setText(Int, String)` (signal→mutation) | **p50 ~0.65 µs, p99 ~0.83 µs** (10M sustained crossings, tight distribution — no GC blowup) |
| native→JS `onEvent(v)` (event→handler) | **median ~0.7–3.4 µs** (≈5× run-to-run variance observed), worst-run up to ~11 µs |

~25,000 JS→native crossings fit in one 16.6 ms (60fps) frame at p50. Both
directions are **~100–300× under** the strategy's `<100 µs/write` go/no-go
threshold. **The boundary crossing is not the bottleneck on the JSC/iOS-family
side.**

## What this does NOT establish (read before citing it)

A PASS here de-risks the **crossing sub-question only**. It is *necessary, not
sufficient* for Option B. Unmeasured:

- **Real workload** — the native body is a no-op/string stand-in. The real
  SwiftUI `setText` on a live view + layout + render is the dominant per-frame
  cost and is **not** measured here.
- **On-device iPhone CPU** — this is macOS JavaScriptCore (same engine family,
  not the same silicon/thermal envelope).
- **Android / V8 / QuickJS** — a different engine, entirely unmeasured (no
  Android emulator in the measurement environment).
- **Full reactive graph in JS on device** — signal propagation, effect
  scheduling, the keyed-list reconciler — unmeasured.
- **GC under a real animated app** — the tight batch distribution is a proxy,
  not a running animation with allocation churn.
- **Cold-start** (engine init + bytecode parse), **cross-thread bridging**, and
  the **reverse-direction variance** root cause.

These are the bulk of Phase 0. This harness is the cheapest slice — it answers
"is the crossing affordable?" (yes, on JSC) before anyone builds the rest.
