---
'@pyreon/lint': minor
'@pyreon/cli': minor
'@pyreon/code': patch
---

Every rule now runs on this monorepo, and every rule is proven to fire.

Three silent holes, each the same shape — a capability that worked for a
hand-maintained subset, where being outside the subset was indistinguishable
from being inside it.

**Two rules could never fire.** `pyreon doctor`'s lint gate scans each
package's shipped `src/**` minus tests, fixtures and `.d.ts`. Two rules'
subject is exactly what that removes: `no-query-selector-cast-in-test` and
`vitest-config-uses-shared`. Both were configured `error`; 2,159 test files
and 115 vitest configs existed and **none were in scope**. A rule now declares
its surface via `RuleMeta.scanTarget` (`'source'` | `'test'` |
`'packageConfig'`) and the gate collects what the enabled rules need, each
extra target as its own pass with every other rule off — running the full set
over tests would reintroduce the fixture noise the exclusions exist to prevent.

Turning them on found **280 `querySelector(…) as HTMLX` sites across 92
files** — the exact class `no-query-selector-cast-in-test` exists to prevent,
re-accumulated since PR #963 eliminated 122 of them. They are routed to the
advisory ratchet at a seeded baseline of 280, which can only shrink. That is
strictly more enforcement than the zero they had, and the burn-down is a
follow-up.

**`exemptPaths` was honoured per rule** — a rule had to call `isPathExempt`
itself and **55 of 101 did not**, so an exemption configured for one of those
parsed, validated, and did nothing. It is now applied centrally in the runner,
before `rule.create()`, so it means the same thing for every rule by
construction.

**A config key naming nothing was silently ignored.** This repo shipped
`pyreon/dangerously-set-inner-html` — with an `exemptPaths` list — for a rule
that has never existed. Unknown `rules` / `groups` keys are now config
diagnostics with a did-you-mean.

**Verification:** a new fires-invariant asserts all 101 rules produce their
diagnostic on a defect fixture and stay silent on the corrected one, with only
that rule enabled, and asserts the fixture map is total over the registry.
Building it found 13 fixtures wrong and **zero broken rules** — and it then caught the new rule below before it had a fixture, which is the case it exists for.

**New rule — `pyreon/no-unsanitized-inner-html`** (opt-in, `warn`). Pyreon
assigns `dangerouslySetInnerHTML`'s `__html` **raw** by design — React parity,
the developer owns sanitization, and unlike the sibling `innerHTML` prop no
sanitizer applies. That is the most direct XSS vector a Pyreon app has, and it
was caught by nothing. The gap was recorded but not closed: the ghost config
entry above was `pyreon/dangerously-set-inner-html`, complete with an exemption
for the one file that legitimately uses it.

It stays quiet on everything it cannot prove — a string literal, a
substitution-free template literal, a sanitizer call, and one hop through a
same-file `const`, so the idiomatic `const clean = DOMPurify.sanitize(dirty)`
is recognised. Opt-in because it is a judgement call about a prop that is
legitimately used with your own sanitizer.

It found **4 raw sinks** in this repo, ratcheted alongside the others. One is
worth a look on its own: `<Icon svg={…}>` renders caller-supplied markup raw,
so an app passing untrusted SVG through it has an XSS hole. The other three
are library output (mermaid, katex) and an `aria-hidden` gutter built from
line numbers.

**Also fixed:** the code editor's gutter line numbers failed WCAG AA — 2.45:1
(light) and 2.63:1 (dark) against a 4.5:1 requirement. Now 4.55:1 and 4.75:1,
one palette step each.

The repo's config runs all 101 rules: non-opt-in at `error`, opt-in at
advisory severity so the ratchet locks them at zero. Four rules stay off with
stated reasons — `no-ternary-conditional` and `no-and-conditional` are style
preferences whose own docstrings say they are not correctness rules, and
gating CI on them would fail correct code.
