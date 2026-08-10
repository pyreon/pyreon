---
'@pyreon/native-cli': patch
'@pyreon/native-compiler': patch
'@pyreon/native-router-kotlin': patch
'@pyreon/native-router-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/native-runtime-swift': patch
---

Add the `repository` field npm provenance requires. All six packages were
rejected from the 0.51.0 release with a 422 (`"repository.url" is "",
expected to match "https://github.com/pyreon/pyreon"`) — `--provenance`
publishing validates the field against the OIDC attestation, so its absence
is a publish blocker, not cosmetic metadata.
