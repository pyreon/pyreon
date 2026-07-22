---
'@pyreon/cli': minor
'@pyreon/compiler': minor
---

`pyreon doctor` now audits ANY workspace layout instead of silently scanning zero files (upstream-reported false green: in a multi-root workspace — `apps/* + packages/* + modules/*` — the pattern gates scanned 0 files from every cwd, `audit-tests` was pinned to `<root>/packages`, and the doctor still reported 100/100 Grade A).

- **Workspace-root discovery**: the file-scanning gates (`react-patterns`, `pyreon-patterns`, `lint`, `audit-tests`) resolve their scope from the workspace's OWN `package.json` `workspaces` globs (array or `{ packages }` shape) or `pnpm-workspace.yaml`, discovered by walking up from the cwd — results are identical from any directory. No workspaces → single-package (nearest `package.json` dir). Per package, `src/**` is scanned when present; tests / fixtures / `.d.ts` stay excluded.
- **Empty scan ≠ clean pass**: a gate that matches no files is skipped with a warning (`meta.emptyScan`), its category is "not measured", and a run where NOTHING was measured renders `Score: —` instead of the degenerate 100/A, emits a `::warning` in `--gha`, and exits non-zero under `--ci` (new `DoctorReport.measured` flag).
- **Coverage visibility**: the report header prints the resolved scope (`Scope: N package root(s) from workspaces (…)`) + per-gate scanned counts; `--json` carries a new `workspace` field.
- **Escape hatches**: new `--roots <glob,...>` flag overrides discovery for non-standard layouts; `pyreon.doctor.excludeRoots` globs in the root package.json exclude demo/docs workspaces from grading.
- `@pyreon/compiler`: `auditTestEnvironment(startDir, { roots?, rootDir? })` accepts explicit package roots (new `TestAuditOptions` export) — the default `<root>/packages` walk is unchanged for existing callers.

Behavior note (pre-1.0 clean break): in foreign repos the doctor now actually measures your code — scores will change from the previous meaningless 100. On the Pyreon repo itself the audited file set is byte-identical (locked by parity tests).
