# typia fixtures

typia builds its validator from a TypeScript TYPE at **compile time**, so —
unlike every other library in this benchmark — its validators cannot be
constructed at runtime. That has one consequence for this directory and one
for how its numbers should be read.

## Why there is a generated file checked in

`schemas.source.ts` is the source of truth. `generated.js` is what the
benchmark actually imports: plain JavaScript with the validators already
inlined, so `bun bench/validation.ts` needs no transformer.

It is generated **outside this repo**, deliberately. typia 14 compiles through
`ttsc` (the TypeScript-Go toolchain) and requires **TypeScript 7**, which this
repo pins away from on purpose — TS7 removed the classic Compiler API that
`@pyreon/compiler` depends on (see the `>=5.0.0 <7.0.0` cap and the
`reading 'ESNext'` entry in the diagnose catalog). Adding that toolchain here
to serve a benchmark would risk the whole workspace's TypeScript resolution.

To regenerate, in a scratch directory outside the repo:

```bash
npm init -y
npm i typia@14        # keep in step with the devDependency in package.json
npm i -D ttsc typescript@7
# copy schemas.source.ts to src/index.ts, set rootDir + strict in tsconfig
npx ttsc --emit       # first run builds a native Go plugin; minutes, then cached
# copy dist/index.js back over generated.js
```

**Nothing gates this file's freshness**, which would normally be a drift
hazard. What limits the damage is that the benchmark's cross-library
correctness gate runs before any timing and requires every library to agree on
every scenario input: a `generated.js` that has drifted from the schemas the
other libraries use fails that gate rather than quietly producing a flattering
number.

## Reading typia's numbers fairly

- **check axis** uses `typia.createIs<T>()`.
- **parse axis** uses `typia.plain.createValidateClone<T>()`, NOT
  `typia.validate<T>()`. `validate` returns the input **by reference**;
  `createValidateClone` allocates a stripped clone and reports errors, which is
  what `zod.safeParse` does. Reporting `typia.is` (or `validate`) under a
  "parse" heading would be the single most misleading choice available, since
  it skips both the allocation and the error collection.
- typia specialises per type at compile time from a Go plugin, while every
  other entry interprets a schema object graph built at runtime. That is a
  legitimate comparison, but it is not "same algorithm, faster": typia trades a
  bespoke toolchain for the speed, and its types cannot be built at runtime
  from dynamic data (a spec-driven client, a user-defined form).
