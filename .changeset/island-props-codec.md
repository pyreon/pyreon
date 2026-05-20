---
'@pyreon/server': minor
---

feat(server): islands prop codec — Date / Map / Set / RegExp / BigInt now roundtrip losslessly; class instances fail loud

Closes the silent data-loss footgun in SSR → client island-prop transit. The
naïve `JSON.stringify` path through `<pyreon-island data-props="...">`
silently:

- coerced `Date` → ISO string (client received `string`, not `Date`)
- collapsed `Map` / `Set` / `RegExp` → `{}` (lost entirely)
- threw on `BigInt` → empty-props fallback with a generic dev message
- dropped class instances to `{}` with NO warning (bug surfaced as a
  runtime crash on the hydrated component)

New: `packages/core/server/src/island-codec.ts` — `encodeIslandProps` /
`decodeIslandProps` / `IslandPropEncodeError`. Tags non-JSON-native
types with an internal `__pyreon_t` marker the inverse decoder unwraps
on hydrate. Plain objects without markers round-trip byte-identically
(no behaviour change for existing JSON-shaped props). Objects whose
OWN key is literally `__pyreon_t` get an `'e'`-escape wrap so users
who happen to use that key string keep working.

**Fail-loud where it was silent:** class instances, circular
references, and >100-deep nesting now emit `IslandPropEncodeError` with
a `$.foo.bar` prop-path + offender name. The caller (`serializeIslandProps`)
catches the error and falls back to empty props as before, BUT the
dev-mode `console.error` now NAMES the offender (`User`, `$.user`, etc.)
instead of the prior generic "BigInt or circular reference" message.

Forward-compatible decoder: unknown tag values pass through verbatim
so an older `client.ts` doesn't crash on a future-encoded type.

**Behaviour change for consumers**: code that received `Date` props as
ISO strings and revived with `new Date(props.someDate)` still works
(Date constructor accepts Date). Code doing `typeof props.someDate ===
'string'` on a Date-typed prop needs updating to `props.someDate
instanceof Date`. This is documented in the JSDoc on
`serializeIslandProps` and CLAUDE.md.

Tests: 21 codec roundtrip + escape + fail-loud + forward-compat specs
(`tests/island-codec.test.ts`), plus 3 contract-update tests in
`tests/server.test.ts`. Full server suite: 164 pass; typecheck + lint
clean; build clean.
