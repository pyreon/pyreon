---
'@pyreon/create-multiplatform': patch
---

`npx create-multiplatform --help` exited 1 and printed nothing to stdout.

`--help` fell through to `parseArgs`, which saw no project name and threw. The
usage line went to **stderr** and the process exited **non-zero** — so any
script or CI step checking the exit code treated a help request as a failure,
and a plain `| grep` saw nothing.

Every other published Pyreon bin (`pyreon-lint`, `zero`, `create-zero`) already
exits 0 on stdout. This one was the outlier, and it is the first command a new
user runs.

`--help` / `-h` now short-circuit before any validation or filesystem work,
print usage to stdout, and exit 0. A genuine missing project name still errors
exactly as before, and both paths share one usage string so they cannot drift.

The bin-liveness gate had special-cased this bin — "prints usage to stderr and
exits 1 on --help … that IS the liveness signal" — which **encoded** the bug
instead of catching it. That special case is removed, so the bin is held to the
same bar as every other and a regression fails the gate.
