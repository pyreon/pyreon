# pyreon.dev design system

The design system of the docs app (`docs/src/`): the marketing site, the docs reading shell and the blog. It is built on the UI-system packages (`@pyreon/elements`, `rocketstyle`, `unistyle`, `styler`, `ui-core`) but is not `@pyreon/ui-components`: the site has its own visual language and must not inherit `ui-theme`'s `ThemeDefault` augmentation. It lives in the app, not in a package (one consumer; revisit if a second appears).

## Layers

| Layer | Where | Contains | Rule |
| --- | --- | --- | --- |
| 0 Tokens | `docs/src/site/theme.ts` | colour pairs, gradients, `space`, `radius`, `text` roles, `leading`, `tracking`, `shadow`, `breakpoints` + `media`, `duration` / `easing` / `motion` / `reducedMotion`, `z`, `layout`, `section`, `docsLayout` | The only file with raw values (hex, px, easing, z). |
| 1 Primitives | `docs/src/site/kit/primitives/` (from S2) | Box, Stack, Cluster, Grid, Wrap, Text roles, Visible, Icon | No outer margin; layout props take token keys. |
| 2 Components | `docs/src/site/kit/*.tsx`, one file per family | GlowCard, Pill/Tag, Note, CodeBlock, Segmented, tables, proof blocks, media | Built from primitives and tokens; every exported component is on `/brand/kit`. |
| 3 Patterns | `docs/src/site/patterns/` (from S4) | PageHero, Section + SectionHead, EndCTA, switchers | Take the synced content types as props; hold no copy or numbers. |
| Islands | `kit/classes.ts` (`C`) + `kit/site-css.ts` | Plain markup the shell's islands render | No styling runtime in an island outside `site/demos/`. |
| Docs shell | `docs-ui/*` + `styles/docs-v3.css` | Plain classes, zero JS | Values come from `var(--dx-…)` (colours) and `var(--s-…)` (scales). |

Pages (`site/pages/**`, `blog/**`, `showcase/**`, `open/**`) compose layers 1–3. Demos (`site/demos/**`) depict a real app on the paper surface and may define local parts, through tokens.

## How tokens reach each styling mechanism

- **Rocketstyle (kit):** import the token from `theme.ts` and use the number (`gap: space[150]`, `fontSize: text.body.size`); unistyle turns px into rem. Colours go through `tone(m, key)` / `pair(m, tone)` from `kit/bases.ts` (rocketstyle `mode()` pairs, one custom property each in CSS-variables mode).
- **Plain stylesheets:** `site/theme-vars.ts` generates `--s-space-<key>`, `--s-radius-<name>`, `--s-fs-<role>`, `--s-lh-<role>`, `--s-leading-*`, `--s-tracking-*`, `--s-dur-*`, `--s-ease-*` and `--s-z-*` from the same objects. They ship inside `SITE_CSS`, which every layout injects (marketing, docs, the 404), so `site-css.ts` and `docs-v3.css` read one set of names. Colours stay `--c-<key>` (islands) and `--dx-<name>` (docs), switched by `<html data-theme>`.
- **Breakpoints** cannot be custom properties: use `media.up.md` / `media.down.md` (`theme.ts`); a width that is not a theme breakpoint gets a named token first.

`space` keys count eighths of the 8px base ×100 (`100` = 8px, `150` = 12px, `25` = 2px). The scales hold every even value the site already used, so converting a literal never moves a pixel; odd values (3, 5, 7, 9, 11, 13 px) are not steps, and snapping one is a visual change in its own PR.

## Conventions

- **Names:** PascalCase, family first (`NoteCaption`, not `HomeNote`); the rocketstyle `name` equals the export name. A page prefix (`Home*`, `Bench*`) only for a one-off in `site/pages/**` with no `.theme()` of its own.
- **Dimensions:** `variant` = visual kind, `tone` = semantic colour (`accent | ok | warn | err | info | neutral`), `size` = scale step, `state` = runtime state. They map to rocketstyle `variants` / `sizes` / `states`.
- **Layout props** (`gap`, `align`, `justify`, `wrap`) belong to primitives. Components expose content props, not CSS.
- **Components do not set their own outer margins.** Space between siblings is the parent's `gap`.
- **Blocks inside a card do not set their own horizontal inset** and never bleed into the card's padding with a negative margin: the card sets one inset, every block shares its left edge.
- **Not allowed in pages:** `style=` (except data-driven values: bar widths, swatches, aspect ratios), `extendCss`, raw `@media` widths, numbers in `.theme()`, `.config({ name })`.
- **a11y:** an interactive component (`a`, `button`, `summary`) declares a visible focus style (`focus: focusRing(m)`); motion sits behind `reducedMotion` (or `prefers-reduced-motion: no-preference`); every text/background pair a component uses is in `site/tests/contrast.test.ts`.
- **e2e selectors** depend on `.dx-*`, `.s-*`, `.code-block*` and `.pyreon-example*` class names: never rename them.

## Adding a token

Add it to `theme.ts` next to its family, with a doc comment saying what it is for. A scale token gets its `--s-*` property automatically (`theme-vars.ts`); a colour gets its `--c-*` / `--dx-*` from the existing maps (`site-css.ts` `vars()`, `docs-ui/tokens.ts` `DOCS_VARS`) and a row in `contrast.test.ts`. Mirror a new scale step into the staging theme (`pyreon-promo/09-site/theme.ts`) so the next design handoff uses it.

## Adding a component

1. Pick the family file in `docs/src/site/kit/` (or start one). Build it from primitives and tokens, no literals.
2. Give it a gallery entry on `/brand/kit` (`site/pages/KitGallery.tsx`) showing every dimension value, in both themes.
3. If it hydrates in an island, it must not need the styling runtime (plain markup + `C` classes), unless the island is a product demo rooted in `KitScope`.
4. `bun scripts/check-site-design.ts` must pass.

## The ratchets

`bun scripts/check-site-design.ts` (in `validate-fast`, so in the required `Fast Gates` job) counts findings per (file, rule) over `docs/src/**` and compares them with `scripts/site-design-baseline.json`. A count may only go down; a file not in the baseline must have none. It prints what to do first, then every finding of each grown (file, rule) with its line.

| Rule | Counts |
| --- | --- |
| `literal/color`, `literal/space`, `literal/radius`, `literal/font-size`, `literal/shadow`, `literal/z-index`, `literal/media` | a hand-written value instead of a token (interpolated tokens and `var(…)` never count; 0 and ±1px hairlines and calc multipliers are ignored) |
| `kit/styled-outside`, `kit/extend-css` | a `.config({ name })`, `rocketstyle(` / `styled(` definition or `extendCss` outside `site/kit/` and `site/demos/` |
| `kit/duplicate-name` | a styled-component name defined more than once (the kit's definition counts as the first) |
| `kit/imports-app` | the kit importing pages, shell, demos, blog, docs or routes |
| `kit/internal-import` | a file outside the kit (and demos) importing `kit/bases` or `kit/site-css`, or a kit subfolder's file other than its index |
| `kit/island-styling-runtime` | an island declared outside `site/demos/` whose static import graph reaches a styling-runtime package |
| `kit/gallery-missing` | an exported component of a top-level `kit/*.tsx` file that no gallery file names |
| `a11y/focus-missing` | a styled definition with `tag: 'a' / 'button' / 'summary'` and no focus style (tags passed at the use site are not seen) |
| `a11y/motion-unguarded` | a `transition` / `animation` / `@keyframes` in a file that never mentions reduced motion (per file: one guard covers the file) |

Out of scope: the token sources (`theme.ts`, `theme-vars.ts`, the legacy `styles/tokens.css`), synced content (`content/`), tests and live examples (`examples/`).

- `--list <rule-or-prefix>` prints every finding with file and line (`--list literal/space`, `--list kit`).
- `--update` rewrites the baseline from today's counts and refuses to raise any. Run it in the PR that lowered counts. `--allow-raise` is only for renamed or moved files.
- Never raise a count to absorb a finding: fix the code, or add the token or kit component it needs.

The site's JavaScript budgets are in the docs e2e suite (`e2e/site-home.spec.ts`, `e2e/site-docs.spec.ts`: gzip -9 of the built files, so the verdict does not depend on the machine). That suite runs in CI for any change to site code (`scripts/e2e-affected.ts`, suite `docs`).

## Visual proof

`scripts/site-visual-sweep.ts` screenshots a fixed page list (every page type, the kit gallery, a docs sample) at 320 / 375 / 768 / 1280 px in both themes and compares two captures:

```bash
bun scripts/site-visual-sweep.ts capture --build --out /tmp/sweep-base      # on the base branch
bun scripts/site-visual-sweep.ts capture --build --out /tmp/sweep-change    # on the change
bun scripts/site-visual-sweep.ts compare /tmp/sweep-base /tmp/sweep-change --diff /tmp/sweep-diff
```

`--build` writes `docs/dist`; copy it aside (or pass `--dist`) to keep a build. Capture both sides on the same machine (font rasterisation differs across OSes). Shots are deterministic: reduced motion, animations and transitions off, videos paused, fonts loaded, lazy images loaded and decoded, eager islands hydrated, and each shot repeated until two in a row are identical. `compare` prints only changed shots with their differing pixel counts and exits 1 when any changed. A refactor slice attaches a zero-change result; a slice that moves pixels on purpose names each changed shot and attaches its diff images.
