---
'@pyreon/compiler': patch
---

`diagnoseError`: the mock-vnode / `audit_test_environment` diagnosis now carries its pointer to the test-environment parity rules as `related` (it was under an unknown `docs` key, so the MCP `diagnose` tool never showed it), and the `_fuse` version-skew diagnosis no longer returns stray keys left over from a mis-closed `fixCode` string.
