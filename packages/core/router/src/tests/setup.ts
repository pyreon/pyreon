// ─── happy-dom spec-parity patch: no `hashchange` from pushState/replaceState ─
//
// Wired via `setupFiles` in vitest.config.ts — runs before every NODE
// (happy-dom) test file in this package. Browser tests (real Chromium via
// vitest.browser.config.ts) do NOT load this file: real browsers already
// behave per spec.
//
// The shim itself is the SHARED `installHappyDomHashchangeEchoGuard` in
// `@pyreon/test-utils` (extracted from this file — full mechanism + rationale
// documented there). Any package driving a real router in happy-dom must
// install it; keeping the logic in one place is what prevents the
// "fix applied to ONE call site is folklore" recurrence (`@pyreon/a11y` was
// the latent second instance).
//
// SUBPATH import (not the `@pyreon/test-utils` barrel) is load-bearing: the
// barrel pulls @pyreon/core + @pyreon/reactivity src instances into every
// test file's setup context, which trips the duplicate-instance singleton
// sentinel in this package's treeshake specs (they bundle + evaluate built
// lib/ output — a second reactivity instance).
import { installHappyDomHashchangeEchoGuard } from '@pyreon/test-utils/happy-dom-hashchange-guard'

installHappyDomHashchangeEchoGuard()
