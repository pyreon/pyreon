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

## We are ESM-only by policy; their default runner is CJS

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
people actually look at**.

**That is settled, not open.** ESM-only is deliberate policy for this framework,
and it will not change to win a benchmark slot. A `default` condition would make
Node's CJS resolver match (the artifact would even stay ESM — Node >=22.12 can
`require()` an ES module), and it was tried and REJECTED for exactly that reason:
the effect is CJS consumers, whatever the build format says.

So this entry is **bun/deno only, permanently**. Upstream publishes per-runtime
results (`bun-1.json`, `deno-2.json`), so the numbers are real and comparable —
they are simply absent from the node columns. Do not "fix" this by adding an
export condition.

## First real measurement (bun 1.4, quiet machine, 2026-09-01)

In-run comparison — every arm measured in the same run on the same box, which is
the only valid way to read this. Upstream's committed `bun-1.json` is from THEIR
machine and must not be compared against.

| case | us | rank | leader |
|---|---|---|---|
| `parseStrict` | 4,349,212 (±0.64%) | 2 of 4 | arktype 17,238,697 (**3.96x**) |
| `assertStrict` | 4,129,678 (±0.50%) | 3 of 5 | typebox 78,823,090 (**19x**) |
| `assertLoose`  | 4,159,437 (±0.51%) | 4 of 5 | typebox 113,006,350 (**27x**) |
| `parseSafe`    | 50,891,015 (±3.45%) | 1 of 3 | — (arktype/typebox absent) |

**This contradicts the comfortable in-house picture, which is the point of an
independent harness.** Our own bench has us winning or tied in 14 of ~21 cells;
here we are mid-pack, 19-27x behind TypeBox on the assert cases.

Two readings, one of them a testable prediction:

- **Our four numbers are nearly identical (4.35M / 4.16M / 4.13M).** `assertLoose`
  does no clone and no unknown-key scan, so it should be far faster than
  `parseStrict`. It is not.

  **This entry originally predicted that the unmerged verdict JIT (#3164) would
  move those cells. That prediction was WRONG and is corrected here.** The cause
  was not the JIT being unpublished — it was that the JIT excluded
  `.passthrough()` entirely, which is exactly what `assertLoose` uses, so shipping
  it would have changed nothing. Found by measuring, within the hour, which is why
  the prediction was worth writing down.

  Extending the verdict JIT to passthrough (#3181) and re-running THIS harness:

  | case | before | after |
  |---|---|---|
  | `assertLoose` | 4,159,437 | **124,809,662** (30x) |

  4th place to 1st, ahead of TypeBox's 113,006,350. `assertStrict` is unchanged at
  4.0M and still 19x behind, because `.strict()` remains excluded — it must REJECT
  an unknown key, which needs a key scan the inline loop does not emit. That is the
  next lever, and its mechanism is known.

- **`parseSafe` is still not trustworthy.** 50.9M is 12x our own `parseStrict`,
  and strict mode only adds an unknown-key scan — that gap is not explicable by
  the extra work. The likeliest reading is the discarded clone being optimised
  away in the safe case and not in the strict one. Treat the rank as reported,
  not as a win.

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

## Not every cell compares the same work

`parseStrict` is the clearest case. moltar's typia entry is:

```js
addCase('typia', 'parseStrict', data => {
  if (!equals(data)) throw new Error('wrong type.');
  return data;          // the INPUT, by reference
});
addCase('typia', 'parseSafe', data => {
  if (!is(data)) throw new Error('wrong type.');
  return clone(data);   // this one clones
});
```

`parseOrThrow` returns a stripped CLONE, a deliberate Pyreon semantic. typia's
own numbers show the size of the difference: its `parseStrict` (131.9M) is 2.3x
faster than its `parseSafe` (57.0M) — and strict does strictly MORE validation
work than safe, so the only way it comes out faster is by skipping the clone.
ArkType aliases the input the same way.

That is within the letter of the benchmark (its assertion is `toEqual`, which is
structural, so aliasing passes) and it is not cheating. It does mean the
`parseStrict` and `parseSafe` columns are not measuring one job across all
libraries, and a ranking there compares allocate-vs-alias as much as speed.

The ASSERT cells have no such asymmetry — every entry returns a boolean and
allocates nothing — so `assertLoose` / `assertStrict` are the honest
apples-to-apples comparison. On those, typia is genuinely ahead of us on
`assertStrict` (134.1M vs 86.7M, 1.55x) doing identical work, and that gap is
real.

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

1. Accept bun/deno-only results. The node matrix is out by policy (see above);
   do not add an export condition to get into it.
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
