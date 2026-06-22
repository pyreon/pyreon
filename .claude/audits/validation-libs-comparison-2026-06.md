# Validation libraries — deep comparison & quality audit

**Pyreon `@pyreon/validate` `s`-runtime (v1) vs Zod 4.4.3 / Valibot 1.4.1 / ArkType 2.2.0**

Date: 2026-06-22 · Machine: Apple Silicon (darwin/arm64), Node 24.3.0, `NODE_ENV=production` · All numbers are **real measurements** from running the four libraries head-to-head — no fabricated figures. Reproduce with the harnesses in `packages/fundamentals/validate/bench/` (`validation.ts` = perf, `behavior.ts` = error/adversarial/conformance, `typecheck.ts` = type inference).

---

## 1. TL;DR verdict

Pyreon's `s` validator is a **lean, correct, Standard-Schema-native primitive/flat-object validator with an excellent error path and best-in-class-but-one bundle size — but it is *not* a general-purpose schema library and is the slowest of the four at parsing valid objects/arrays.** Concretely: it ships in **3.9 KB gz** (2nd-leanest, ~16× smaller than Zod, ~12× smaller than ArkType; Valibot's 1.76 KB still beats it), its type inference is **exactly precise** (bidirectionally equal to the hand-written target, on par with Zod/Valibot), and on the **error/invalid path it ties Valibot for fastest** (≈20–40× faster than Zod/ArkType for primitives). But it covers only ~25% of Zod's feature surface — **no unions, records, tuples, dates, bigint, coercion, `.pick`/`.omit`/`.partial`, `superRefine`, or recursive schemas** — and on the **valid happy-path it is the slowest**, 8.4× slower than ArkType and ~3× slower than Valibot on a 4-field object, 17.8× slower than ArkType on a 20-item array. It is a genuinely good fit for Pyreon form fields and simple flat DTOs where bundle size + reactive/i18n integration matter; it is **not** a drop-in Zod replacement for modeling real API/domain schemas today.

**Verdict by dimension:** Bundle 🥈 (behind Valibot) · Error-path perf 🥇 (tied Valibot) · Type inference 🥇 (tied Zod/Valibot) · Std-Schema + i18n DX 🥇 · Valid-path perf 🔴 (last) · Feature completeness 🔴 (far behind).

---

## 2. Performance (median ns/op, lower = faster)

| Scenario | Pyreon `s` | Zod 4 | Valibot | ArkType | Fastest |
| --- | --- | --- | --- | --- | --- |
| `string.email` **valid** | 44 | 78 | 46 | **37** | ArkType (Pyreon 1.2×) |
| `string.email` **invalid** | **58** | 2500 (43×) | 126 | 1190 (20×) | **Pyreon** |
| `number.int.range` **valid** | 39 | 49 | 23 | **12** | ArkType (Pyreon 3.3×) |
| `number.int.range` **invalid** | 66 | 1830 (28×) | **64** | 1030 (16×) | Valibot ≈ Pyreon |
| `object.user` (4-field) **valid** | 393 (8.4×) | 227 | 134 | **47** | ArkType — **Pyreon last** |
| `object.user` (4-field) **invalid** | 1180 | 5440 | **787** | 5460 | Valibot (Pyreon 2nd) |
| `array` (20 objects) **valid** | 3434 (17.8×) | 1984 | 1574 | **193** | ArkType — **Pyreon last** |

**Interpretation (honest):**

- **ArkType owns the valid path.** It JIT-compiles each schema into a monomorphic validator function; on objects/arrays it is 8–18× faster than Pyreon and ~3× faster than Valibot. This is a real architectural advantage, not a measurement quirk — it pays a cold-start compile (warmed out here) to win every steady-state valid parse.
- **Pyreon + Valibot own the error path.** Zod 4 and ArkType build rich error objects (Zod's `ZodError` tree, ArkType's `ArkErrors` with human summaries) and pay 16–43× more than Pyreon/Valibot on invalid primitives. Pyreon's `Result.issues` construction is deliberately cheap. This is a genuine Pyreon strength for validation-heavy/error-heavy workloads (forms with live feedback).
- **Pyreon is the slowest at valid object/array parsing.** Root cause is architectural: Pyreon compiles a *per-schema closure* and the parse allocates a `Result` per nested field, dispatching through the cached closure for each child. ArkType inlines everything into one compiled function; Valibot uses flat, allocation-light validation functions. Pyreon's "compile ops to a closure on first parse" amortizes method-dispatch but does **not** flatten nested composition the way ArkType's JIT does — so cost scales with nesting/array length more steeply. A 20-element array is 3.4 µs vs ArkType's 0.19 µs.

**Net:** for primitive validation Pyreon is competitive (1–3× of the leader); for nested/bulk valid parsing it is clearly behind; for the error path it is best-in-class. There is real headroom in the object/array parse path.

---

## 3. Bundle size — cost to ship the equivalent 4-field user schema

esbuild `--bundle --minify --format=esm`, `NODE_ENV=production`, gzip -9:

| Library | Minified | **Gzipped** | vs Pyreon |
| --- | --- | --- | --- |
| **Valibot** | 5.2 KB | **1.76 KB** | 0.45× (leanest) |
| **Pyreon `s`** | 16.0 KB | **3.92 KB** | 1.0× |
| **ArkType** | 153 KB | **46.9 KB** | 12.0× |
| **Zod 4** | 327 KB | **64.6 KB** | 16.5× |

This is a **real Pyreon win** and the dimension where it most clearly beats the incumbents: shipping a small validator costs 3.9 KB with Pyreon vs **65 KB with Zod** or **47 KB with ArkType** — both of which pull most of their runtime in even for a trivial schema (Zod 4 tree-shakes poorly here; ArkType ships its type-parser). Valibot's modular function design still wins outright (1.76 KB) — it is the bundle benchmark to beat. Pyreon's 3.92 KB matches its own documented "~3.9 KB with the runtime" claim exactly (a good internal-honesty signal). Note: a Pyreon consumer importing **only** the DX helpers (no `s` runtime) is ~0.5 KB.

---

## 4. Type-inference quality (empirical, `tsc --strict --exactOptionalPropertyTypes`)

Bidirectional type-equality (`Equal<Infer<S>, Target>`) against a hand-written target type, verified by compiling:

| Check | Pyreon | Zod | Valibot | ArkType |
| --- | --- | --- | --- | --- |
| 4-field object output type exact | ✅ | ✅ | ✅ | ⚠️ field-correct, brand-distinct¹ |
| optional key → `b?: T` (not just `\| undefined`) | ✅ | — | — | — |
| `transform(number → string)` output type | ✅ | (n/a here) | (n/a here) | (n/a here) |
| `.brand<'UserId'>()` phantom typing | ✅ | (n/a here) | (n/a here) | (n/a here) |

¹ ArkType infers every field at exactly the right type (`name:string, age:number, email:string, tags:string[]` — verified per-field) and its object type is **mutually assignable** with the plain target, but it is not strict-`Equal` because ArkType carries extra constraint-aware type metadata. That is a *richer* inference, not a wrong one.

**Finding: Pyreon's `Infer` is precise and correct.** It produced an exact bidirectional match to the hand-authored type under `strict` + `exactOptionalPropertyTypes`, including the three cases most validators get subtly wrong — optional-key `?:` marking, transform input-vs-output divergence (`TransformSchema<TIn,TOut>`), and brand phantom typing. This is on par with Zod and Valibot. The honest caveat: Pyreon has **far fewer combinators**, so there are simply fewer inference paths to get wrong — its correctness is real but tested over a smaller surface.

---

## 5. Feature completeness — Pyreon `s` is a deliberate v1 subset

Enumerated from each lib's actual exports (Zod **238** top-level exports, Valibot **311**, ArkType full string-DSL) vs Pyreon's `src` surface.

| Capability | Pyreon `s` v1 | Zod 4 | Valibot | ArkType |
| --- | --- | --- | --- | --- |
| string / number / boolean | ✅ | ✅ | ✅ | ✅ |
| literal / enum | ✅ | ✅ | ✅ | ✅ |
| object / array | ✅ | ✅ | ✅ | ✅ |
| **union / discriminated union** | ❌ | ✅ | ✅ | ✅ |
| **record / tuple / map / set** | ❌ | ✅ | ✅ | ✅ |
| **intersection** | ❌ | ✅ | ✅ | ✅ |
| **bigint / date / symbol / null / undefined / void / nan** | ❌ | ✅ | ✅ | ✅ |
| **template literal** | ❌ | ✅ | ✅ | ✅ |
| **lazy / recursive** | ❌ | ✅ | ✅ | ✅ |
| optional / nullable / nullish / default | ✅ | ✅ | ✅ | ✅ |
| **`.pick` / `.omit` / `.partial` / `.required` / `.extend` / `.merge` / `keyof`** | ❌ | ✅ | ✅ | ✅ |
| transform / refine | ✅ | ✅ | ✅ | ✅ |
| **superRefine / catch / readonly** | ❌ | ✅ | ✅ | ⚠️ |
| brand / describe | ✅ | ✅ | ✅ | ✅ |
| **coercion** | ❌ | ✅ (`z.coerce`) | ✅ (pipe) | ✅ |
| string formats (email/url/uuid/regex) | ✅ (4 + min/max/trim/...) | ✅ (~30: incl. ip/cidr/jwt/cuid/datetime/emoji/base64) | ✅ (large) | ✅ (large) |
| number checks (int/min/max/multipleOf/...) | ✅ | ✅ | ✅ | ✅ |
| async validation | ✅ (`parseAsync`) | ✅ | ✅ | ✅ |
| **JSON Schema in/out** | ❌ | ✅ | ⚠️ (via plugin) | ⚠️ |
| Standard Schema (`~standard`) | ✅ native | ✅ | ✅ | ✅ |
| **framework-native reactivity** (`parseReactive`) | ✅ unique | ❌ | ❌ | ❌ |
| **i18n field metadata + error keys** (`withField`/`formatErrors`) | ✅ unique | ⚠️ (error maps) | ⚠️ | ⚠️ |

**Blunt read:** Pyreon `s` covers roughly a quarter of Zod's surface. The missing primitives are not edge cases — **no `union`, `record`, `tuple`, `date`, `bigint`, or `coercion` means you cannot model most real-world API payloads, discriminated event types, ID maps, or date fields.** Pyreon's own `v1.ts` documents these as explicitly out-of-scope. Two capabilities Pyreon has that the others lack natively are real differentiators: **signal-reactive parsing** (`parseReactive` → `Computed<ParseResult>` for live form validation) and **first-class i18n field metadata** (`withField` + `formatErrors` resolving `{key, params, fallback}` through a `t` function).

---

## 6. Error output, Standard Schema conformance & DX

**Standard Schema:** all four implement `~standard` v1 natively — `vendor`: `pyreon-validate` / `zod` / `valibot` / `arktype`. Pyreon drops into any StdSchema consumer (`@pyreon/form`, `@pyreon/feature`) with no adapter. ✅

**Error reporting (multi-error invalid input `{name:"A", age:999, email:"nope", tags:["ok",42]}`):** all four report **all 4 errors** (none stop at first) with **precise nested paths** including `tags[1]`. Shapes:

- **Pyreon** — `{ path, code, message }` + i18n `{ key, params, fallback }`. Codes: `too_small`/`too_big`/`invalid_format`/`wrong_type`.
- **Zod 4** — `error.issues[]` with `code`/`path`/`message`; richest human messages.
- **Valibot** — issue objects with `path`/`message` (`type`-tagged); no built-in i18n keys.
- **ArkType** — `ArkErrors` with a `.summary` human string (`"age must be at most 150 (was 999)\n..."`).

**DX overlay (Pyreon-unique):** beyond the runtime, `@pyreon/validate` ships helpers that work on **any** StdSchema validator (Zod/Valibot/ArkType included): `withField(schema, meta)` (attach label/hint/placeholder/i18n keys via a Symbol slot, preserving the original schema), `parseReactive(schema, signal)` (re-validate on signal change → `Computed<ParseResult>`), and `formatErrors(issues, t)` (resolve issue keys through i18n). This is a genuine differentiator: Pyreon is the only one of the four with built-in reactive + i18n form integration.

---

## 7. Adversarial correctness — one real gap

Fed tricky inputs through the equivalent schemas in all four (✓ accept / ✗ reject):

- **Numbers** (`int 0..150`): all four **identical** — reject `NaN`, `Infinity`, `"42"` (no silent coercion), `42.5`, `151`, `MAX_SAFE_INTEGER+1`; accept `0`, `150`, `-0`. ✅ Pyreon correct.
- **Strings** (`min(2)`): all four **identical** — `""`/`"a"` reject; `"  "` (2 spaces) and `"👍"` (1 emoji = 2 UTF-16 units) accept (all count `.length` code units, not graphemes). ✅ Pyreon matches consensus.
- **Unknown keys**: Pyreon **strips by default** (output omits extra keys) — matches Zod and Valibot. ArkType is the outlier (keeps unknown keys by default). ✅ Pyreon in the majority/safer camp.
- **Prototype pollution** (`JSON.parse` with a `__proto__` payload): **all four safe** — none mutate `Object.prototype`. ✅
- **⚠️ EMAIL STRICTNESS — Pyreon is the outlier and looser:** Pyreon **accepts `a@b.c`** (single-character TLD) while **Zod, Valibot, and ArkType all reject it**. Pyreon's email regex (`primitives/string.ts`) is more permissive than the modern consensus. For `a@b` and `foo@bar` all four reject; for IDN/punycode `x@xn--80ak6aa92e.com` Pyreon/Zod/ArkType accept but Valibot rejects. **This is a real correctness gap** — Pyreon's email validation will pass addresses the other three (correctly) reject. Recommend tightening the regex to match the HTML5/Zod-4 standard.

---

## 8. Honest positioning — when to pick Pyreon `s`, and when not

**Pick Pyreon `s` when:**
- You're validating **Pyreon form fields / simple flat DTOs** (string/number/boolean/enum + one level of object/array) and want **zero extra heavy deps** — 3.9 KB vs Zod's 65 KB matters for a small app.
- You want **reactive validation** (`parseReactive`) and **i18n error messages** out of the box, integrated with `@pyreon/form` / signals.
- Your workload is **error-heavy** (live form feedback) — the cheap error path is a measurable win.

**Do NOT pick Pyreon `s` (use Zod / Valibot / ArkType) when:**
- You need **unions, discriminated unions, records, tuples, dates, bigint, or coercion** — i.e. almost any real API/domain schema. Pyreon `s` v1 simply cannot express these.
- You need **maximum valid-parse throughput on large/nested data** — ArkType is 8–18× faster; even Valibot is ~3×.
- You need the **smallest possible bundle** — Valibot (1.76 KB) beats Pyreon.
- You need **`.pick`/`.omit`/`.extend`/`.partial`**, JSON-Schema export, or `superRefine`.

**Note:** the Pyreon **DX helpers** (`withField`/`parseReactive`/`formatErrors`) are the best of both worlds — they wrap **any** StdSchema validator, so the recommended pattern today is **Zod-or-Valibot for the schema + Pyreon's DX overlay for reactive/i18n form integration**. The `s` runtime is the lightweight option for when you don't want the heavy dep at all.

---

## 9. What it would take for `s` to be a credible Zod alternative

In rough priority (the gaps that block real-world use):
1. **`union` + `discriminatedUnion`** — the single biggest blocker; most domain models need them.
2. **`record`, `tuple`** — API maps and fixed-shape arrays.
3. **`date`, `bigint`, `null`/`undefined`** primitives.
4. **`coerce`** (string→number/date/boolean) — universal form-input need.
5. **Object algebra** — `.pick`/`.omit`/`.partial`/`.required`/`.extend`/`.merge`.
6. **Object/array parse-path perf** — flatten nested composition (codegen or a single compiled closure for the whole tree, like ArkType) to close the 8–18× valid-path gap; the per-field `Result` allocation is the hot spot.
7. **Tighten the email regex** to the HTML5/Zod-4 standard (correctness, see §7).
8. Tighter formats (uuid versions, datetime, ip/cidr) if competing on format breadth.

The framework's docs already gesture at a compiler-emit path (`analyzeValidate()` emitting typia-class specialized validators); that is the credible route to closing the valid-path perf gap without hand-writing a JIT.

---

## 10. Methodology & caveats

- **Real deps**, real measurements: Zod 4.4.3 / Valibot 1.4.1 / ArkType 2.2.0 (devDeps of `@pyreon/validate`); Pyreon `s` from source.
- **Perf**: warmup (5k iters) then median ns/op over 12 runs × 50k iters, `NODE_ENV=production`, idiomatic parse per lib (`s.parse` / `z.safeParse` / `v.safeParse` / `arktype(input)`). Stable across two runs (numbers within noise). ArkType warmed past its JIT cold-start.
- **Bundle**: esbuild bundle+minify+gzip of an entry importing only what the 4-field schema needs.
- **Type inference**: real `tsc --strict --exactOptionalPropertyTypes` bidirectional equality.
- **Caveats**: single machine, single Node version (24, V8) — absolute ns are machine-dependent; the **ratios** are the portable signal. Results are **schema-shape-dependent** — a different schema mix would shift the perf picture (e.g. union-heavy schemas can't even be expressed in Pyreon). This audits Pyreon `s` **v1**, an explicitly minimal release; the comparison is fair on the subset Pyreon supports and explicit about everything it doesn't. The benchmark author is also the framework author — the honest control here is that every number is reproducible from the committed harnesses and the comparison leads with Pyreon's losses.
