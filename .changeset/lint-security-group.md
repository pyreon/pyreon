---
'@pyreon/lint': minor
---

New `security` rule group — script URLs and referrer leakage — on by default in every standard preset.

The gap was measured, not assumed: a fixture of eight defects a polished app must never ship was caught **1 of 8** by this linter. The security shapes were caught by nothing — the equivalent rules live in oxlint's `react` plugin, which `code-style.md` skips wholesale (correctly, for its re-render-perf rules, which are semantically wrong for a framework whose components run once) and which took three JSX-generic security rules down with it.

**`pyreon/no-script-url`** (`error`) — `javascript:` / `vbscript:` in `href`, `src`, `action`, `formaction`, `poster`, `ping`. These execute in the page's origin rather than navigating. It normalizes the way a browser does before matching the scheme, so it catches what a naive `startsWith` misses: leading control characters, and embedded ones like `java\tscript:` — both live script URLs.

**`pyreon/no-target-blank-without-rel`** (`warn`, autofixable) — `target="_blank"` on `a` / `area` / `form` without `rel="noreferrer"`. It still reports `rel="noopener"` alone: modern browsers imply `noopener`, so that half is largely historical, but nothing implies `noreferrer` and the referring URL can itself identify a user, document or tenant. The autofix only **adds** a missing `rel`; a partially-correct one is reported and left alone, because silently rewriting someone's `rel` is worse than a nag.

Both read **static values only**. A dynamic `href={u}` or `rel={r}` may well be correct, and a rule that cannot prove otherwise stays quiet — a security rule with false positives is a security rule people switch off.

**Behaviour change:** `pyreon/anchor-is-valid` no longer flags `javascript:` / `vbscript:` URLs; `no-script-url` owns them. It covers more attributes, catches the control-character bypasses, and frames the finding as the security issue it is. Reporting both emitted two diagnostics for one defect. `anchor-is-valid` still owns `""`, `"#"` and `data:`.

Rule count 98 → 100; categories 19 → 20.
