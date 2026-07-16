---
"@pyreon/url-state": patch
---

perf(url-state): leaner number deserialize + a fairer, statistically-honest nuqs bench

- The inferred number serializer's `deserialize` drops both call sites on the hot
  path — `+raw` (the same strict ToNumber as `Number(raw)`) and the `n === n`
  self-compare NaN check (NaN is the only value that `!==` itself). Behavior is
  byte-identical: `'' → 0`, whitespace/hex per ToNumber, `NaN → default`.
- The nuqs head-to-head bench is upgraded to the repo's strongest protocol:
  per-(op × impl) process isolation (×3 pooled), bootstrap CI95 + 🤝 tie markers,
  and a parser-class disclosure — the old bench compared nuqs's `parseAsInteger`
  (a cheaper integer-prefix scan) against Pyreon's float parser. Both peers are
  now measured: vs `parseAsInteger` (the `?page=1` use-case peer) the scalar rows
  are statistical ties; vs `parseAsFloat` (the semantics-matched peer) Pyreon
  wins outright. Array/boolean rows remain 2.3–6.2× wins.
