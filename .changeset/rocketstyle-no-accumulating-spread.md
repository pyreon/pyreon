---
"@pyreon/rocketstyle": patch
---

perf(rocketstyle): replace O(n²) accumulating-spread reduces with mutate-accumulator

`removeNullableValues`, `chainOrOptions`, and `chainReservedKeyOptions` built
their result objects with `reduce((acc, x) => ({ ...acc, ... }), {})` — spreading
the accumulator every iteration is O(n²) in the number of keys. These run on the
rocketstyle reserved-keys / dimension pipeline per component definition. Switched
to mutate-and-return (`acc[k] = v; return acc`) — behavior-identical, O(n). No
public API change; all 308 rocketstyle tests pass unchanged.
