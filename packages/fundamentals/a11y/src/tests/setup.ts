// ─── happy-dom spec-parity patch: no `hashchange` from pushState/replaceState ─
//
// Wired via `setupFiles` in vitest.config.ts — runs before every NODE
// (happy-dom) test file in this package.
//
// `router.test.tsx` drives a REAL `@pyreon/router` (default mode `hash`, so
// every `router.push` is a hash-changing `pushState`). happy-dom queues a
// DEFERRED synthetic `hashchange` for those (real browsers never do — WHATWG:
// only fragment navigations fire it); under CI/parallel load the echo from
// one spec lands DURING the next spec, the route announcer treats it as a
// genuine traversal, and `does NOT announce the initial route by default`
// fails with the live region unexpectedly present. The shared guard (full
// mechanism documented in `@pyreon/test-utils`
// `happy-dom-hashchange-guard.ts`) swallows exactly those echoes; manual
// `new HashChangeEvent('hashchange')` dispatches and `location.hash = …`
// assignments still reach the router.
// SUBPATH import (not the `@pyreon/test-utils` barrel) — the barrel pulls
// @pyreon/core + @pyreon/reactivity into the setup context of every test
// file, which can trip the duplicate-instance singleton sentinel in tests
// that bundle + evaluate built lib/ output. The subpath is framework-free.
import { installHappyDomHashchangeEchoGuard } from '@pyreon/test-utils/happy-dom-hashchange-guard'

installHappyDomHashchangeEchoGuard()
