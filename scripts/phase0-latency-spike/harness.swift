// Phase 0 latency micro-spike — JS<->native boundary cost.
//
// Context: the multiplatform strategy (.claude/plans/
// multiplatform-runtime-native-strategy.md) proposes a signal-driven NATIVE
// RUNTIME (Option B): instead of transpiling to SwiftUI/Compose at build time,
// drive real native widgets at runtime, with one signal write -> one native
// mutation command across a JS<->native boundary. The whole bet rests on one
// number: is that crossing cheap enough at 60fps? This harness measures it.
//
// It isolates the CROSSING (the Option-B-specific cost). The native widget op
// itself (setText on a live view, layout, render) is unavoidable in ANY
// native-UI architecture, so the native function body here is a near-no-op.
//
// Build + run (macOS, ships JavaScriptCore):
//   swiftc -O harness.swift -framework JavaScriptCore -o harness && ./harness
//
// HONEST BOUNDS — what this does and does NOT establish:
//   ✓ measures: raw JS<->native call cost, both directions, steady state,
//     macOS JavaScriptCore, synchronous same-thread, simple/string args.
//   ✗ does NOT measure: on-device iPhone CPU (macOS JSC is the same engine
//     family, not identical); Android/V8 (different engine, unmeasured); the
//     real SwiftUI mutation + layout + render cost (no-op'd here); the full
//     reactive graph running in JS; GC under a real animated app (only proxied
//     by the batch distribution below); cold-start; cross-thread bridging.
//   => A PASS here de-risks the CROSSING sub-question only. It is necessary,
//      not sufficient, for Option B. The rest is the bulk of Phase 0.

import Foundation
import JavaScriptCore

func us(_ ns: Double) -> String { String(format: "%.3f", ns / 1000.0) }

let ctx = JSContext()!
var sink = 0

// ---- (1) JS -> native (signal -> mutation), realistic setText(Int, String) ----
let setText: @convention(block) (Int, String) -> Void = { _, s in sink = sink &+ s.utf8.count }
ctx.setObject(setText, forKeyedSubscript: "setText" as NSString)
ctx.evaluateScript("function run(n){ for (var i=0;i<n;i++){ setText(i, 'item ' + i); } }")

let BATCH = 50_000
let BATCHES = 200
_ = ctx.evaluateScript("run(\(BATCH))") // warmup
var perOp: [Double] = []
for _ in 0..<BATCHES {
    let t0 = DispatchTime.now().uptimeNanoseconds
    _ = ctx.evaluateScript("run(\(BATCH))")
    let t1 = DispatchTime.now().uptimeNanoseconds
    perOp.append(Double(t1 &- t0) / Double(BATCH))
}
perOp.sort()
func pct(_ p: Double) -> Double { perOp[min(perOp.count - 1, Int(Double(perOp.count) * p))] }
print("=== (1) JS->native setText(Int,String)  [\(BATCHES) batches x \(BATCH) ops] ===")
print("    p50 \(us(pct(0.50))) us/op | p90 \(us(pct(0.90))) us/op | p99 \(us(pct(0.99))) us/op | max \(us(perOp[perOp.count-1])) us/op")
print("    crossings that fit one 16.6ms (60fps) frame at p50: \(Int(16_600_000.0 / pct(0.50)))")

// ---- (2) native -> JS (event -> handler) ----
_ = ctx.evaluateScript("var acc=0; function onEvent(v){ acc += v; return acc; }")
let onEvent = ctx.objectForKeyedSubscript("onEvent")!
let N = 100_000
var rev: [Double] = []
for _ in 0..<11 {
    let t0 = DispatchTime.now().uptimeNanoseconds
    for i in 0..<N { _ = onEvent.call(withArguments: [i]) }
    let t1 = DispatchTime.now().uptimeNanoseconds
    rev.append(Double(t1 &- t0) / Double(N))
}
rev.sort()
print("=== (2) native->JS onEvent(v)  [\(N) ops x 11 runs] ===")
print("    median \(us(rev[5])) us/op | worst-run \(us(rev[10])) us/op")

print("sink=\(sink)")
