---
'@pyreon/lathe': minor
---

Spec correctness: lathe now opens and generates working clients for real-world specs.

- **YAML is read by the `yaml` package** (YAML 1.2 core), configured strictly. The previous hand-written reader refused GitHub, Stripe, OpenAI, Twilio and DigitalOcean outright and silently corrupted block scalars, `\u` escapes and duplicate keys in the files it did open (31 of 57 micro-cases diverged). Anchors, aliases and merge keys now resolve; duplicate keys, multi-document streams, custom tags, recursive aliases and `.inf`/`.nan` are refused with a line number. A UTF-8 BOM is accepted on the JSON path too.
- **Generated schemas no longer throw at import.** An implicit discriminator (plain-string tags, OpenAI) or one over non-object members degrades to a plain union with a note; a snake_case discriminator keeps its wire name; an enum is its own IR kind so string constraints no longer chain onto `s.enum(...)` (DigitalOcean); a dependency reached only through a nullable/array/union wrapper is emitted before its dependent (Twilio/OpenAI/DigitalOcean TDZ).
- **Nullability is resolved on every node**: 3.0 `nullable` on component models, 3.1 `type: [X, 'null']` on models, and `{type: 'null'}` is real `null` (was `unknown`, which accepted anything). GitHub's own `components.examples` rejected for lathe-caused reasons (audit baseline → now): null 18 → 0 and URI 14 → 0 on 3.0, null 4 → 0 and URI 14 → 0 on 3.1.
- `enum`/`const` of numbers, booleans and null; `format: uri` no longer uses the http-only `.url()`; 3.0 boolean and 3.1 numeric exclusive bounds; `multipleOf` (float-safe for fractional steps); `minItems`/`maxItems`/`uniqueItems`; string/number constraints on array items and alias models.
- IR: `IrType` gains `enum` and `nullable` kinds and per-kind constraints; `IrField.nullable`/`min`/`max`/`pattern` are gone (nullability and constraints live on the type).
