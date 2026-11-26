// happy-dom spec-parity: suppress the non-spec deferred `hashchange` echoes
// happy-dom queues for history.pushState/replaceState. This package's own
// suite drives REAL routers in happy-dom (`src/tests/router.test.tsx` —
// `renderWithRouter` + `navigate()`; its default is a memory router, but the
// specs that pass `mode: 'hash'` and the bare `createRouter` ones default to
// hash mode, where every navigation is a hash-changing pushState). Without the guard, a
// prior spec's deferred echo can land mid-spec under CI load and supersede
// the fresh spec's in-flight navigation. TEST-ONLY wiring — this file is NOT
// shipped surface (unlike `src/vitest.ts`, the consumer setup module, which
// deliberately does NOT install the guard: it lives in the private
// `@pyreon/test-utils`). Full mechanism: `@pyreon/test-utils`
// `happy-dom-hashchange-guard.ts` (subpath import is load-bearing — the
// barrel pulls framework src instances into the setup context).
import { installHappyDomHashchangeEchoGuard } from '@pyreon/test-utils/happy-dom-hashchange-guard'

installHappyDomHashchangeEchoGuard()
