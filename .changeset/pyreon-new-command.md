---
"@pyreon/cli": minor
---

Add `pyreon new [name] [--native]` — scaffold a new Pyreon project from the unified `pyreon` CLI instead of a separately-remembered `npm create @pyreon/zero`. A thin, dependency-free delegator: it `npx`-runs `@pyreon/create-zero@latest` (or `@pyreon/create-multiplatform@latest` with `--native`), passing the project name and any other flags straight through to the scaffolder's interactive flow. Pinned to `@latest` so a new project always starts on the freshest templates regardless of the installed cli version. `--dry-run` prints the npx command without running it.
