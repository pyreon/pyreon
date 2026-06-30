# @pyreon/form-bench

Tier-B, real-browser, cross-framework form benchmark — **Pyreon vs the six most
popular form libraries across the ecosystem**: React Hook Form, TanStack Form,
Formik (React), vee-validate (Vue), Felte (Svelte), and `@modular-forms/solid`
(Solid — the true fine-grained-signal peer). The companion to the headless
Tier-A store-primitive bench in
`packages/fundamentals/form/bench/form-bench.ts`.

Read **[METHODOLOGY.md](./METHODOLOGY.md)** first — it is the fairness + honesty
contract (idiomatic-per-framework, shared zod schema, per-framework commit
boundary, per-run resets, DOM verification, CI95/CV/tied detection, retained
heap) and states the author-judge limit plainly.

## Run

```bash
# Canonical objective run — production build + Playwright + per-framework page
# isolation + forced GC + retained heap. Prints a median ± CI95 table.
bun bench-form.ts
bun bench-form.ts --repeat 5            # pool 5×20=100 samples/scenario for tighter CI
bun bench-form.ts --json out.json       # also dump JSON

# Bundle-size dimension — gzipped weight of a minimal validated form per lib
# (baseline runtime, full runtime+form, and the DELTA = marginal form cost):
bun run bundle-size

# In-browser (click-to-run, all frameworks one page — convenience only):
bun run dev                             # open the page, click "Run"
#   ?framework=Pyreon | ?framework=Formik | ...          — one framework
#   ?auto=1                                              — all, on load
```

## Layout

| Path | Role |
| --- | --- |
| `shared/schema.ts` | The ONE zod schema, used verbatim by every framework |
| `shared/scenarios.ts` | Framework-agnostic scenario contract (`active`/`planned`) |
| `src/runner.ts` | Measurement core — adaptive warmup + 20 runs + median + CI95 + CV (same discipline as `examples/benchmark`) |
| `src/dom.ts` | Real-keystroke driving (`setInput`) + DOM verification helpers |
| `src/impl/pyreon.ts` | Idiomatic `@pyreon/form` (`register` + signals) |
| `src/impl/rhf.ts` | React Hook Form (uncontrolled `register` + `zodResolver`) |
| `src/impl/tanstack.ts` | TanStack Form (controlled `form.Field` + standard-schema) |
| `src/impl/formik.ts` | Formik (controlled `useFormik` + manual zod validate) |
| `src/impl/vue.ts` | Vue + vee-validate (`useForm`/`defineField`, `h()` render fns) |
| `src/impl/svelte.ts` + `FormBench.svelte` | Svelte + Felte (`use:form` + validator-zod) |
| `src/impl/solid.ts` | Solid + `@modular-forms/solid` (low-level, no Solid-JSX) |
| `bench-form.ts` | Playwright driver (the canonical run; `--only "<name>"` to filter) |

## Status

4 scenarios (mount, keystroke-blur, keystroke-change, reset) × **7 frameworks**
(Pyreon + React Hook Form / TanStack Form / Formik / Vue / Svelte / Solid) — all
real-browser, idiomatic, shared zod schema, with speed + retained heap. Bundle
size (`bun bundle-size.ts`) covers Pyreon + the React libs today. The
`validate-submit-invalid` scenario, the non-React bundle sizes, and the extra
scenarios (field-array, cross-field, bulk setValues, isolation proof) are the
next increments — see METHODOLOGY.md → Roadmap. Nothing here is published.
