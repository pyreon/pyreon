---
"@pyreon/native-compiler": minor
"@pyreon/native-cli": minor
---

Add an experimental, versioned compiler instance API with ordered shared-IR passes and explicitly registered backends. Keep the existing Swift/Kotlin transform API, reject unknown targets, and detect chart runtime imports from parsed declarations rather than source text.

Load explicit local ESM plugins through repeatable `pyreon-native build/check --plugin` flags, including watch and editor diagnostics. Programmatic build/check entry points accept the same configured compiler. Unsupported check targets fail with a usage error instead of silently checking both platforms.

Parse native Flow SVG numeric attributes in linear time, preserving supported decimal/exponent/px spellings and warning on invalid or overflowing values instead of emitting non-finite dimensions.
