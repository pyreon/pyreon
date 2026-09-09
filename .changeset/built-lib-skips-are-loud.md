---
'@pyreon/lint': patch
'@pyreon/store': patch
---

Built-artifact specs no longer skip silently

Test-only hardening; no runtime change. Seven specs across `@pyreon/charts`,
`@pyreon/store` and `@pyreon/lint` guarded themselves on `existsSync(lib/…)`
because they measure BUILT output — the plot families' tree-shaking, the store's
dev-gate stripping, and the proof that `pyreon-lint`'s published bin actually
invokes the CLI, a spec that exists because that bin was once a total no-op in
every published version.

That guard is right locally (a fresh worktree has no `lib/`) and wrong in CI,
where the test cells restore the bootstrap and a skip means the suite proved
nothing while reporting green. Four of the seven had no loud counterpart at all.

`hasBuiltLib(path, what)` now names what it skipped and why, and throws under
`PYREON_REQUIRE_BUILT_LIB=1` — the contract `PYREON_REQUIRE_NATIVE_VALIDATE=1`
already has for the native toolchains. `check-skip-guards` keeps the quiet form
from coming back.
