import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/coolgrid',
  title: 'Responsive Grid',
  tagline:
    'Context-cascading responsive grid — Container, Row, Col with custom columns and breakpoints',
  description:
    'Bootstrap-style flexbox grid for Pyreon where every numeric prop is responsive (single value, mobile-first array, or breakpoint-keyed object). Configuration (`columns`, `gap`, `gutter`, `padding`, `contentAlignX`) cascades through Pyreon context — set it on `Container` and every nested `Row` / `Col` inherits, with per-element overrides for that subtree only. Breakpoint names and column counts are theme-driven, not hardcoded: ship with the default Bootstrap-4 theme (12 columns, xs–xl) or define your own (`{ phone: 0, tablet: 600 }` × `columns: 24`). Built on `@pyreon/unistyle` + `@pyreon/styler`.',
  category: 'browser',
  longExample: `import { Provider, Container, Row, Col, theme } from '@pyreon/coolgrid'

// Provider scopes breakpoints, rootSize, and grid defaults to the subtree.
// In an app that already renders <PyreonUI> at the root, skip Provider —
// PyreonUI sets up the same unistyle context.
<Provider theme={theme}>
  <Container gap={16} gutter={24} padding={16}>
    <Row>
      {/* Responsive size — breakpoint-keyed object */}
      <Col size={{ xs: 12, md: 8 }}>Main content</Col>
      <Col size={{ xs: 12, md: 4 }}>Sidebar</Col>
    </Row>
    {/* Mobile-first array — positional [xs, sm, md, ...]; values cascade up */}
    <Row contentAlignX="center" gap={[8, 16, 24]}>
      <Col size={[12, 6, 4]}>Card</Col>
      <Col size={[12, 6, 4]}>Card</Col>
      {/* size 0 hides the column at that breakpoint */}
      <Col size={{ xs: 0, md: 4 }}>Desktop-only card</Col>
    </Row>
    {/* size on Row = default span for every Col inside */}
    <Row size={6}>
      <Col>Half</Col>
      <Col>Half</Col>
    </Row>
  </Container>
</Provider>

// Custom breakpoints + column count via a custom theme:
<Provider
  theme={{
    rootSize: 16,
    breakpoints: { phone: 0, tablet: 600, desktop: 1024 },
    grid: { columns: 24, container: { phone: '100%', tablet: 540, desktop: 960 } },
  }}
>
  <Container columns={24}>
    <Row>
      <Col size={16}>Two thirds of 24</Col>
      <Col size={8}>One third of 24</Col>
    </Row>
  </Container>
</Provider>`,
  features: [
    'Container / Row / Col with context-cascading grid config — set once on Container, everything inherits',
    'Every numeric prop responsive: single value, mobile-first array, or breakpoint-keyed object',
    'Custom column counts and breakpoints via theme (Bootstrap-4 defaults: 12 columns, xs–xl)',
    'size 0 hides a column at that breakpoint',
    'contentAlignX alignment: center / left / right / spaceAround / spaceBetween / spaceEvenly',
    'component prop swaps the rendered element at any layer; css / colCss / rowCss extension points',
    'CSS-variables theming compatible — var()-aware grid math via native calc()',
  ],
  api: [
    {
      name: 'Container',
      kind: 'component',
      signature:
        '(props: { columns?: ValueType; gap?: ValueType; gutter?: ValueType; padding?: ValueType; contentAlignX?: ContentAlignX; width?: ContainerWidth; component?: ComponentFn; css?: ExtraStyles }) => VNodeChild',
      summary:
        'Outermost grid boundary. Renders a centered flex column (`width: 100%`, auto horizontal margins) with a responsive `max-width` resolved from the `width` prop → `theme.grid.container` → `theme.coolgrid.container`, and provides the grid config (`columns`, `size`, `gap`, `padding`, `gutter`, `colCss`/`colComponent`, `rowCss`/`rowComponent`, `contentAlignX`) to descendant Row / Col via context. `ValueType` = `number | number[] | { [breakpoint]: number }` (responsive); `width` also accepts a function that receives the theme-resolved container-width record and returns the final `ContainerWidth`. `columns` defaults to the theme value (12 in the default theme).',
      example: `import { Container, Row, Col } from '@pyreon/coolgrid'

<Container columns={12} gap={16} gutter={24} padding={16} width={{ xs: '100%', lg: 1140 }}>
  <Row>
    <Col size={{ xs: 12, md: 8 }}>Main</Col>
    <Col size={{ xs: 12, md: 4 }}>Sidebar</Col>
  </Row>
</Container>

// width as a function of the theme's resolved container widths:
<Container width={(widths) => ({ ...widths, xl: 1320 })}>…</Container>

// Swap the underlying element:
<Container component="main">…</Container>`,
      params: [
        {
          name: 'columns',
          type: 'ValueType',
          description:
            'Total grid columns (responsive). Defaults to theme.grid.columns (12 in the default theme).',
          optional: true,
        },
        {
          name: 'gap',
          type: 'ValueType',
          description:
            'Space between columns (responsive). Halved into per-Col margins with a compensating negative margin on the Row.',
          optional: true,
        },
        {
          name: 'gutter',
          type: 'ValueType',
          description:
            'Vertical (inter-row) spacing fed into the Row margin math (spacingY = gutter − gap/2).',
          optional: true,
        },
        {
          name: 'padding',
          type: 'ValueType',
          description: 'Column inner padding (responsive) — halved per side on each Col.',
          optional: true,
        },
        {
          name: 'contentAlignX',
          type: 'ContentAlignX',
          description:
            "Horizontal alignment of columns within rows: 'center' | 'left' | 'right' | 'spaceAround' | 'spaceBetween' | 'spaceEvenly'.",
          optional: true,
        },
        {
          name: 'width',
          type: 'ContainerWidth',
          description:
            'Container max-width override — value, responsive array/object, or a function of the theme-resolved container-width record.',
          optional: true,
        },
        {
          name: 'component',
          type: 'ComponentFn',
          description: "Custom root element or component (e.g. 'main', a wrapper component).",
          optional: true,
        },
        {
          name: 'css',
          type: 'ExtraStyles',
          description: 'Extra CSS merged into the container styles (responsive-capable).',
          optional: true,
        },
      ],
      mistakes: [
        'Setting a non-default `columns` on a Row instead of the Container — it works for that Row only, but the visual cascade gets hard to reason about; keep `columns` at Container level',
        "Expecting `gutter` to be horizontal container padding — `gutter` feeds the Row's VERTICAL margins (`spacingY = gutter − gap/2`); the Container itself only sets a responsive max-width + auto horizontal centering",
        'Rendering without a theme context — grid defaults (`columns`, container widths) resolve from `theme.grid.*` / `theme.coolgrid.*`, so mount `<PyreonUI>` (or coolgrid `Provider`) above the Container',
        "Using CSS keyword values for `contentAlignX` ('space-between') — the accepted keys are camelCase: 'spaceAround' / 'spaceBetween' / 'spaceEvenly' (plus 'center' / 'left' / 'right')",
      ],
      seeAlso: ['Row', 'Col', 'Provider', 'theme'],
    },
    {
      name: 'Row',
      kind: 'component',
      signature:
        '(props: { size?: ValueType; columns?: ValueType; gap?: ValueType; gutter?: ValueType; padding?: ValueType; contentAlignX?: ContentAlignX; component?: ComponentFn; css?: ExtraStyles }) => VNodeChild',
      summary:
        'Flex-wrap row. Reads the Container config from context, merges its own props over it, and re-provides the result (`columns`, `gap`, `gutter`, `size`, `padding`, `colCss`, `colComponent`) for Col children. Applies the classic negative-margin gutter technique: horizontal margin `-gap/2` on each side cancels the per-Col gap margins at the row edges; vertical margin is `gutter − gap/2` when `gutter` is set, else `gap/2`. `size` on a Row becomes the DEFAULT span for every Col inside. `contentAlignX` maps to `justify-content`.',
      example: `<Row contentAlignX="center" gap={[8, 16, 24]}>
  <Col size={4}>One</Col>
  <Col size={4}>Two</Col>
</Row>

// size on Row = default span for every Col inside:
<Row size={6}>
  <Col>Half</Col>
  <Col>Half</Col>
</Row>

// Swap the rendered element:
<Row component="section">…</Row>`,
      params: [
        {
          name: 'size',
          type: 'ValueType',
          description: 'Default column span applied to every Col inside this Row (responsive).',
          optional: true,
        },
        {
          name: 'columns',
          type: 'ValueType',
          description: 'Override the total column count for this Row subtree (responsive).',
          optional: true,
        },
        {
          name: 'gap',
          type: 'ValueType',
          description:
            'Space between columns (responsive) — drives Row negative margins + Col gap margins.',
          optional: true,
        },
        {
          name: 'gutter',
          type: 'ValueType',
          description:
            'Vertical inter-row spacing (responsive) — Row vertical margin = gutter − gap/2.',
          optional: true,
        },
        {
          name: 'padding',
          type: 'ValueType',
          description: 'Default inner padding for Cols inside this Row (responsive).',
          optional: true,
        },
        {
          name: 'contentAlignX',
          type: 'ContentAlignX',
          description:
            "Horizontal alignment (justify-content) of the columns: 'center' | 'left' | 'right' | 'spaceAround' | 'spaceBetween' | 'spaceEvenly'.",
          optional: true,
        },
        {
          name: 'component',
          type: 'ComponentFn',
          description:
            "Custom row element or component (e.g. 'section'). Falls back to the Container's `rowComponent`.",
          optional: true,
        },
        {
          name: 'css',
          type: 'ExtraStyles',
          description: "Extra CSS for this Row. Falls back to the Container's `rowCss`.",
          optional: true,
        },
      ],
      mistakes: [
        'Expecting `size` on a Row to size the Row itself — it is the default `size` for every Col child (each Col can still override with its own `size`)',
        'Setting `gutter` without `gap` — in classic (non-cssVariables) mode the Row spacing block early-returns unless `gap` is a number, so the gutter silently does nothing; set `gap` too (`gap={0}` works)',
        "Passing CSS keyword values to `contentAlignX` ('space-between') — keys are camelCase ('spaceBetween'); the map resolves them to the real justify-content values",
        "Trying to set `gap` / `columns` / `gutter` on an individual Col — Col's typed props deliberately omit them; the values resolve at Row/Container level so the Row's negative margins and the Col's width math agree",
      ],
      seeAlso: ['Container', 'Col'],
    },
    {
      name: 'Col',
      kind: 'component',
      signature:
        '(props: { size?: ValueType; padding?: ValueType; component?: ComponentFn; css?: ExtraStyles }) => VNodeChild',
      summary:
        "Individual column. Reads `columns` / `gap` / default `size` / `padding` from the Row context and computes its width as `calc(size / columns · 100% − gap)` (plain percentage when no gap). Without a `size` it is an auto column (`flex-grow: 1; flex-basis: 0`) sharing the leftover space. `gap` and `padding` are HALVED and applied as per-side margin / padding (the Row's negative margin cancels the outer halves). `size: 0` hides the column at that breakpoint.",
      example: `<Col size={4}>1/3 width on every breakpoint</Col>
<Col size={{ xs: 12, sm: 6, lg: 4 }}>Responsive</Col>
<Col size={[12, 6, 4]}>Mobile-first array</Col>
<Col size={{ xs: 0, md: 6 }}>Hidden on xs</Col>
<Col>Auto column — shares leftover space</Col>
<Col component="article" css={{ textAlign: 'center' }}>Custom element + extra CSS</Col>`,
      params: [
        {
          name: 'size',
          type: 'ValueType',
          description:
            'Column span as a fraction of the total columns (responsive). 0 hides the column; omitted = auto column.',
          optional: true,
        },
        {
          name: 'padding',
          type: 'ValueType',
          description: 'Inner padding override (responsive) — halved per side.',
          optional: true,
        },
        {
          name: 'component',
          type: 'ComponentFn',
          description:
            "Custom column element or component. Falls back to the cascade's `colComponent`.",
          optional: true,
        },
        {
          name: 'css',
          type: 'ExtraStyles',
          description: "Extra CSS for this Col. Falls back to the cascade's `colCss`.",
          optional: true,
        },
      ],
      mistakes: [
        '`size: 0` hides the column by moving it off-screen (`position: fixed; left: -9999px`), NOT `display: none` — the element stays mounted and its children stay alive',
        'A mobile-first array is positional `[xs, sm, md, lg, xl]` and values CASCADE upward — `size={[12, 6, 4]}` leaves lg/xl at the md value (4), it does not reset them',
        'Expecting `padding={16}` to render 16px of padding — grid padding (like gap) is halved per side, so it renders `padding: 8px`',
        'Setting `size` greater than the resolved `columns` — the width math produces >100% and the column overflows its row',
      ],
      seeAlso: ['Row', 'Container'],
    },
    {
      name: 'Provider',
      kind: 'component',
      signature: '(props: { theme: PyreonTheme; children?: VNode | null }) => VNode | null',
      // NOT marked stability: 'deprecated' — the manifest policy gate requires a
      // planned `removeIn` version, which is a maintainer decision that hasn't
      // been made. The source JSDoc `@deprecated` tag remains authoritative;
      // the summary + mistakes carry the "prefer PyreonUI" guidance.
      summary:
        'Re-export of `@pyreon/unistyle`\'s low-level theme provider — enriches the theme (pre-computed sorted breakpoints + media-query helpers) and provides it to BOTH the ui-core context and the styler `ThemeContext`. Marked `@deprecated` in source: prefer `<PyreonUI theme={theme} mode="light">` from `@pyreon/ui-core`, which handles all three context layers (styler, core, mode) in one component. The remaining legitimate use is scoping DIFFERENT breakpoints / grid defaults to a subtree.',
      example: `import { Provider, Container, Row, Col, theme } from '@pyreon/coolgrid'

// Standalone (no PyreonUI at the root):
<Provider theme={theme}>
  <Container>…</Container>
</Provider>

// Preferred in real apps — PyreonUI provides the same context:
import { PyreonUI } from '@pyreon/ui-core'
<PyreonUI theme={appTheme} mode="light">
  <Container>…</Container>
</PyreonUI>`,
      mistakes: [
        'Wrapping a fresh `<Provider>` inside an app that already renders `<PyreonUI>` at the root — PyreonUI sets up the unistyle context already; only add a nested Provider to scope DIFFERENT breakpoints to a subtree',
        "Expecting a nested `<Provider>` to inherit the outer Provider's overrides — context is per-Provider; the inner one starts fresh from its own `theme`",
        'Reaching for `Provider` in new code — it is deprecated in favor of `PyreonUI` from `@pyreon/ui-core`',
      ],
      seeAlso: ['theme', '@pyreon/ui-core'],
    },
    {
      name: 'theme',
      kind: 'constant',
      signature:
        "{ rootSize: 16; breakpoints: { xs: 0; sm: 576; md: 768; lg: 992; xl: 1200 }; grid: { columns: 12; container: { xs: '100%'; sm: 540; md: 720; lg: 960; xl: 1140 } } }",
      summary:
        'Default Bootstrap-4-style grid theme: 5 breakpoints (xs–xl), a 12-column grid, and responsive container max-widths. Pass it to `Provider` / `PyreonUI`, or ship your own theme with the same shape (`rootSize`, `breakpoints`, `grid.columns`, `grid.container`) for custom breakpoint names and column counts.',
      example: `import { Provider, theme } from '@pyreon/coolgrid'

<Provider theme={theme}>…</Provider>

// Custom theme — same shape, your own breakpoint names:
<Provider
  theme={{
    rootSize: 16,
    breakpoints: { phone: 0, tablet: 600, desktop: 1024 },
    grid: { columns: 24, container: { phone: '100%', tablet: 540, desktop: 960 } },
  }}
>…</Provider>`,
      mistakes: [
        'Custom themes missing `grid.container` — the Container has no max-width source and renders full-width at every breakpoint',
        "Keying `grid.container` by breakpoint names that don't match `breakpoints` — the responsive engine resolves widths per breakpoint name, so the keys must agree",
      ],
      seeAlso: ['Provider', 'Container'],
    },
  ],
  gotchas: [
    // First gotcha feeds the llms.txt one-liner teaser.
    'Every numeric grid prop (size/gap/gutter/padding/columns) is responsive — a single number, a mobile-first array ([12, 6, 4]), or a breakpoint-keyed object ({ xs: 12, md: 6 }); size 0 hides the column at that breakpoint.',
    {
      label: 'Cascade model',
      note: 'Container provides the grid config via context; Row merges its own props over it and re-provides for Cols; props set at a deeper level override the ancestor for that subtree only. Cascading keys: `columns`, `size`, `gap`, `padding`, `gutter`, `colCss` / `colComponent`, `rowCss` / `rowComponent`, `contentAlignX`.',
    },
    {
      label: 'CSS-variables theming',
      note: 'Under `init({ cssVariables: true })` gap/gutter can arrive as `var(--…)` reference strings — the styled helpers detect them (`isCssVarValue`) and express the grid math in native `calc()` (halving via `* 0.5` / `* -0.5`; a negative `calc()` divisor is invalid CSS). JS arithmetic on a var() string would produce NaN — the historical coolgrid bug class, fixed via the calc() path.',
    },
    {
      label: 'Provider vs PyreonUI',
      note: 'coolgrid re-exports the low-level unistyle `Provider` (deprecated in source). Apps rendering `<PyreonUI>` at the root already have the required context — add a nested `Provider` only to scope different breakpoints to a subtree.',
    },
  ],
})
