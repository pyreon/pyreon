---
---

CI/security only — no `@pyreon/*` package change, no version bump.

Closes the in-repo, low-risk security-scorecard gaps surfaced by the manual
posture audit:

- **SAST**: new `codeql.yml` — CodeQL `security-extended` on the
  JavaScript/TypeScript surface (the dominant injection/XSS attack surface
  for a UI framework + compiler), push/PR to `main` + weekly. Rust CodeQL
  is beta and the small native crate is covered by the 180-test
  cross-backend-equivalence oracle, so it is a deliberate follow-up.
- **OpenSSF Scorecard**: new `scorecard.yml` — the official, continuously
  recomputed score, published to the Security tab + the public
  scorecard.dev / deps.dev badge (the manual audit was only a proxy).
- **Dependency vulnerabilities**: new `osv-scanner.yml` — OSV scan of the
  lockfile, SARIF → Security tab. Deliberately ADVISORY (`continue-on-error`)
  so it does not red every PR on day one for pre-existing transitive
  advisories with no merge path — same advisory-first rationale the repo
  applies to `perf.yml`; ratchet to blocking once the baseline is triaged.
- **Pinned-Dependencies**: the last unpinned action
  (`dtolnay/rust-toolchain@stable`) is now SHA-pinned with an explicit
  `toolchain: stable` in `ci.yml` + `release-native.yml`. Zero non-SHA
  `uses:` references remain repo-wide.

Deliberately NOT changed here (judgment — "fix the gaps that make sense"):
required PR reviews (`required_reviews: 0`) would deadlock a solo
maintainer who cannot approve their own PRs; `strict: false` churn; and
removing `NPM_TOKEN` while provenance/OIDC already exists is
release-breaking. Those are repo-admin settings/decisions, surfaced for the
maintainer rather than auto-applied.
