---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A local declared inside a nested block (an `if` branch, a `try` body, a loop body, a `switch` case) is now typed for inference on iOS and Android. Before, only a nested local whose type was optional was recorded, so every type-gated lowering of such a local missed: `try { const r = rec(text); return Object.keys(r).join(',') } catch { … }` over a `Record` emitted an empty array with an "Object.keys(...) has no native equivalent" warning, where the same code at function level lowers to the record's keys.

The generated native chart engine is regenerated with the new emit: integer counters declared inside loops now add through the overflow-checked `pyreonAdd` / `pyreonSub` like function-level ones, and divisions between locals already known to be `Double` drop their redundant `Double(…)` / `.toDouble()` casts.
