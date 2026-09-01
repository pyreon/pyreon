---
'@pyreon/native-compiler': minor
---

A function-type alias (`type Formatter = (v: Double) => string`) substitutes
to its function type at parse.

Previously the alias name reached both targets unresolved — the second of the
two blockers between the chart engine and a native compile. Substitution
rather than a `typealias` emit, deliberately: the emitters' existing
machinery then does everything — the optional form parenthesizes
(`((Double) -> String)?`), and `typeContainsFunction` sees a real function
kind and drops Codable / @Serializable from structs carrying one, which a
name-preserving emit could not do without teaching that check to chase
aliases. Generic function aliases stay out of the subset, unchanged.
