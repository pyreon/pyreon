---
'@pyreon/native-compiler': patch
---

A bare `z.object({ … })` (or `v.object`, an arktype `type(…)`) outside a Pyreon adapter is no longer a silent failure. PMTC reads zod / valibot / arktype only through `zodSchema(…)` / `valibotSchema(…)` / `arktypeSchema(…)` from `@pyreon/validation` (or the first-party `s` from `@pyreon/validate`); anything else was re-emitted verbatim — `private let User = z.object((name: …))` — which neither swiftc nor kotlinc accepts, with no diagnostic from the compiler. A schema-library import that survives into the emitted file is now reported by name, with the adapter that would lower it, judged by survival exactly like an unlowered Pyreon export (so a schema an adapter consumed draws nothing, and `import * as v from 'valibot'` is covered through its namespace).
