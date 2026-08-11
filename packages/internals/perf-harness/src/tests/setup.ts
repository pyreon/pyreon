// happy-dom spec-parity: suppress the non-spec deferred `hashchange` echoes
// happy-dom queues for history.pushState/replaceState. This package's router
// counter tests (`counters-router.test.ts`, `router-cycles.test.ts`) run
// under a per-file `// @vitest-environment happy-dom` pragma and drive REAL
// routers (default mode `hash` → every `router.push` is a hash-changing
// pushState), so a prior spec's echo can land mid-spec under CI load and run
// the navigation pipeline — perturbing the exact counters under assertion.
// The guard no-ops in this package's default node-environment test files
// (`typeof window === 'undefined'`), so a single setupFiles entry is safe
// for the whole suite. Full mechanism: `@pyreon/test-utils`
// `happy-dom-hashchange-guard.ts` (subpath import is load-bearing — the
// barrel pulls framework src instances into the setup context).
import { installHappyDomHashchangeEchoGuard } from '@pyreon/test-utils/happy-dom-hashchange-guard'

installHappyDomHashchangeEchoGuard()
