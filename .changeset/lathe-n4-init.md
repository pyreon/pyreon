---
'@pyreon/lathe': minor
---

`lathe init` — set a project up from what it already has.

Detects an orval, `@hey-api/openapi-ts` or kubb config (read as text, never
imported or executed), an `openapi-typescript` script, or a bare `openapi.*`
file; maps every option it can onto a `lathe` section and names every one it
cannot, with what to do instead; writes `pyreon.config.ts` (creating it, or
adding one entry to an existing one — an existing `lathe` section is never
replaced); adds `lathe:generate` / `lathe:check` scripts; prints the install
command for the packages the generated code imports; and runs the first
generate. Questions are asked only on a terminal; `--yes` takes every default,
`--from <tool>` skips detection, `--no-generate` stops after writing,
`--dry-run` writes nothing, and `--json` reports one document. It never writes
into a directory that holds another generator's files.

`lathe pull` progress lines can now be routed (`PullOptions.out`), so
`lathe init --json` keeps stdout a single JSON document.
