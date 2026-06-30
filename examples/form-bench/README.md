# @pyreon/form-bench

Tier-B, real-browser, cross-framework form benchmark — **Pyreon vs React Hook
Form** (MVP; more frameworks + scenarios are the next phases). The companion to
the headless Tier-A store-primitive bench in
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

# In-browser (click-to-run, both frameworks one page — convenience only):
bun run dev                             # open the page, click "Run"
#   ?framework=Pyreon | ?framework=React%20Hook%20Form  — one framework
#   ?auto=1                                              — both, on load
```

## Layout

| Path | Role |
| --- | --- |
| `shared/schema.ts` | The ONE zod schema, used verbatim by every framework |
| `shared/scenarios.ts` | Framework-agnostic scenario contract (`active`/`planned`) |
| `src/runner.ts` | Measurement core — adaptive warmup + 20 runs + median + CI95 + CV (same discipline as `examples/benchmark`) |
| `src/dom.ts` | Real-keystroke driving (`setInput`) + DOM verification helpers |
| `src/impl/pyreon.ts` | Idiomatic `@pyreon/form` impl |
| `src/impl/rhf.ts` | Idiomatic React Hook Form impl |
| `bench-form.ts` | Playwright driver (the canonical run) |

## Status

MVP: 4 scenarios (mount, keystroke-blur, keystroke-change, reset) × 2 frameworks
(Pyreon, RHF). The `validate-submit-invalid` scenario and the Formik / TanStack /
Vue / Svelte / Solid columns are the next increments — see METHODOLOGY.md →
Roadmap. Nothing here is published; it is a benchmark example.
