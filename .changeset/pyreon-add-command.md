---
"@pyreon/cli": minor
---

Add `pyreon add <pkg...>` — install one or more `@pyreon/*` packages and print exactly how to wire each one in. It auto-detects the project's package manager from the lockfile (bun / pnpm / yarn / npm, walking up from the current directory), accepts bare names (`pyreon add query` == `@pyreon/query`), and prints a tailored, verified setup recipe per package: the root provider to add (e.g. `<QueryClientProvider>`), a usage snippet, and a docs link. `--dry-run` shows the plan without installing; `--json` emits it machine-readably.

Curated recipes ship for the flagship packages (query, toast, i18n, permissions, form, store, router, head); any other `@pyreon/*` package still installs with a generic docs pointer. Recipes are hand-authored in the CLI (verified against each package's real public API) rather than generated from manifests — published packages don't ship their manifests.
