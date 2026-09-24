---
'@pyreon/lint': patch
---

chore(gates): four gates reported a number they had not measured

Not a runtime change — repo tooling. Grouped because they are one shape: a gate
that cannot tell "verified nothing" from "verified, nothing wrong", and reports
the latter.

- **`check-changeset-required` and `check-diagnose-catalog` failed OPEN on a git
  error.** `changedFiles()` wrapped the diff in `catch { return [] }`, so a
  failure was indistinguishable from "this PR touched nothing relevant" — and
  both then printed a POSITIVE assertion about a diff they never obtained, on a
  pinned REQUIRED check. Not firing in CI today (`fetch-depth: 0`), live for a
  shallow clone, a non-`origin` remote or a renamed base branch. Both now refuse
  to pass and say why.

- **An EMPTY changeset satisfied the Changeset gate**, because activity was
  counted by PATH with the content unread. One live instance in 513: #3403's
  feature shipped one, so that work got no CHANGELOG entry at all. An empty
  changeset is legitimate when a PR does not affect consumers — but then the
  gate never demands one, so by the time it is asking it is the one answer that
  cannot be right. The recovered entry is included.

- **`bench:bundle-size` printed `0B` for the four core packages and exited 0.**
  A failed bundle is not a zero-byte bundle, and `0 B` in a human-facing report
  reads as "remarkably small". Failures are now named and unmeasured rows are
  absent rather than zero. (Root cause: esbuild 0.28.2 rejects a NAMED import
  from JSON when `with { type: 'json' }` is present — how those entries read
  their own name and version. Restoring the measurement is a follow-up; this
  change stops the report lying about it.)

- **`check-client-bundle-node-imports` printed the DECLARED count, not the
  walked one**, so a run that skipped every entry still said "2 client-safe
  package(s) checked".
