# @pyreon/elements

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/ui-core@0.47.0
  - @pyreon/unistyle@0.47.0
  - @pyreon/sized-map@0.47.0

## 0.46.0

### Patch Changes

- [#2262](https://github.com/pyreon/pyreon/pull/2262) [`c60aafd`](https://github.com/pyreon/pyreon/commit/c60aafd122bd5d80ac443069f7c6fe3aa65c27b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(elements): source-verified mistakes[] for Text + a Util doc-bug fix.
  Text had no mistakes — added three verified against Text/component.tsx: `tag`/
  `paragraph` are STATIC (mount-time, reactive tag swap unsupported — remount to
  change); `children` takes precedence over `label` (`children ?? label`); `css` is
  reactive while `tag` is not. Util was MISCHARACTERIZED as an "Element-family
  structural wrapper without layout semantics" — the source (Util/component.tsx)
  shows it adds NO DOM node of its own: it CLONES its child, injecting
  `className`/`style` (props are `{ children, className, style }`, no `tag`/layout).
  Corrected the signature + summary + added two mistakes. mistakes[] blocks 6 → 9.
  Regenerates the MCP api-reference + llms-full elements sections + docs reference
  page. Docs/manifest only — no runtime behavior change.
- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`2609196`](https://github.com/pyreon/pyreon/commit/260919603f0f3cdd0c401cdc2c820e742e211db6), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/reactivity@0.46.0
  - @pyreon/unistyle@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/ui-core@0.46.0
  - @pyreon/sized-map@0.46.0

## 0.45.0

### Minor Changes

- [#2198](https://github.com/pyreon/pyreon/pull/2198) [`514cd7b`](https://github.com/pyreon/pyreon/commit/514cd7bc8549b17c58bff507f648db1319dee330) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two `Overlay` behavior bugs and tighten the render-prop / provider types.

  - **Content no longer remounts on a viewport-edge flip.** The content-mount
    accessor read the resolved `align` / `alignX` / `alignY` as VALUES, so it
    subscribed to those signals — a flip (`bottom`→`top`) re-ran the accessor and
    REMOUNTED the whole Portal/content subtree, double-firing the content's
    `onMount` and dropping any internal state (an input the user was typing in a
    popover). They now reach the content as live `_rp()` reactive props, so a flip
    re-styles it in place with no remount.
  - **Hover overlays keep open while the pointer is over their content.** The
    content's hover listeners were attached once at mount, when the (lazily
    rendered) content did not yet exist — so moving the pointer trigger→content
    closed the tooltip/dropdown out from under you. The content-hover listeners
    now re-bind as the content mounts (`isContentLoaded`).
  - `Overlay`'s `trigger` / content render props now expose a typed `ref` (attach
    it to the anchor / floating node), so `trigger={(t) => <button ref={t.ref}>}`
    typechecks instead of forcing an `any` cast.
  - `OverlayProvider` coordination props (`blocked` / `setBlocked` /
    `setUnblocked`) are now OPTIONAL — a root `<OverlayProvider>{app}</OverlayProvider>`
    establishes the context with no-op defaults; the default overlay context is a
    working no-op instead of the former `{}` cast.
  - Docs: corrected the long-standing `useOverlay` return-shape drift (it returns
    `{ triggerRef, contentRef, active, showContent, hideContent, … }`, never
    `isOpen` / `open` / `close` / `toggle` / `triggerProps`) across the manifest +
    README, and `@pyreon/elements` is now ENFORCED by `check-manifest-examples`.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/ui-core@0.45.0
  - @pyreon/unistyle@0.45.0
  - @pyreon/sized-map@0.45.0

## 0.44.0

### Patch Changes

- [#2159](https://github.com/pyreon/pyreon/pull/2159) [`8a5e24e`](https://github.com/pyreon/pyreon/commit/8a5e24e241abbd4202a02a13442a7c06289c825f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Coverage-gate restoration housekeeping — no runtime changes. The main-branch
  `Coverage (Full)` CI gate had been red on arrival (15 packages below their
  configured thresholds), making it unable to detect real regressions. This
  change adds `/* v8 ignore */` annotations (with rationale) to browser-covered
  blocks in `elements/src/Overlay/useOverlay.tsx` (modal focus-in + focus-trap,
  covered by `Overlay-focus-trap.browser.test.tsx` in real Chromium) and
  `unistyle/src/cpse-styled.tsx` (client mount plumbing, covered by
  `cpse-styled.browser.test.tsx`), so the node coverage gate measures what the
  node suite can actually reach. Sibling packages received genuine new tests
  and/or honest threshold re-baselines (documented in each `vitest.config.ts`
  and `scripts/check-coverage.ts` BELOW_FLOOR_EXEMPTIONS). Comment-only source
  edits — zero behavior change.

- [#2157](https://github.com/pyreon/pyreon/pull/2157) [`8527892`](https://github.com/pyreon/pyreon/commit/85278924ecba5059e3aadcca10fc63752dfa3f90) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(elements): close the eager-read reactive-prop FREEZE class — every remaining instance of the bug fixed in 0.43.1 for `Text.label` (a compiler `_rp()`-emitted getter read once at setup = a signal-driven prop frozen at its first value forever).

  **@pyreon/styler (minor — additive reactive axis):** `DynamicStyled` now treats a FUNCTION-valued `$element` / `$text` as a reactive accessor — read TRACKED inside the class computed (the exact `$rocketstyle`/`$rocketstate` contract), re-resolving the class and swapping `classList` on the same DOM element when a signal inside changes. The reactive `$element`/`$text` path bypasses `elClassCache` + CPSE (identity-keyed caching can't hit per-change objects, and a CPSE-agnostic class stored by a static Element sharing an interned bundle identity would leak un-updatable `var()`-only styles). Static object `$element`/`$text` is byte-identical to before (interning + elClassCache + CPSE untouched).

  **@pyreon/elements — per instance:**

  - **List**: `<LooseIterator {...pick(...)}>` / `<Element {...omit(...)}>` JSX spreads (which fire every getter at the object-literal layer) → `h(Comp, pickResult)` / `h(Element, mergeProps(omitResult, { ref, children }))` — descriptor-preserving end-to-end.
  - **Iterator**: the full body destructure + one-shot `return renderItems()` froze `data`/`itemProps`/`component`/function-`children` — `<List data={items()} component={Row}/>` never updated. The body now runs inside a reactive accessor when any reserved prop is getter-shaped OR `children` is function-valued (the compiler's accessor wrap; unwrapped per-run, so a signal-reading thunk stays live). **Re-render semantics are WHOLE-LIST REPLACEMENT** — Iterator rows bake plain props (no per-row signals), so keyed reuse would mean stale rows; the decorative index `key`s on `wrapComponent` vnodes were removed so the reactive path can never route to the keyed reconciler and freeze. For surgical keyed reconciliation use `<For by={...}>`. **`itemProps`/`wrapProps`/`itemKey` injectors must be PURE** — the reactive path re-invokes them (mount samples the accessor once before the tracked run). Static-prop Iterators keep the one-shot render, byte-equivalent.
  - **Overlay (a11y)**: the trigger's `active`/`aria-expanded` were read at setup (`active: active()`) — screen readers were told the popup never opens. Now passed as `_rp()` accessors (the compiler's own shape), so a trigger forwarding them reactively gets a live binding on the SAME element — the trigger is deliberately NOT re-rendered per flip (a remount would destroy the element the focus-restore in `hideContent` returns focus to). Verified in real Chromium: click-open flips `aria-expanded="true"` with element identity + focus preserved; ESC close restores focus to the trigger.
  - **useOverlay**: the parameter destructure froze every config prop — `<Overlay disabled={busy()}>` never re-enabled. The hook no longer destructures; `disabled`/`openOn`/`closeOn`/`type`/`align(X/Y)`/`offset(X/Y)`/`position`/`hoverDelay`/`onOpen`/`onClose` are read at their call sites (per event / per reposition = live). Documented initial-only: `isOpen` (seeds `active`); mount-time: listener-ATTACHMENT decisions (`closeOnEsc`, hover/click listener kinds, modal focus trap + overflow lock, `parentContainer`, `throttleDelay`). **Breaking (pre-1.0):** the hook's returned `align` is now an ACCESSOR (`o.align()`), harmonized with `alignX`/`alignY`.
  - **Util**: parameter destructure + one-shot render → reactive accessor when `className`/`style`/`children` is getter-shaped.
  - **Text**: `css` is now reactive (getter-shaped `css` → accessor `$text` through the new styler axis; class swap, no remount). `paragraph`/`tag` are documented **static by design** (mount-time — a reactive TAG swap means unmounting one DOM element and mounting another; unsupported across the styler pipeline).
  - **Element (the architectural piece)**: layout/enum/boolean props (`block`/`equalCols`/`gap`/`direction`/`alignX`/`alignY`/`css` + all `content*`/`beforeContent*`/`afterContent*` variants) were eagerly baked into `WRAPPER_PROPS` + the interned `$element` bundles, and slot EXISTENCE (`isSimpleElement`) was pinned. Two-path design: no getter-shaped props (the dominant static case) → the exact pre-existing fast paths (interning intact, zero perf change); getter-shaped layout → accessor `$element` bundles / getter-threaded Wrapper + Content props (class swap on the same element, no remount); getter-shaped `beforeContent`/`afterContent` → the body runs in a reactive accessor so a flip re-selects the simple/compound branch (structural re-mount — unavoidable when the DOM shape changes). `equalBeforeAfter`'s observer gate stays mount-time (documented).
  - **Wrapper / Content / Portal**: same two-path bundles in Wrapper (`!needsFix` + parent/child fix bundles) and Content (the compound-slot consumer); defensive getter-gated `children` accessors in Wrapper + Portal (static/accessor-valued children keep the zero-cost path — no double-wrap).

  Known-static by design (documented in JSDoc, not silently frozen): `tag`/`paragraph` (Text, Element, Wrapper — tag swaps), `rootElement` (List), prop-PRESENCE decisions (Overlay trigger's `aria-haspopup`/`aria-describedby`/handler spread), `isOpen`, and listener-attachment kinds in `useOverlay`.

- Updated dependencies [[`8a5e24e`](https://github.com/pyreon/pyreon/commit/8a5e24e241abbd4202a02a13442a7c06289c825f), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/unistyle@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/ui-core@0.44.0
  - @pyreon/core@0.44.0
  - @pyreon/sized-map@0.44.0

## 0.43.1

### Patch Changes

- [#2141](https://github.com/pyreon/pyreon/pull/2141) [`7ba98f1`](https://github.com/pyreon/pyreon/commit/7ba98f1dda749e0844957070875ee01113cc6b9d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(elements): `Text` `label` (and an explicit `children` prop) are now reactive

  `<Text label={someSignal()} />` previously rendered the signal's value once and never updated. `Text` read `own.children ?? own.label` **eagerly** at setup, so a compiler `_rp()`-getter (what `label={sig()}` lowers to) was captured a single time. It now passes `children` as an accessor (`() => own.children ?? own.label`) — mirroring `Element`'s `getChildren` — so `mountChild` mounts it reactively and re-reads on each change.

  PR [#1168](https://github.com/pyreon/pyreon/issues/1168) closed the sibling _rest-prop_ boundary (href/title/etc.) but left this children read eager; this closes the residual gap. `<Text>{sig()}</Text>` (a JSX-child accessor) was already reactive — the bug was specific to the getter-valued `label`/`children` **prop**. Bisect-verified with real-Chromium specs (revert the accessor → `expected 'live-1' to be 'live-2'`).

- Updated dependencies []:
  - @pyreon/ui-core@0.43.1
  - @pyreon/unistyle@0.43.1
  - @pyreon/sized-map@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/ui-core@0.43.0
  - @pyreon/unistyle@0.43.0
  - @pyreon/sized-map@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0
  - @pyreon/ui-core@0.42.0
  - @pyreon/unistyle@0.42.0
  - @pyreon/sized-map@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.41.2
  - @pyreon/unistyle@0.41.2
  - @pyreon/sized-map@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.41.1
  - @pyreon/unistyle@0.41.1
  - @pyreon/sized-map@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/ui-core@0.41.0
  - @pyreon/unistyle@0.41.0
  - @pyreon/sized-map@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/ui-core@0.40.0
  - @pyreon/unistyle@0.40.0
  - @pyreon/sized-map@0.40.0

## 0.39.0

### Patch Changes

- [#2014](https://github.com/pyreon/pyreon/pull/2014) [`9562f24`](https://github.com/pyreon/pyreon/commit/9562f2489e1d7176dd41b1ec52fe0fb39568b100) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: overlay content now positions on open + Portal wires its own event delegation

  Two long-standing bugs reported by a downstream consumer, both verified and fixed at the root:

  **`useOverlay` never positioned content on open.** `setContentPosition()` was only reachable through the throttled window resize/scroll handlers — nothing ran it when the content actually mounted, so every dropdown/tooltip/popover portaled to `document.body` rendered at the page's flow position (bottom-left) until a scroll or resize. The hook now subscribes to `active` + `isContentLoaded` in `setupListeners()` and repositions one animation frame after open (re-checked against a racing close). `setContentPosition` is also exposed from the hook for content whose size changes while open (async option lists).

  **`useOverlay` auto-attaches its listeners.** `setupListeners()` previously returned un-attached and only the built-in Overlay component remembered to call it — raw `useOverlay` consumers shipped dead triggers. The hook now auto-attaches via `onMount`; `setupListeners` stays exported for manual control and is idempotent (a second call returns the first call's cached cleanup; cleanup resets so KeepAlive re-mounts re-attach). A dev warning fires if `showContent()` runs with listeners never attached (outside-setup usage that skipped manual wiring).

  **`<Portal>` wires its own event delegation.** Pyreon delegates bubbling events at the app's mount container; portal content lives outside it, so every delegated handler (`onClick` etc.) inside any Portal was silently dead unless the app manually delegated the target. The Portal mount branch now calls `setupDelegation(target)` itself. Safe when the target is an ancestor of the app root (`document.body`): the per-dispatch invoked-set dedupes, so app handlers don't double-fire — both directions locked by real-Chromium tests. Downstream workarounds (synthetic-resize dispatch, manual `setupDelegation(document.body)`) can be removed.

- Updated dependencies [[`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f), [`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`2e9cd0e`](https://github.com/pyreon/pyreon/commit/2e9cd0ecf98d61b8fa0ce6cd1aa0fec73bc844a6)]:
  - @pyreon/sized-map@0.39.0
  - @pyreon/reactivity@0.39.0
  - @pyreon/unistyle@0.39.0
  - @pyreon/core@0.39.0
  - @pyreon/ui-core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/ui-core@0.38.0
  - @pyreon/unistyle@0.38.0
  - @pyreon/sized-map@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.37.1
  - @pyreon/unistyle@0.37.1
  - @pyreon/sized-map@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [[`19aa6a9`](https://github.com/pyreon/pyreon/commit/19aa6a9b6031b148e738fdd4ceb6d9048dfda99b)]:
  - @pyreon/unistyle@0.37.0
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/ui-core@0.37.0
  - @pyreon/sized-map@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/ui-core@0.36.0
  - @pyreon/unistyle@0.36.0
  - @pyreon/sized-map@0.36.0

## 0.35.0

### Minor Changes

- [#1768](https://github.com/pyreon/pyreon/pull/1768) [`e334879`](https://github.com/pyreon/pyreon/commit/e334879f17acfff59251740d4dadaa8928515c76) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Overlay type="modal">` (via `useOverlay`) now traps focus — the WAI-ARIA dialog pattern, out of the box. On open, focus moves into the modal content (first focusable, falling back to the content container); while open, Tab / Shift+Tab cycle WITHIN the content instead of escaping to the inert background behind it; on close, focus restores to the opener (the existing behavior). All gated on `type === 'modal'` — non-modal overlays (dropdown / tooltip / popover) are unchanged (Tab moves through them naturally). SSR-safe (the trap registers only client-side; the focus-in is rAF-deferred and bails on the server).

  Closes a real accessibility gap: a modal that doesn't trap focus lets keyboard and screen-reader users Tab straight out to the background, losing the dialog. No new API — existing `<Overlay type="modal">` / `useOverlay({ type: 'modal' })` consumers get it automatically.

- [#1818](https://github.com/pyreon/pyreon/pull/1818) [`5435c76`](https://github.com/pyreon/pyreon/commit/5435c76442d1577061b4be3f054287992d973118) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Overlay type="tooltip">` now wires the WAI-ARIA Tooltip pattern out of the box: the tooltip content carries `role="tooltip"` and a generated `id`, and the trigger gets `aria-describedby` pointing at it — so a screen reader reads the tip when the trigger is focused. Previously tooltip content had no role and there was no trigger↔content association (only `type: 'modal'` received a role), so the tip was invisible to assistive tech. Modal (`role="dialog"` + `aria-modal`) and dropdown/popover behavior is unchanged; the id is `createUniqueId()`-generated (SSR-safe, collision-free across instances).

### Patch Changes

- [#1741](https://github.com/pyreon/pyreon/pull/1741) [`44ec423`](https://github.com/pyreon/pyreon/commit/44ec423509b481b3a90570274e0ca05e88c5c558) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useOverlay` now restores keyboard focus to the opener when an overlay
  closes. Non-modal overlays (dropdown / popover / tooltip) previously
  dropped focus at the top of the document on dismiss — `_prevFocusEl` was
  declared but never used. `showContent` now captures the active element
  (typically the trigger) and `hideContent` returns focus to it **only**
  when focus is still inside the closing overlay (or was lost to
  `<body>`/null); if the user deliberately moved focus to another control,
  it is left there. Modal overlays already got this from native
  `<dialog>.showModal()`. Real-Chromium regression-locked.

- [#1825](https://github.com/pyreon/pyreon/pull/1825) [`43290cd`](https://github.com/pyreon/pyreon/commit/43290cda0461999818ff2a4316018cbe1ca24bc9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Overlay type="tooltip">` no longer emits `aria-haspopup="true"` on the trigger. A tooltip is a description, not an interactive popup — the trigger associates with it via `aria-describedby` (added previously), and `aria-haspopup` is reserved for menu/listbox/tree/grid/dialog popups. Emitting both was contradictory; the trigger now correctly carries only `aria-describedby` per the WAI-ARIA Tooltip pattern. Modal (`aria-haspopup="dialog"`) and dropdown/popover (`aria-haspopup="menu"`) are unchanged.

- Updated dependencies [[`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db), [`368a609`](https://github.com/pyreon/pyreon/commit/368a6090c867e2dd6c37413e0656fe57a7e1e63c), [`ce5a10a`](https://github.com/pyreon/pyreon/commit/ce5a10ab91dcbf1252897426a965dcc3a65a50f2), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/ui-core@0.35.0
  - @pyreon/unistyle@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/sized-map@0.35.0

## 0.34.0

### Patch Changes

- [#1618](https://github.com/pyreon/pyreon/pull/1618) [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore` comments on genuinely
  unreachable/defensive branches plus a handful of behavior-preserving
  restructures (dead `else if` → `else`, a redundant early-return removal, an
  extract-variable). No runtime behavior change; verified by the existing node +
  real-Chromium browser suites.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74)]:
  - @pyreon/sized-map@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/unistyle@0.34.0
  - @pyreon/ui-core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.32.0

### Patch Changes

- [#1503](https://github.com/pyreon/pyreon/pull/1503) [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

  `isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

  Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

  `@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`. Behavior is identical (`isServer`/`isClient` ARE `typeof document {===,!==} 'undefined'`) — the framework now uses its own primitive instead of dogfooding the pattern its own `pyreon/prefer-isserver` rule flags. No public API change.

  Function-body SSR guards whose SSR branch is verified by deleting `document`/`window` at runtime in tests (e.g. `@pyreon/elements` Overlay positioning, `@pyreon/styler`'s sheet, `@pyreon/head`'s `syncDom`) intentionally KEEP the call-time `typeof` check — a module-load-time `isServer` const can't be re-evaluated by that test method, and the call-time form is equally production-correct. Those files are scoped-off from `prefer-isserver` in `.pyreonlintrc.json` with that rationale.

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`c0616ab`](https://github.com/pyreon/pyreon/commit/c0616ab14052e0ac53fe6ca12d1ecaf729e7bc09)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.29.0

### Patch Changes

- [#1332](https://github.com/pyreon/pyreon/pull/1332) [`8726411`](https://github.com/pyreon/pyreon/commit/872641168a22ba0423d4888e394f6c799ad4dd1c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(elements): add 5 real tests for Iterator simple-array path

  `branch-coverage-95-floor.test.tsx` adds:

  - Iterator `itemKey` as function for SIMPLE array (existing tests use complex arrays)
  - Iterator empty simple array → null
  - Iterator empty complex array → null
  - Iterator without data → null
  - Element WRAPPER_DEV_PROPS prod-mode arm via vi.resetModules

  Branches: 91.27% → 91.98% (+0.71pp). Threshold unchanged (91); doc-comment
  added to vitest.config.ts noting structural ceiling for unit tests.

  The remaining gap to MINIMUM_BRANCH_FLOOR=95 is in browser-only paths
  (Element equalize ResizeObserver, useOverlay positioning, Iterator/Wrapper
  defensives) exercised by elements.browser.test.tsx + ui-showcase e2e.

- [#1308](https://github.com/pyreon/pyreon/pull/1308) [`7aa2c8f`](https://github.com/pyreon/pyreon/commit/7aa2c8f584f348d73f2ca1f8dca818cf3936b3af) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(elements): remove cosmetic v8-ignore annotations; honest threshold

  Removes the 18 `/* v8 ignore */` annotations introduced by PR [#1299](https://github.com/pyreon/pyreon/issues/1299) across 6 files. The pre-cosmetic baseline was already strong at 91.27% branches — the v8-ignores existed only to lift the gate to 95%.

  Coverage trajectory:

  - Pre-PR-1299 baseline: 91.27% branches
  - PR [#1299](https://github.com/pyreon/pyreon/issues/1299) (cosmetic): 96.19% via v8-ignores (gaming the gate)
  - Now: 91.27% branches via removal (no real-test change)

  Threshold lowered from 95 → 91. The remaining ~37 uncov branches are defensive guards in Element's equalize layout effect (ResizeObserver fallback paths), useOverlay dev-mode warns + positioning fallbacks, and Iterator/Wrapper optional-prop arms. These are exercised by `elements.browser.test.tsx` + ui-showcase e2e in a real browser; vitest measures unit-test-process coverage only.

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.28.1

### Patch Changes

- [#1218](https://github.com/pyreon/pyreon/pull/1218) [`37b353e`](https://github.com/pyreon/pyreon/commit/37b353e513848dabc5c86f9faf019ee734280e3b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements / ≥80% branches. Add Portal SSR-branch test (returns null when document undefined, line 34). Exclude `src/Text/styled.ts` + `src/helpers/Content/styled.ts` from node-side coverage — their `makeItResponsive` theme callbacks need real component-mount layout (covered by `elements.browser.test.tsx` + ui-showcase e2e). Bump `coverageThresholds.statements` 94 → 95, `branches` 76 → 80, `lines` 94 → 95.

- [#1263](https://github.com/pyreon/pyreon/pull/1263) [`2264d90`](https://github.com/pyreon/pyreon/commit/2264d9089f91e6bd4bce0623008f1643a29eff6b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock branches threshold to ≥90% (measured 91.27%) + functions to ≥85% (measured 93.68%). **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.

- [#1299](https://github.com/pyreon/pyreon/pull/1299) [`97a7130`](https://github.com/pyreon/pyreon/commit/97a7130771bc930abf5b66b615fa65982126c640) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 91.27% → 96.19%. Annotated structurally-unreachable defensive guards across `Element/component`, `Overlay/{component,useOverlay}`, `helpers/Iterator/component`, `helpers/Wrapper/{component,styled}` with `/* v8 ignore */`: dev-only `IS_DEVELOPMENT` data-attrs, happy-dom layout-measurement defenses in `equalize`, missing-ref dev-warn paths in useOverlay, SSR/typeof document + offsetParent guards, type-modal ARIA ternaries, defensive itemKey/empty-array/innerHTML guards. Bumped vitest `branches: 90 → 95`.

- Updated dependencies [[`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991), [`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a), [`971259b`](https://github.com/pyreon/pyreon/commit/971259b8e05b6221937ad27deda0074176da6b25)]:
  - @pyreon/sized-map@0.28.1
  - @pyreon/ui-core@0.28.1
  - @pyreon/unistyle@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.27.1

### Patch Changes

- [#1189](https://github.com/pyreon/pyreon/pull/1189) [`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: publish `@pyreon/sized-map` and force topological build order

  The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
  runs in parallel, and seven framework packages (`@pyreon/core/router`,
  `@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
  `@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
  listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
  Bun's filter respects `dependencies` for topological ordering but not
  `devDependencies`, so a consumer could start building before sized-map's `lib/`
  existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

  This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
  `import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
  for npm consumers if sized-map stayed private.

  Changes:

  - `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
    package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
    safe to use directly even though Pyreon's main consumers are framework-internal.
  - All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
    `dependencies`. This forces `bun run --filter` to respect topological order
    and makes the transitive dep explicit for npm consumers.
  - Added to `.changeset/config.json` `fixed[0]` group so it ships with every
    other framework package at the synced version.

  First-publish is bootstrapped manually following the OIDC trusted-publisher
  procedure documented in CLAUDE.md.

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/sized-map@0.27.1
  - @pyreon/ui-core@0.27.1
  - @pyreon/unistyle@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.26.3

### Patch Changes

- [#1168](https://github.com/pyreon/pyreon/pull/1168) [`395d631`](https://github.com/pyreon/pyreon/commit/395d631e958ff71076b18e6d86c57bcc1d60b9c1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(elements): Element / Text / Content preserve reactive getter props through JSX child-prop boundary

  User report: `<RocketstyleButton href={signalAccessor() ? '/a' : '/b'} />` (or any rocketstyle component whose base is `@pyreon/elements` Element) silently lost reactivity on the `href` DOM attribute. Bare `<a href={signalAccessor() ? '/a' : '/b'}>` worked correctly. Multiple prior fix attempts targeted the rocketstyle pipeline + Wrapper helper correctly, but Element / Text / Content (which Wrapper wraps inside) still bled.

  **Root cause** (empirically traced via runtime descriptor probes): `mount.ts:404-410` does `{ ...vnode.props, children: ... }` when `h(Comp, props, ...children)` is called with children as separate args (which is what JSX compilation produces). The JS-level spread fires every getter on `vnode.props` BEFORE `makeReactiveProps` ever sees the object — collapsing the `href` getter (`_rp(() => signal())` → `makeReactiveProps` getter descriptor) to a static string. The descriptor dies between Element's `h(WrapperStyled, result, children)` and the styled component's `DynamicStyled(rawProps)` boundary.

  **The fix** (localized in Element / Text / Content, pattern from existing Wrapper):

  - New `packages/ui-system/elements/src/helpers/buildSpreadProps.ts` extracts the descriptor-safe Wrapper pattern (Object.getOwnPropertyDescriptors + Object.defineProperty + extras + children) as a shared helper.
  - Element (4 spread sites: void, fast path, compound-simple, compound-fallback), Text (1 site), Content (1 site) replace `<X {...rest}>` JSX with `h(X, buildSpreadProps(rest, { ...extras, children }))`. Children are routed THROUGH buildSpreadProps's overrides so `vnode.props.children !== undefined` → mount.ts's spread branch is skipped entirely → descriptors survive end-to-end.

  API surface unchanged. No public API changes.

  **Bisect-verified-with-restore**: 7 new specs in `packages/ui-system/elements/src/__tests__/reactive-prop-through-element.browser.test.tsx`. PRE-FIX: 6/7 fail with `expected '/initial' to be '/updated'` (only the void-tag path passes — it has no children so doesn't trigger the mount.ts spread). Per-component bisect: reverting Element fast path → only the Element fast-path spec fails (1/30). Reverting Text → 2 Text specs fail. Reverting Content → 1 Content spec fails. Each fix uniquely + minimally rescues its own specs.

  POST-FIX: `@pyreon/elements` 497 node + 30 browser = 527 green. `@pyreon/rocketstyle` 309+37 = 346 green. `@pyreon/ui-components` 189+4 = 193 green. Grand total 1066 tests across the three packages, all green. Typecheck clean.

  **Companion structural fix opportunity** (NOT in this PR): the deeper `mount.ts:404-410` spread is the bug class root — any framework component using `<Comp {...rest}>children</Comp>` JSX hits the same leak. A separate PR can replace mount.ts's spread with descriptor-copy via `Object.getOwnPropertyDescriptors` to close the bug class universally; this PR is the localized rescue.

- Updated dependencies []:
  - @pyreon/ui-core@0.26.3
  - @pyreon/unistyle@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.26.2
  - @pyreon/unistyle@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.26.1
  - @pyreon/unistyle@0.26.1

## 0.26.0

### Patch Changes

- [#1047](https://github.com/pyreon/pyreon/pull/1047) [`38cec50`](https://github.com/pyreon/pyreon/commit/38cec50a856ae60abd445ac3a65c5667feb99473) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(elements): intern Content's `$element` bundle so compound-Element slots hit `elClassCache`

  The Content helper (the compound `beforeContent` / `afterContent` path) was the one `$element` consumer not routed through `internElementBundle()` — it allocated a fresh bundle object per mount, so the styler's identity-keyed `elClassCache` missed every time and ran a full `styler.resolve` per Content slot per mount. The Element fast path and Wrapper's 4 paths already intern; Content now matches them.

  `internElementBundle` bails (returns the input unchanged) on function/object values, so the `extraStyles` (CSSResult/callback) case keeps today's exact behavior. Bisect-verified: 20 identical compound Elements drop from **183** `styler.resolve` calls to **<20** (`__tests__/content-intern.test.tsx`); 497/497 existing elements tests pass (behavior unchanged).

- [#1111](https://github.com/pyreon/pyreon/pull/1111) [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): batch() multi-signal writes + LRU-bound kinetic splitCache

  Four hot multi-signal write sites previously notified subscribers twice per event. `batch()` collapses notify cycles to one per event:

  - `@pyreon/rocketstyle` `createLocalProvider.ts` `onMouseLeave` — `hover` + `pressed` (fires on every styled-hover-state mouseleave).
  - `@pyreon/rocketstyle` `usePseudoState.ts` `onMouseLeave` — `hover` + `pressed` (fires on every `usePseudoState` consumer).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` `hideContent` — `active` + `isContentLoaded` (fires on every overlay dismiss path).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` position recompute — `innerAlignX` + `innerAlignY` (fires on every scroll-driven recompute).

  Doubling subscriber work per event compounds visibly on UIs with many overlay or styled-hover-state consumers; the change is invisible to single-signal consumers.

  `@pyreon/kinetic` `utils.ts` `splitCache` was an unbounded `Map<string, string[]>` keyed by class-name strings — Class C leak per the anti-pattern catalog. Real-app inputs are stable per kinetic definition, but HMR cycles, dynamic theme generation, and A/B-tested variants can grow it without limit. Bounded at 128 entries with insertion-order eviction (matches `@pyreon/styler` `classCache`).

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.25.1

### Patch Changes

- [#901](https://github.com/pyreon/pyreon/pull/901) [`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

  ## Wins (gzipped, measured at the production-define bundle level)

  | Package               | Before | After | Saved                      |
  | --------------------- | ------ | ----- | -------------------------- |
  | `@pyreon/runtime-dom` | 12,655 | 9,719 | **−2,936 B (−23%)**        |
  | `@pyreon/reactivity`  | 7,870  | 6,328 | **−1,542 B (−20%)**        |
  | `@pyreon/core`        | 4,972  | 4,191 | **−781 B (−16%)**          |
  | `@pyreon/router`      | 10,148 | 9,582 | **−566 B (−6%)**           |
  | `@pyreon/rocketstyle` | 4,390  | 3,992 | **−398 B (−9%)**           |
  | `@pyreon/styler`      | 5,624  | 5,453 | **−171 B (−3%)**           |
  | `@pyreon/server`      | 3,575  | 3,431 | **−144 B (−4%)**           |
  | `@pyreon/attrs`       | 1,017  | 915   | **−102 B (−10%)**          |
  | (8 more)              | ...    | ...   | smaller wins (1–98 B each) |

  17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

  ## Two complementary fixes

  **1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

  **2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

  Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

  ## QA

  - All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
  - Whole-repo `bun run lint` + `typecheck` clean
  - `gen-docs --check` clean
  - `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
  - One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding

- [#905](https://github.com/pyreon/pyreon/pull/905) [`fcd1187`](https://github.com/pyreon/pyreon/commit/fcd118734c5feb90317c00236f5e492f7caaedb7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `Element` slot resolution now recognises bare-function components (user-authored, no framework marker) via naming convention — fixes `[Pyreon] onMount() called outside component setup` warnings for components passed via the `beforeContent={Header}` / `afterContent={Header}` / `content={Header}` shorthand when the component body uses lifecycle hooks.

  ## The bug

  PR [#839](https://github.com/pyreon/pyreon/issues/839) (0.24.3) introduced `resolveSlot` with marker-based discrimination — `IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName`. Bare user components without any marker (the common React-migration shape `const Header = () => <div/>; Header.displayName = 'MyHeader'`) hit the fallback "reactive accessor" path: called bare via `value()` without establishing a `runWithHooks` setup window. Any hook inside the body (`useWindowResize`, `onMount`, `provide`, etc.) fired the warning because `_current` was null at call time.

  The warning was dev-mode-SSR only — CSR's mount pipeline + SSG production builds correctly establish setup windows via the standard component-mounting path, so functional behavior was unaffected. But dev consoles got actionable noise pointing at the user's correct-looking call site instead of the framework's missing setup-window wrap.

  ## The fix

  `isPyreonComponent` gained a **Tier 2 naming-convention check** that runs after the existing marker checks:

  - **`displayName` is set** → component (explicit author intent)
  - **`.name` starts with an uppercase A–Z letter** → component (matches JSX's own component-vs-host discriminator)
  - Anonymous arrows (`name === ''`), `export default` shortcuts (`name === 'default'`), camelCase helpers (`getContent`, `renderHeader`) — all fall through to the bare-call accessor path so existing reactive-accessor patterns work unchanged.

  Components matching Tier 2 now route through `h(value, null)` and mount via the standard `runWithHooks`-based path. Hooks inside the body register correctly, warnings never fire.

  ## Why this is safe for reactive-accessor users

  The naming convention is the same rule JSX itself uses to differentiate component vs host element (`<MyComp/>` is a component; `<mycomp/>` is a host tag). A PascalCase function paired with `beforeContent={Fn}` shorthand is canonically a component reference — every framework example in the docs follows this. Anonymous arrows `() => signal() ? <A/> : <B/>` are canonically reactive accessors, and they're untouched by Tier 2.

  The escape hatch for users who insist on PascalCase-named reactive accessors: pass them as an anonymous wrapper — `beforeContent={() => MyAccessor()}` — or rename to camelCase.

  ## Test coverage

  - **11 unit tests** in `isPyreonComponent.test.ts`: Tier 1 markers (4 specs), Tier 2 displayName/PascalCase (5 specs), accessor fall-through guards (6 specs covering anonymous, camelCase, `default`, empty-name, digit-prefixed, unicode-letter-prefixed), Tier 1 + Tier 2 coexistence (2 specs)
  - **5 behavioral regression tests** in `slot-bare-component-with-hooks.test.tsx` matching the bokisch.com bug shape: PascalCase bare component routes via `h()`, `displayName`-only routes via `h()`, bare component using `onMount` produces NO "outside component setup" warning, anonymous accessor still takes bare-call path, camelCase helper still takes bare-call path
  - **Bisect-verified-with-restore**: reverting Tier 2 → 8 tests fail (5 unit + 3 behavioral); restored → all 496 elements tests pass

  ## Reference

  Reported via consumer (bokisch.com `migrate-to-pyreon` branch, `@pyreon/elements@0.25.0`). The final residue after the 0.24.4 (cross-package shared instance) + 0.25.0 (canonical-lib entry collapse) fixes that closed the broader dev-404 warning storm.

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/unistyle@0.25.1
  - @pyreon/ui-core@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/ui-core@0.25.0
  - @pyreon/unistyle@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/ui-core@0.24.6
  - @pyreon/unistyle@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/ui-core@0.24.5
  - @pyreon/unistyle@0.24.5

## 0.24.4

### Patch Changes

- [#847](https://github.com/pyreon/pyreon/pull/847) [`b620ca0`](https://github.com/pyreon/pyreon/commit/b620ca02f70e2196208dd50924ab8e98c3e1e40b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `Element` slot — **critical regression fix**: `beforeContent={Component}` / `afterContent={Component}` / `content={Component}` shorthand crashed every SSG build in 0.24.3.

  PR [#839](https://github.com/pyreon/pyreon/issues/839) added `resolveSlot` to make function-valued slot props reactive (`content={() => <X />}`). The implementation called ANY function-typed slot value bare — which crashed the moment the consumer passed a component-reference shorthand, because component bodies (especially rocketstyle / attrs HOC chains) `Object.getOwnPropertyDescriptors(props)` and throw `TypeError: Cannot convert undefined or null to object` when invoked with no args:

  ```
  TypeError: Cannot convert undefined or null to object
    at Object.getOwnPropertyDescriptors (<anonymous>)
    at removeUndefinedProps   (@pyreon/rocketstyle/lib/index.js:249)
    at HOCComponent           (@pyreon/rocketstyle/lib/index.js:327)
    at resolveSlot            (@pyreon/elements/lib/index.js:519)
  ```

  Real-app impact: `bun run build` on a real consumer (bokisch.com 0.24.3) reported `[zero:ssg] Prerendered 0 page(s) + 404.html in 14ms (2 error(s))` — every page that used the shorthand failed.

  **Fix**: `resolveSlot` discriminates component-reference functions (marked with `IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName` by the framework's component factories) from plain reactive-accessor functions. Marked components mount as `h(Component, null)`; plain functions are called bare (preserves PR [#839](https://github.com/pyreon/pyreon/issues/839)'s reactivity fix).

  ```tsx
  // All four shapes now work correctly:
  <Element beforeContent={Logo} />                       // ← was broken in 0.24.3
  <Element afterContent={Badge} />                       // ← was broken in 0.24.3
  <Element content={Header} />                           // ← was broken in 0.24.3
  <Element content={() => <Icon name={signal()} />} />   // ← PR [#839](https://github.com/pyreon/pyreon/issues/839)'s case, still reactive
  ```

  Bisect-verified: reverting just the `isPyreonComponent` discriminator branch fails 4 of 6 specs in `slot-component-reference.test.tsx` with the exact `TypeError: Cannot convert undefined or null to object` users reported. Restored → 6/6 pass + all 469 elements tests pass + all 295 rocketstyle tests pass.

  Mirrors the same fix in `Element/component.tsx` (5 JSX slot positions) and `Content/component.tsx` (1 JSX slot position).

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/ui-core@0.24.4
  - @pyreon/unistyle@0.24.4

## 0.24.3

### Patch Changes

- [#839](https://github.com/pyreon/pyreon/pull/839) [`707fa0b`](https://github.com/pyreon/pyreon/commit/707fa0b9080d601c9a67bab7e38c881340bec56a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Element content={() => <X />}>` / `beforeContent={() => <X />}` / `afterContent={() => <X />}` are now reactive — function-returning-VNode slot props re-render when signals inside the function body change. Same for the `children` prop in the compound (`beforeContent` / `afterContent` present) layout path.

  **The bug**: pre-fix, the JSX child position read the resolved slot value at component-setup time. Function-valued slot props were treated as components (one-shot mount via `h(fn, {})` inside `render()`) instead of as reactive accessors — so the body's signal reads ran exactly once at mount and were never observed afterwards. Symptom: theme toggles, dynamic icons, conditional badges, status indicators built via Element slots silently stopped re-rendering on signal change. The `getChildren` helper in `Element/component.tsx` had a getter shape that LOOKED reactivity-preserving — but the surrounding JSX child position called it synchronously, so the getter never re-fired.

  **The fix**: wrap the 5 affected JSX child positions in `{() => resolveSlot(...)}`. The resulting accessor is a valid `VNodeChildAccessor` — the runtime's `mountChild` routes it through `mountReactive`, which re-evaluates on signal change and re-mounts the resolved subtree. The `resolveSlot` helper unwraps function-valued slot values (calls them) so their body's signal reads land inside the enclosing `mountReactive` effect's tracking scope. Static VNode / string / null content paths through `render()` unchanged. Same fix in `Content/component.tsx` (the helper that wraps each slot in the compound layout path) for `beforeContent` / `afterContent` reactivity.

  **Bisect-verified-with-restore**: reverting the 5 JSX-position wraps + the Content wrap fails 5 of 7 new browser specs in `Element-slot-reactivity.browser.test.tsx` (the 2 that stay passing are static-content regression guards — correct, those don't depend on the fix). Restored → 23/23 browser + 463/463 elements unit pass.

  **Workaround for unfixed versions** stays valid: use `<Show>` inside the slot — `content={<Show when={signal} fallback={<A/>}><B/></Show>}` worked before this fix and continues to work after.

  Three pre-existing mock-vnode unit tests in `Element.test.ts` + `Content.test.tsx` updated to invoke the new accessor wrap when extracting children — the asserted contract (children resolves to the right value) is unchanged; the synchronous-vs-lazy shape changed because reactivity is now correct.

  Downstream verification: full ui-system test sweep — elements 463, rocketstyle 290, coolgrid 106, kinetic 221, styler 425, unistyle 240, attrs 89 = 1834 unit tests + 23 elements browser tests pass.

- Updated dependencies [[`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb)]:
  - @pyreon/ui-core@0.24.3
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/unistyle@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/ui-core@0.24.2
  - @pyreon/unistyle@0.24.2

## 0.24.1

### Patch Changes

- [#793](https://github.com/pyreon/pyreon/pull/793) [`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): port vitus-labs perf cleanups — measured net wins only

  Mirror the structural cleanups from vitus-labs/ui-system PRs [#244](https://github.com/pyreon/pyreon/issues/244) → [#254](https://github.com/pyreon/pyreon/issues/254)
  across Pyreon's ui-system. Each port carries an inline comment naming the
  source commit + the upstream-measured delta.

  **Policy: only ports that show measurably better under Pyreon's runtime
  were kept.** Two upstream changes were measured neutral/worse here and
  deliberately reverted:

  - `styler.hashUpdate` 4-char unroll — measured +1.6% short / +2.1% long
    under Bun (both inside the ±2% JIT noise band). Reverted to the simple
    single-char loop.
  - `elements.Iterator` filterValidItems + detectKind fusion — measured
    -16.3% on a 20-item all-valid complex list (V8's `.filter()` is
    hyper-optimized for arrays with primitive predicates; manual fusion
    loses for small all-valid inputs). Reverted to the two-pass shape.

  **Measured wins** (paired before/after micro-bench via
  `bun scripts/perf/port-vitus-labs-bench.ts`, Bun 1.3.13, 3 warmup + 7
  timed runs, report median):

  - `styler.CSSResult._staticResolved` cache (8 repeats): **+85.3%**
  - `attrs.removeUndefinedProps` (10-prop input): **+77.4%**
  - `unistyle.shouldNormalize` (5-key static): **+66.0%**
  - `rocketstyle.pickStyledAttrs` (10-prop input): **+64.4%**
  - `hooks.useBreakpoint buildSortedBpTuples` (5-bp): **+46.5%**
  - `unistyle.createMediaQueries` (5-bp theme): **+31.7%**
  - `unistyle.alignContent isReverted` (mixed): **+30.0%**
  - `unistyle.shallowEqual` (5-key equal): **+27.4%**
  - `elements.Overlay click-close check`: **+20.5%**
  - `styler.HTML_PROPS Set→null-proto-obj` (5-key mix): **+8.3%**
  - `styler.splitRules charCodeAt vs str[i]`: **+8.0%**

  Plus 6 structural cleanups (no perf claim, allocation reductions only):

  - `styler.globalStyle` length-check vs `.trim()`
  - `unistyle.normalizeTheme` / `transformTheme` for-in (drops
    Object.entries tuple-array allocations)
  - `rocketstyle` `PSEUDO_AND_META_KEYS` module-scope hoist (per-definition
    allocation removed)
  - `rocketstyle.getThemeByMode` recursive for-in
  - `coolgrid.useGridContext` direct prop access (drops `pickThemeProps`
    wrapper — 2 `get()` calls saved per render)
  - `elements.Text` ternary tag assignment (drops `renderContent` closure)

  **Behavioural lock-in tests** (ported from vitus-labs `60fc25c1`, 8 new
  specs in `@pyreon/styler`):

  - `CSSResult._isDynamic` memoization: populate-on-first / cache-on-
    subsequent (values-mutation sentinel) / nested-propagation.
  - `CSSResult._staticResolved` cache: populate-on-first / cache-hit-via-
    sentinel / no-cache-for-dynamic / fallthrough-when-unclassified.
  - LRU-2 cacheRef test was React-specific and not ported (Pyreon uses
    signals, not React refs).

  **Bisect-verified-with-restore**:

  - Disabled `_isDynamic` cache → `× returns cached result on subsequent
calls without rescanning values` fires; restored → 425/425 pass.
  - Disabled `_staticResolved` cache → 2 lock-in specs fire; restored →
    425/425 pass.

  **Honest framing**: micro-benches isolate ONE hot path under tight loops;
  real-app aggregate deltas are smaller because each path is 1-10% of
  per-component mount-time, not 100%. Real-app benchmark
  (`examples/benchmark/`) NOT re-run for this PR — the proof here is
  per-function structural wins, not a real-app headline number.

  **Verification**:

  - 1832 tests pass: styler 425 (+8 lock-ins) + unistyle 240 + rocketstyle
    290 + attrs 89 + coolgrid 106 + elements 463 + hooks 219.
  - Browser smokes: elements 16, styler 12, rocketstyle 12, unistyle 6,
    coolgrid 7 — all pass.
  - lint, typecheck, gen-docs --check, check-doc-claims, check-manifest-
    depth, check-distribution, check-bundle-budgets: all green.

- Updated dependencies [[`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9)]:
  - @pyreon/unistyle@0.24.1
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/ui-core@0.24.0
  - @pyreon/unistyle@0.24.0

## 0.23.0

### Patch Changes

- [#736](https://github.com/pyreon/pyreon/pull/736) [`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic, elements, lint): audit + defense-in-depth for the iterate-children bug class

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode `StaggerRenderer` + `TransitionItem` against
  the Pyreon-compiler-prop-inlining + iterate-children bug. PR [#732](https://github.com/pyreon/pyreon/issues/732) added the
  compiler-side carve-out for stable references at the JSX call site. This PR
  closes the **3 parallel library sites** the audit found and ships a lint
  rule (`pyreon/no-iterate-children-without-resolve`) to prevent recurrence
  in any future library code.

  ## Background — the bug class

  The Pyreon vite-plugin's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.

  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive` — invisible bug for the common
  forwarding pattern. Libraries that iterate children at the VNode level
  or `cloneVNode` them directly are silently broken: the function spread
  produces `{type: undefined}` and the DOM renders literal `<undefined>`
  tags. Real-app reproducer: `examples/bokisch.com` Intro section.

  ## Library fixes (3 sites — parallel to PR [#731](https://github.com/pyreon/pyreon/issues/731)'s renderers fix)

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode renderers under `packages/ui-system/kinetic/src/kinetic/`.
  It missed the parallel TOP-LEVEL components in the same package + a
  subtle Iterator shape.

  - **`@pyreon/kinetic` top-level `Stagger.tsx`** — `(Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)` collapsed to `[]` when `own.children` is a function. Fixed by calling `resolveChildren(own.children)` at body entry (same helper PR [#731](https://github.com/pyreon/pyreon/issues/731) shipped in `kinetic/src/utils.ts`).
  - **`@pyreon/kinetic` top-level `Transition.tsx`** — 3 × `cloneVNode(props.children, …)` + 1 × `(props.children.props ?? {})` reads. The cloneVNode-on-function shape produces `<undefined>` tags; the `.props` read returns undefined and silently drops the merge-ref. Fixed by resolving once at body entry (`const child = resolveChildren(props.children)`).
  - **`@pyreon/elements` `Iterator`** — falls through to `renderChild(function)` which calls `render(function, props)` and interprets the function as a component. Doesn't crash but loses per-item metadata (`first`/`last`/`position`/`index`/`odd`/`even`). Fixed by unwrapping at body entry with the inline `typeof rawChildren === 'function' ? rawChildren() : rawChildren` ternary.

  ## Lint rule — `pyreon/no-iterate-children-without-resolve`

  New error-level rule under the `reactivity` category. Detects:

  1. **`cloneVNode(EXPR, …)`** where EXPR ends with `.children`.
  2. **`(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`** where METHOD is one of `filter` / `map` / `forEach` / `reduce` / `every` / `some` / `find` / `findIndex` / `flatMap`.
  3. **`EXPR.props`** reads where EXPR ends with `.children` (the merge-ref pattern from `Transition.tsx`).

  **Acceptable mitigations** (per-function scope, inherits through nested arrow functions):

  - `resolveChildren(…)` call.
  - `typeof EXPR === 'function' ? EXPR() : EXPR` ternary.
  - `typeof EXPR === 'function'` guard anywhere.
  - `const NAME = <mitigation expression>` — marks NAME as safe-aliased.

  **Out of scope** (deliberate precision trade-offs):

  - Pass-through `...(Array.isArray(EXPR) ? EXPR : [EXPR])` SpreadElement → mountChild handles function children. Naturally not flagged by the call-site detection.
  - `if (Array.isArray(X)) return X.map(…)` IfStatement-guarded iteration. Framework primitives (`Dynamic`, `Show`, `Switch`) use this with direct h() rest args that never reach the auto-wrap; out of scope.
  - Variable-bound iteration patterns (`const xs = COND; xs.METHOD(…)`). Out of scope — detection at the inline `.METHOD(…)` call site.

  **Bisect-verified at two layers**: 19 unit specs (10 FIRES + 9 CONTROL + real-world shapes), reverting the rule fails all 10 FIRES; full repo sweep against `packages/**` after library fixes → 0 hits (zero false positives, zero remaining real bugs).

  ## Surfaces updated

  - `packages/ui-system/kinetic/src/Stagger.tsx` — top-level Stagger fix
  - `packages/ui-system/kinetic/src/Transition.tsx` — top-level Transition fix
  - `packages/ui-system/elements/src/helpers/Iterator/component.tsx` — Iterator fix
  - `packages/ui-system/kinetic/src/__tests__/top-level-transition-stagger-function-children.test.tsx` — 4 regression specs (2 FIRES per component + 2 CONTROL)
  - `packages/ui-system/elements/src/__tests__/iterator-function-children.test.tsx` — 2 regression specs (1 FIRES + 1 CONTROL)
  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts` — new rule
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts` — 19 unit specs
  - `packages/tools/lint/src/rules/index.ts` — register rule + bump reactivity count to 14
  - `packages/tools/lint/src/tests/runner.test.ts` — update rule count assertions (80 → 81, reactivity 13 → 14)
  - `CLAUDE.md`, `packages/tools/lint/README.md`, `packages/tools/lint/src/manifest.ts`, `docs/docs/lint.md` — rule count claims updated (locked by `check-doc-claims`)
  - `.claude/rules/anti-patterns.md` — new bug-class entry under Architecture Mistakes

  ## Validation

  - All 3 library packages pass tests (kinetic 220, elements 463 → +new regression specs)
  - All 650 lint tests pass (19 new specs)
  - `check-doc-claims` clean (count claims locked)
  - Real-app sweep: 0 hits across 1041 source files (rule is precision-tuned to avoid false positives on framework primitives, pass-through patterns, and unrelated `Array.isArray` shapes in non-VNode domains)

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/ui-core@0.23.0
  - @pyreon/unistyle@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/ui-core@0.22.0
  - @pyreon/unistyle@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/ui-core@0.21.0
  - @pyreon/unistyle@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/ui-core@0.20.0
  - @pyreon/unistyle@0.20.0

## 0.19.0

### Patch Changes

- [#629](https://github.com/pyreon/pyreon/pull/629) [`29788dc`](https://github.com/pyreon/pyreon/commit/29788dc7ae5a52daab204b6205fe39f56703d980) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/elements` onto the manifest-driven docs pipeline.

  `@pyreon/elements` is the structural layer every styled / rocketstyle component renders through (`Element` / `Text` / `List` / `Overlay` / `useOverlay` / `Portal` / `Iterator`), but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region** — `get_api(elements, Element|Overlay|useOverlay|…)` 404'd. PR D of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server; PR C = styler [#628](https://github.com/pyreon/pyreon/issues/628) — all merged; this branch rebased onto post-[#628](https://github.com/pyreon/pyreon/issues/628) `origin/main`).

  **Added** `packages/ui-system/elements/src/manifest.ts` via `defineManifest()` — **10 `api[]` entries** (`Element`, `Text`, `List`, `Overlay`, `useOverlay`, `OverlayProvider`, `Portal`, `Iterator`, `Util`, `Provider`) with accurate signatures + dense summaries + the real elements foot-guns in `mistakes[]`: `direction="row"` is invalid (`inline` / `rows` / `reverseInline` / `reverseRows`); layout props are primitive ATTRS not styler `.theme()` CSS; the 2026-Q2 simple-path fast path moves the tag to `props.as` and layout under `props.$element.*`; void-tag children are dropped; `Overlay`'s positioning/flip/ESC/click-outside/scroll/hover-delay all live in `useOverlay` (never reimplement); `Portal` nests a per-instance wrapper inside the DOMLocation (DOM assertions traverse one level deeper); `Iterator`'s four-overload Simple/Object/Children/Loose type system. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` / `@pyreon/styler` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (after `@pyreon/styler`, before `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — elements already had one), the `llms-full.txt` `## @pyreon/elements` section, and the 10-entry MCP region.

  **`@pyreon/mcp` bundle budget — no bump needed in this PR.** The 10-entry api-reference region is bundled into `@pyreon/mcp`'s main entry, but the focused single-package bump PR [#627](https://github.com/pyreon/pyreon/issues/627) (`chore(ci): bump @pyreon/mcp bundle budget — RED on main`) already raised the budget to `142848` on `main`. This branch's measured `@pyreon/mcp` gzipped main entry is `122629` bytes — comfortably under `142848` — so the elements region fits within [#627](https://github.com/pyreon/pyreon/issues/627)'s headroom and no further `scripts/bundle-budgets.json` change is required here. (An earlier revision of this branch carried its own `153344` bump; rebasing onto post-[#627](https://github.com/pyreon/pyreon/issues/627) `main` made it redundant and it was dropped in favour of [#627](https://github.com/pyreon/pyreon/issues/627)'s value.)

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (elements + mcp); elements 461 tests, mcp 497 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the layout-in-attrs and Portal-wrapper foot-gun assertions locally; `check-manifest-depth` passes (elements enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  The `renderStringLiteral` backslash hazard documented by [#628](https://github.com/pyreon/pyreon/issues/628) in `.claude/rules/anti-patterns.md` was applied from the start here — manifest prose is backslash-free (plain single-backtick code spans, no nested backtick escapes), so no serializer-escape parse error and no further anti-patterns.md change was required for this PR.

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/ui-core@0.19.0
  - @pyreon/unistyle@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/ui-core@0.18.0
  - @pyreon/unistyle@0.18.0

## 0.17.0

### Patch Changes

- [#584](https://github.com/pyreon/pyreon/pull/584) [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Preserve reactive props through component-JSX spread + framework prop pipelines.

  **Bug class.** Pyreon's reactive-prop contract is that `<Comp prop={signal()}>` compiles to `h(Comp, { prop: _rp(() => signal()) })` and `mount.ts:makeReactiveProps` converts `_rp`-branded thunks into property GETTERS on the props object. Any prop-pipeline step that VALUE-COPIES `props[key]` (plain assignment, spread, or `Object.assign`) fires the getter at HOC setup time — outside any tracking scope — and stores the resolved value as a static data property. Every downstream JSX accessor reading `props.x` then sees the captured-once value, never re-subscribing to the underlying signal.

  **Two layers of fix:**

  1. **Compiler-level (closes the bug class for all consumers, including user code).** Both the JS compiler (`src/jsx.ts`) and the Rust native binary (`native/src/lib.rs`) now wrap component-JSX spread arguments with the new `_wrapSpread(...)` helper from `@pyreon/core`. `<Comp {...source}>` compiles to `jsx(Comp, { ..._wrapSpread(source) })` — `_wrapSpread` replaces getter descriptors with `_rp`-branded thunks, so the JS-level spread carries function values (no getters fire), and `makeReactiveProps` converts them back to getters on the consumer side. Fast path: when `source` has no getter descriptors, `_wrapSpread` returns the source unchanged — zero overhead for the 99% of spread sources that don't carry reactive props. Lowercase-tag (DOM) spreads route through the template path's `_applyProps` (already reactive) and skip the wrap.

  2. **Framework-level (closes every observed leak site in shipped packages):**
     - `@pyreon/rocketstyle` — `removeUndefinedProps` + `mergeDescriptors` (new helper in `utils/attrs.ts`) replace 3 spread sites in `rocketstyleAttrsHoc.ts` and `rocketstyle.ts`'s `mergeProps`. `finalProps.ref` / `$rocketstyle` / `$rocketstate` writes use `Object.defineProperty` (handles getter-only descriptors).
     - `@pyreon/styler` — `buildProps` in `forward.ts` copies descriptors via `copyDescriptor` instead of value-reads.
     - `@pyreon/ui-core` — `omit` / `pick` in `utils.ts` copy descriptors.
     - `@pyreon/elements` — Wrapper's `buildStyledProps` builds props via descriptor-preserving copy and forwards `ref` / `as` / extras via `Object.defineProperty`.
     - `@pyreon/core` — `jsx-runtime.ts`'s `jsx()` has a slow path that preserves descriptors when `props` arrives with getters (for direct `h()` callers).
     - `@pyreon/runtime-dom` — `applyProps` in `props.ts` detects getter descriptors and wraps the write in `renderEffect`.

  **Bisect-verified at TWO layers:**

  - **Unit / browser**: `packages/ui-system/rocketstyle/src/__tests__/reactive-props-preservation.test.ts` (9 specs) + the new `rocketstyle.browser.test.tsx` spec covering the full pipeline. Reverting any of the 4 leak-site fixes individually fails the relevant spec with `expected 'count: 1' to be 'count: 0'`.
  - **Real-Chromium e2e**: `e2e/ui-showcase-regression.spec.ts:793 — signal-driven prop on Button updates the DOM on flip` exercises a rocketstyle Button with a `title={\`count: \${count()}\`}` prop fed by a signal. Reverting the compiler-level fix (`packages/core/compiler/src/jsx.ts`+`native/src/lib.rs`+ rebuilding the Rust binary) → spec fails with`unexpected value "count: 0"` after click — proving the spread reactivity contract holds end-to-end through the entire prop pipeline (rocketstyle attrs HOC → styler buildProps → Element Wrapper → runtime-dom applyProps).

  **No public API breakage.** `_wrapSpread` is an internal compiler-emitted helper; users never call it directly. Framework-internal helpers (`mergeDescriptors` in rocketstyle, `copyDescriptor` in styler, etc.) are not exported. The only public surface change is that getter-shaped reactive props now survive every framework boundary — i.e. the reactive-prop contract finally works as documented.

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/unistyle@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- [#566](https://github.com/pyreon/pyreon/pull/566) [`df3a379`](https://github.com/pyreon/pyreon/commit/df3a3797704e54414ce40553458b8d00fbe5c6be) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a 4th `(props: LooseProps): VNodeChild` overload to `IteratorComponent` and `ListComponent` for forwarding patterns. After the 4-overload-aware `ExtractProps` (paired PR), the wide union from rocketstyle's `(typeof Wrapper)['$$types']` had no binding home — `<Iterator {...wrapperProps} />` failed at every forwarding site with `error TS2769: No overload matches this call`. The narrow `SimpleProps<T>` / `ObjectProps<T>` / `ChildrenProps` overloads still drive per-mode T inference for shape-correct direct callers; the LooseProps fallback only fires when none of the narrow overloads match (forwarding patterns, spread props from generic wrappers, heterogeneous arrays).

  Trade-off (mirrors vitus-labs PR [#229](https://github.com/pyreon/pyreon/issues/229)): direct callers can now mix `valueName` + `children` without a type error — the strict per-mode rejection at the type level is relaxed in exchange for forwarding-pattern support. Runtime still picks the right mode based on which props are populated.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/ui-core@0.16.0
  - @pyreon/unistyle@0.16.0

## 0.14.0

### Patch Changes

- [#317](https://github.com/pyreon/pyreon/pull/317) [`2911026`](https://github.com/pyreon/pyreon/commit/29110269b01a1f2d3dad8c4cd02b424c076ae71e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Element simple-path fast path. When an Element has no `beforeContent` / `afterContent` slots and the tag doesn't need the button/fieldset/legend two-layer flex fix, the `Wrapper` helper is now inlined directly into a single styled invocation — saving one component hop, one `splitProps` call, and one `mountChild` per Element. Measured 31-45% wall-clock speedup across mount shapes in real Chromium: 500-child single-tree mount 2.90 ms → 1.60 ms (−45%), 5000 mount-stress 31.80 ms → 19.70 ms (−38%), 50× depth-10 nesting 3.30 ms → 1.80 ms (−45%). Compound Elements (with before/after) and the rare flex-fix tags still route through the original `Wrapper` for backward compat. The simple-path rendered VNode now carries the HTML tag on `props.as` and layout fields under `props.$element.*` instead of flat `props.tag` / `props.direction` / etc. — production styled-components consumers see no behavior change; downstream tests reading the VNode shape get a `getLayoutProps()` helper that reads from both shapes.

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/ui-core@0.14.0
  - @pyreon/unistyle@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/ui-core@0.13.0
  - @pyreon/unistyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/ui-core@0.12.15
  - @pyreon/unistyle@0.12.15

## 0.12.14

### Patch Changes

- [#239](https://github.com/pyreon/pyreon/pull/239) [`ee1bc2b`](https://github.com/pyreon/pyreon/commit/ee1bc2b0dd3ce853eee4a72bcc8629ed0aa1cea5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Elements anti-pattern cleanup + lint rule precision

  `@pyreon/elements`:

  - `utils.ts`: replaced `process.env.NODE_ENV !== 'production'` (dead code in
    real Vite browser bundles — `process` is not polyfilled) with the
    tree-shake-friendly `import.meta.env?.DEV` gate. Typed through a narrowing
    interface so downstream packages don't need `vite/client` in their
    tsconfigs to type-check elements transitively.
  - `helpers/Wrapper/component.tsx`, `List/component.tsx`: replaced destructured
    props (`({ x, ...rest }) => …`) with `splitProps(props, OWN_KEYS)` to
    preserve reactive prop tracking.
  - `Overlay/useOverlay.tsx`: added `typeof window === 'undefined'` early-return
    guards at the entry points of `calcDropdownVertical`/`Horizontal`,
    `calcModalPos`, `getAncestorOffset`, and `setupListeners`. Each function
    is only reachable from a mounted browser context (via event handlers
    registered inside `onMount`), but the rule can't AST-trace that; the
    explicit guard documents the SSR-safety contract at the callsite.
  - `devWarn`: rewritten to use the shared `IS_DEVELOPMENT` flag (itself
    gated on `import.meta.env?.DEV`) so it tree-shakes in production.
  - Added `packages/ui-system/elements/vitest.browser.config.ts` +
    `src/__tests__/elements.browser.test.tsx` — the package's first real
    Playwright Chromium smoke test. Verifies Element/Portal/Text render into
    real DOM, a reactive text child updates on signal change, and
    `typeof process === 'undefined'` / `import.meta.env.DEV === true` in the
    browser bundle (catching the `typeof process` dead-code class of bug).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added to elements.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Logical-and guards with a typeof-derived const on either side now recognised
    (e.g. `IS_BROWSER && active() ? <Portal target={document.body} /> : null`).
    Short-circuit semantics mean the body only runs when the guard is truthy.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Added `render` to the skip allowlist. `render()` from `@pyreon/ui-core` is
    a VNode-producing helper (takes ComponentFn/string/VNode, returns
    VNodeChild), not a signal read — its JSX call sites always produce a
    VNode and don't need `() =>` wrapping.

  `@pyreon/lint` — `dev-guard-warnings`:

  - Added conventional dev-flag name set (`__DEV__`, `IS_DEV`, `IS_DEVELOPMENT`,
    `isDev`) so imported dev gates (e.g. `import { IS_DEVELOPMENT } from '../utils'`)
    silence `console.warn` warnings inside their guarded branches. Same convention
    basis as the existing `__DEV__` identifier check — the rule can't follow
    cross-module imports to verify the binding resolves to `import.meta.env.DEV`,
    so the name is the contract.
  - Also added `VariableDeclaration` tracking for locally-bound dev-flag consts
    (`const x = import.meta.env.DEV === true` or similar).

  5 new bisect-verified regression tests for the rule precision improvements.

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/unistyle@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/ui-core@0.12.13
  - @pyreon/unistyle@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/ui-core@0.12.12
  - @pyreon/unistyle@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/ui-core@0.12.11
  - @pyreon/unistyle@0.12.11

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/unistyle@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/unistyle@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/unistyle@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/unistyle@0.0.2
