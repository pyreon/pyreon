---
'@pyreon/native-compiler': patch
---

The import-budget table's label now uses the same threshold as its verdict

`check-import-budgets` tolerates `budget + VERSION_NOISE_BYTES` when deciding
pass/fail (gzip differs by a few bytes across zlib versions), but the per-row
LABEL used a bare `>`. So a CI run printed

```
OVER @pyreon/charts::plot-svg    gz=12624  budget=12620
[check-import-budgets] all 15 scenario(s) within budget.
```

— four bytes inside the tolerance, labelled as a failure one line above the
verdict that passed it. Anyone triaging a red Build reads the `OVER` and
chases an entry that is not the failure.

The tag is now a shared pure function (`budgetTag`) keyed to the same
threshold, with a distinct `near` for the in-noise case — hiding it as `ok`
would be the opposite error, a budget quietly absorbing growth worth a look.
