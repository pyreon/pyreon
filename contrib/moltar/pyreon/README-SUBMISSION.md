# Submitting @pyreon/validate to moltar/typescript-runtime-type-benchmarks

[typescript-runtime-type-benchmarks](https://github.com/moltar/typescript-runtime-type-benchmarks)
is where validation libraries are compared publicly — zod, valibot, arktype,
typebox and ~40 others. Getting in there is what turns our own benchmark numbers
from author-written-and-judged into an independent result, the same reason
`contrib/krausest/` exists for the framework benchmark.

`cases/pyreon.ts` is the file to submit. Everything else here is local tooling.

## Run it locally first

```bash
bun contrib/moltar/pyreon/run-local.ts
bun contrib/moltar/pyreon/run-local.ts --libs pyreon,zod,valibot,arktype
bun contrib/moltar/pyreon/run-local.ts --runtime node          # currently FAILS, see below
bun contrib/moltar/pyreon/run-local.ts --validate-version 0.52.0
```

It clones upstream to a scratch dir under `~/.cache/pyreon/` (deliberately NOT
the world-writable OS temp dir — a predictable path there is a symlink-planting
hazard, flagged high by CodeQL on the first version), injects our case,
installs, runs, and prints our four results.

**It measures the PUBLISHED package, not your working tree**, because upstream
installs from npm and that is the honest comparison. An unreleased change will
not appear until it ships — pin explicitly with `--validate-version`.

## The blocker: we are ESM-only, their default runner is CJS

Upstream's default runner is `ts-node index.ts` (CommonJS). Every `@pyreon/*`
package publishes an `exports` map with **only** `import` and `types` — no
`require`, no `default` — so Node's CJS loader cannot resolve it:

```
Error: No "exports" main defined in .../@pyreon/validate/package.json
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
```

This is repo-wide policy, not a `validate` bug (`reactivity`, `core`, `store`,
`validation` are all import-only). It has consequences well beyond this
benchmark: **no CommonJS consumer can load any Pyreon package.**

Our case runs fine under `bun` and their harness supports it (`start:bun`,
`start:deno`, and they publish per-runtime results — `bun-1.json`, `deno-2.json`).
But their published matrix is dominated by node (`node-14` … `node-26`), so
without a `require` condition we would be **absent from most of the results
people actually look at**. Submitting is therefore gated on a product decision
about dual publishing, not on this file.

## Reading the numbers with the right amount of suspicion

Upstream calls `this.fn(validateData)` in a loop with a **single frozen
constant** and discards the result. That keeps every inline cache monomorphic
and the branch predictor perfect — flattering for every library, and not
equally so. Our own `bench/validation.ts` rejected exactly this shape in favour
of rotated 8-input pools after ArkType's `string.email` cell read ~3ns/op,
below the cost of the regex it must run.

Concretely, an early local run reported `parseSafe: 46,415,992 ops/s` — 21.5ns
for an 8-field parse plus a stripped clone, *faster than our own benchmark
measures a smaller object* (49ns). The same cell read 6.8M ops/s at ±106% on the
run before. Treat any single figure from here as a smoke test until it is taken
on an idle machine, and prefer the margin column over the headline.

## Why the assert cases wrap `.is()` in a throw

`assertLoose` / `assertStrict` require a **throw** on invalid input, not a
`false` return — `expect(() => this.fn(data)).toThrow()`. So a boolean API
cannot be handed over directly. The established shape is to wrap it, which is
what `sinclair-typebox-*` does:

```ts
if (!CheckLoose.Check(data)) { throw new Error('validation failure'); }
return true;
```

Ours does the same with `.is()`, which is the verdict-only path — no issue
objects, no stripped clone. That is what the assert cases are *for*;
`assertLoose`'s own docblock notes that skipping unknown-key checks "may provide
massive speedups".

`moltar-entry-contract.test.ts` transcribes upstream's own assertions so a
contract mismatch fails in our CI rather than in a stranger's.

## Steps (manual — an external PR must be a human decision)

1. Resolve the CJS blocker, or accept bun/deno-only results.
2. Fork <https://github.com/moltar/typescript-runtime-type-benchmarks>.
3. Copy `cases/pyreon.ts` to `cases/pyreon.ts` in the fork. Copy nothing else
   from this directory — `benchmarks/` here is a local shim for our test, and
   `run-local.ts` is our tooling.
4. Add `'pyreon'` to the `cases` array in `cases/index.ts` (kept sorted).
5. Add `@pyreon/validate` to `dependencies` in `package.json`, pinned to the
   version you intend to be measured — re-verify it is current. The krausest
   entry sat on a stale pin through ten releases; the same mistake here
   publishes an old Pyreon as our independent number.
6. `npm install`, then `npm test` (their vitest contract suite) and
   `npm start run pyreon`.
