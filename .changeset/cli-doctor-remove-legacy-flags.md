---
"@pyreon/cli": minor
---

`pyreon doctor` drops the deprecated `--audit-tests`, `--check-islands`, `--check-ssg`, `--check-content` and `--check-native` flags (and the matching `DoctorOptions` fields). It now rejects any unknown argument with a usage error (exit 1), because an ignored selector silently widened the run to every gate.

Migration: replace `--audit-tests` / `--check-islands` / `--check-ssg` / `--check-content` / `--check-native` with `--only audit-tests` / `--only islands-audit` / `--only ssg-audit` / `--only content-audit` / `--only native-audit` (combine with commas, e.g. `--only islands-audit,ssg-audit`).
