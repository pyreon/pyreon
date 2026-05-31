---
'@pyreon/zero': patch
---

`expandRoutesForLocales` shallow-clones every output + locale-major loop ordering (PR-S10)

Two correctness improvements to the i18n route expansion path:

**1. Shallow-clone the default-locale routes.** Pre-fix `expanded.push(route)` on the `prefix-except-default` default-locale pass shared the input `FileRoute` reference. A downstream consumer mutating any flat field on the returned route (e.g. a build tool that sets `route._buildId = ...`) would corrupt the original `routes` input. Real-world hazard: `expandRoutesForLocales` is called by BOTH `vite-plugin.ts`'s virtual-route module load AND `ssg-plugin.ts`'s pre-render path expansion — both pass the SAME `routes` array. One mutating the other's view is a class of cross-build corruption.

The non-default locale path was already correct (it spreads `{ ...route, urlPath, dirPath, depth }`). The default-locale path now does the same minimal `{ ...route }` shallow clone. Shallow is sufficient: every FileRoute field is a primitive or a stable (immutable-treated) object — the only nested field is `exports`, which is a boolean-flags + literal-values record that no consumer mutates.

**2. Locale-major loop ordering.** Pre-fix the outer loop was route-major (`for route in routes { for locale in locales }`), producing output sorted by route → locale: `/about, /de/about, /cs/about, /contact, /de/contact, /cs/contact`. Locale-major (`for locale in locales { for route in routes }`) produces `/about, /contact, /de/about, /de/contact, /cs/about, /cs/contact` — all default-locale routes first, then each non-default locale's full subtree together. More predictable for debugging and stable under route additions (a new route inserts into its own locale block instead of fanning across the whole output). The route-tree builder doesn't depend on ordering, so this is safe.

**Regression coverage**: 6 new tests in `i18n-routing.test.ts` under the `PR-S10: expandRoutesForLocales shallow-clone + locale-major` describe block (shallow-clone identity, mutation-doesn't-affect-input, two-calls-isolated, locale-major-ordering, empty-locales no-op, single-default-locale no-op). Bisect-verified: reverting `i18n-routing.ts` fails 4 of 6 with documented error messages; restored → 73/73 i18n tests + 1028/1029 zero tests pass.

**No public API change**: function signature unchanged; output is `FileRoute[]` shallow-cloned from input. Behavioral observable change is the ordering (consumers that asserted output order — none of which exist in the monorepo — would notice).
