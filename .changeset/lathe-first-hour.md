---
'@pyreon/lathe': minor
'@pyreon/config': minor
'@pyreon/native-compiler': patch
---

Lathe's first hour, fixed.

- **Output that compiles.** A GET with no content (Petstore 3's `logoutUser`) no longer emits `useQuery<void>` over an endpoint typed `unknown`, and no longer gets a native data component that PMTC cannot lower; Petstore 3 is now in the strict-typecheck matrix. A discriminated union whose tag cannot be proven (a `const` tag, an optional enum tag, a duplicated value) is emitted as a plain union with a note instead of throwing when `schemas.ts` is imported.
- **The wrong document is refused.** Swagger 2 is refused with the `swagger2openapi` conversion command; a file that is not an OpenAPI 3.x spec is refused before any output is touched. Every project is generated before any is written. A numeric YAML `info.version` is kept instead of becoming `0.0.0`.
- **Losses are loud.** Header and cookie parameters, security schemes, response headers, error bodies, other success responses, parameter serialization, `deprecated`, an optional request body, `const`, extra tags and a shadowed description all produce notes. Notes carry a severity (`loss` / `choice`, via `NOTE_SEVERITY` / `noteSeverity`); the report leads with losses; pointers are RFC 6901. A BROKEN native verdict's warnings print in full.
- **Orphans are pruned.** `lathe-manifest.json` records what each run generated; `generate` removes what it no longer produces and `check` reports it stale. Commit the manifest.
- **A strict CLI.** Unknown flags/commands/values are errors with a did-you-mean (exit 2); `--version`, `--config`, `--dry-run`, `--color`/`--no-color`; the config is found upward and its paths are relative to the config file; errors go to stderr; colour respects TTY and `NO_COLOR`. **Breaking:** `--json` now has one shape, `{ ok, command, projects: [...], error? }`, for any project count (a single project used to be a flat object).
- **`lathe pull`** works without a config (`lathe pull <url> [dest]`), sends `--token` / `--header` / `$LATHE_TOKEN`, makes conditional requests via ETag, and pulls every project with the new `source` key.
- **The Vite plugin** reads `pyreon.config.*` itself (`lathe({ checkOnBuild: true })` is enough), generates once at boot, warns on a missing spec with a suggestion, logs breaking changes and losses, and watches the config. `--watch` watches the config too.
- `@pyreon/config`'s `LatheSection` now matches Lathe's own type exactly (`client`, `validator`, `source`, literal plugin names), enforced by a compile-time test.
- `@pyreon/native-compiler`: schema drop warnings for the `s` DSL read `s declaration` instead of `null declaration`, and no longer cite `z.array()`.
