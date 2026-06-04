---
"@pyreon/zero": patch
---

test(zero): add 31 real tests for cors / rate-limit / env helpers

31 new tests in `branch-coverage-real.test.ts` covering:
- `corsMiddleware` preflight (204 + credentials variants), non-matching
  origin, exposedHeaders, Vary: Origin gating, unknown-config fallback
- `rateLimitMiddleware` first-request headers, 429 on overflow, onLimit
  callback, include/exclude filters, custom keyFn
- `env.str/num/bool/url/oneOf` parse + required + default matrix
  (rejection cases, empty/undefined → default, invalid input throws)

Branches lifted 87.17% → 88.84% (+1.67pp).
