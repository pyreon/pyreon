---
"@pyreon/router": patch
---

test(router): add real tests for redirect / not-found / loader serialization

17 new tests in `branch-coverage-real.test.ts` covering:
- `redirect()` + `isRedirectError` + `getRedirectInfo` branch matrix
- `notFound()` throw + message handling
- `prefetchLoaderData` with/without optional `request` arg
- `stringifyLoaderData` circular detection, function-stripping, Date toJSON, `</script>` escape

Branches lifted 88.06% → 88.17%. Incremental real-test coverage on the smaller files (redirect.ts, loader.ts, not-found.ts) while the larger router.ts (51 uncov) and match.ts (27 uncov) remain for follow-up work.
