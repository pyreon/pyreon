---
'@pyreon/runtime-server': minor
'@pyreon/zero': patch
---

`<Image priority>` coverage bundle — closes 3 gates left open by #1353 + fixes a real framework bug surfaced during e2e.

**Framework bug fixed.** Pyreon's SSR `toAttrName` kebab-cased ALL camelCase props (`srcSet → src-set`, `fetchPriority → fetch-priority`, `crossOrigin → cross-origin`) — but these are STANDARD HTML attributes the spec defines as LOWERCASE-NO-DASH. Browsers silently ignore `fetch-priority`/`src-set`/`cross-origin`, so a body `<img fetchPriority="high" srcSet="…">` rendered correctly to Pyreon's eyes but produced HTML the preload scanner couldn't act on.

Fix: a `HTML_ATTRIBUTE_MAP` allow-list in `@pyreon/runtime-server`'s `toAttrName` carves out the React-style camelCase props that map to lowercase HTML attrs. Mirrors React's `possibleStandardNames`. Pre-existing kebab default still applies to user-defined / unknown camelCase props (e.g. `dataTestId → data-test-id` — test in `ssr.test.ts:650` still passes).

| JSX prop | Before | After |
|---|---|---|
| `srcSet` | `src-set` | `srcset` |
| `fetchPriority` | `fetch-priority` | `fetchpriority` |
| `crossOrigin` | `cross-origin` | `crossorigin` |
| `referrerPolicy` | `referrer-policy` | `referrerpolicy` |
| `tabIndex` | `tab-index` | `tabindex` |
| `readOnly` | `read-only` | `readonly` |
| `maxLength` | `max-length` | `maxlength` |
| `colSpan` | `col-span` | `colspan` |
| `autoComplete` | `auto-complete` | `autocomplete` |
| `acceptCharset` | `accept-charset` | `accept-charset` (kebab — HTML spec) |
| `httpEquiv` | `http-equiv` | `http-equiv` (kebab — HTML spec) |
| `dataTestId` | `data-test-id` | `data-test-id` (unchanged — fallback) |

3 new regression tests in `runtime-server/src/tests/ssr.test.ts` lock the allow-list (lowercase, kebab, boolean attrs). Bisect-verified: reverting the allow-list to the old kebab default fails 2 of 3 specs with `expected '<img src-set=…' to contain 'srcset='`. Restored → 169/169 pass.

**Coverage closures for PR #1353:**

- **`docs/docs/images-and-fonts.md`** — new documentation page covering the bi-modal `<Image>` API (descriptor + string forms), descriptor `toString` compat, `createImageRegistry`, priority preload semantics, font self-hosting + preload, and the `image: false` / `font: false` opt-out grammar (PR #1356). Wired into the VitePress sidebar between SSG and Create Zero.
- **verify-modes cell** — the existing `ssr-showcase × ssg` autodetect cell now asserts `dist/image-priority-probe/index.html` carries `<link rel="preload" as="image" fetchpriority="high" imagesrcset="…" crossorigin="anonymous">` in `<head>`. **Bisect-verified end-to-end**: stashing the `useHead` block fails the cell with the documented error message; restoring → 23/23 modes green.
- **Real-Chromium e2e** — 2 specs in `e2e/ssr-showcase.spec.ts`: (a) preload `<link>` is present in the initial HTML response (before hydration runs — preload scanner can see it), (b) body `<img>` carries `fetchpriority="high"` + `loading="eager"`. The second spec is what surfaced the framework bug above.
- **`examples/ssr-showcase/src/routes/image-priority-probe.tsx`** — minimal route exercising `<Image priority>` with `srcset` + cross-origin URL. Drives both gates above.

**Validation:** 23/23 verify-modes • 1193/1194 zero • 169/169 runtime-server (+3 new) • 2/2 priority preload e2e • 117/117 ssr-showcase e2e • 11/11 validate-fast gates • typecheck + lint clean.
