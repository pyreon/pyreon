---
'@pyreon/lathe': patch
---

`lathe diff <rev>:<path>` now resolves `<path>` relative to the working directory, like the on-disk side of the diff. It was read from the repository root, so from a subdirectory — a monorepo package, a workflow step with `working-directory` — `main:openapi.yaml` compared the root's spec (or nothing, exit 2) against the package's. An explicit `./` / `../` is honoured as written.

The documented GitHub Action now finds its own PR comment by a hidden `<!-- lathe-contract -->` marker instead of `gh pr comment --edit-last`, which edited whichever comment the workflow token wrote last — in a repository with any other bot comment, that one. It also writes the report to the job summary, skips the comment on fork pull requests (read-only token) instead of failing the check, and retries a failed post before downgrading it to a warning. Update a copied workflow from the docs.
