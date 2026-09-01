---
'@pyreon/charts': patch
---

Engine: coalesce-first optional idioms — `spec.progress ?? 1.0`, `spec.xValues ?? []`, `s.curve ?? identity`, `resolveYDomain` via `?? deriveYDomain(spec)`, annotation guards binding coalesced values before their presence checks. Value-preserving on web (full suite green); these are the shapes Swift can compile, since it does not narrow optionals through ternaries or compound guards.
