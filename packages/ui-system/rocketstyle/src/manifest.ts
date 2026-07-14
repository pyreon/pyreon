import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/rocketstyle',
  title: 'Multi-Dimensional Styling',
  tagline:
    'Multi-dimensional component styling — states, sizes, variants, custom dimensions, dark/light mode, all cached',
  description:
    'Multi-dimensional style composition for Pyreon components — the styling engine the `@pyreon/ui-components` library builds on. Organize styles by named DIMENSIONS (`state`, `size`, `variant`, plus custom ones) instead of flat boolean props: each dimension is a chainable definition method (`.states({...})`, `.sizes({...})`) that auto-generates the matching consumer prop. Base styles go through `.theme()`, dark/light values through the `mode(light, dark)` helper, raw CSS through `.styles()`. Built on `@pyreon/attrs` + `@pyreon/styler`; per-definition WeakMap caches (`_rsMemo` LRU 128/theme) keep per-mount cost near zero for same-definition components.',
  category: 'browser',
  longExample: `import rocketstyle from '@pyreon/rocketstyle'
import { Element } from '@pyreon/elements'

// 1. Create the factory (per app / design system). useBooleans: false is
//    the DEFAULT — dimension props take STRING values (state="primary"),
//    not boolean shorthands.
const rs = rocketstyle()

// 2. Wrap a base component — { name, component } are BOTH required
//    (dev mode throws on a missing one). There is no rs('button') shorthand.
const Button = rs({ name: 'Button', component: Element })
  .attrs({ tag: 'button' })                    // LAYOUT / default props → .attrs()
  .theme((t, mode, css) => ({                  // CSS → .theme(); mode is a HELPER fn
    borderRadius: 4,
    color: mode('#1a1a1a', '#e0e0e0'),         // light value, dark value
    backgroundColor: mode('#fff', '#333'),
    hover: { backgroundColor: mode('#f3f4f6', '#444') },   // nested pseudo-state
    disabled: { opacity: 0.5 },
  }))
  .states({
    primary: { backgroundColor: '#0d6efd', color: '#fff', hover: { backgroundColor: '#0b5ed7' } },
    danger: { backgroundColor: '#dc3545', color: '#fff', hover: { backgroundColor: '#bb2d3b' } },
  })
  .sizes({
    sm: { fontSize: 14, paddingX: 12, paddingY: 6 },
    lg: { fontSize: 18, paddingX: 20, paddingY: 10 },
  })

// 3. Consume — dimension methods are PLURAL, props are SINGULAR strings
<Button state="danger" size="lg">Delete</Button>

// Multi-value dimension (built-in \`multiple\`) takes an array
const Box = rs({ name: 'Box', component: Element })
  .multiple({ rounded: { borderRadius: 999 }, shadow: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' } })
<Box multiple={['rounded', 'shadow']} />

// Transform dimension (built-in \`modifiers\`) — value fns receive the
// theme accumulated from all PRIOR dimensions (e.g. derive "outlined"
// from the active state's colors)
const OutlineButton = Button.modifiers({
  outlined: (t) => ({ color: t.backgroundColor, backgroundColor: 'transparent' }),
})
<OutlineButton state="danger" modifier="outlined" />   // red-on-transparent

// Custom dimensions — override the map at factory init; each key
// becomes a chain method, each propName becomes the consumer prop
const rsBadge = rocketstyle({
  dimensions: { tones: 'tone', decorations: { propName: 'decoration', multi: true } },
})
const Badge = rsBadge({ name: 'Badge', component: 'span' })
  .tones({ info: { color: 'blue' }, warn: { color: 'orange' } })
<Badge tone="warn" decoration={['pill']} />`,
  features: [
    'Chainable immutable builder — every method returns a NEW component, bases fork cleanly into variants',
    'Five built-in dimensions: states/sizes/variants (single-value), multiple (multi-value), modifiers (multi + transform)',
    'Custom dimensions at factory init — each key becomes a chain method + a typed consumer prop',
    'Dark/light via the mode(light, dark) helper in .theme() and dimension callbacks; .config({ inversed }) flips a subtree',
    'Nested pseudo-state objects (hover/focus/active/pressed/disabled/readOnly) compile to CSS pseudo-selectors',
    'Parent-child pseudo-state propagation via .config({ provider: true }) + .config({ consumer })',
    'Per-definition WeakMap caches + _rsMemo LRU (128/theme) — identity-stable results let the styler classCache skip resolution',
    'Opt-in compile-time collapse (pyreon({ collapse: true })) flattens literal-prop call sites into one cloneNode (~44x)',
  ],
  api: [
    {
      name: 'rocketstyle',
      kind: 'function',
      signature:
        "(config?: { dimensions?: Dimensions; useBooleans?: boolean }) => <C>({ name, component }: { name: string; component: C }) => RocketStyleComponent",
      summary:
        'Factory initializer (default + named export). `rocketstyle(config?)` returns a component factory; call THAT with `{ name, component }` to get the chainable builder. `config.dimensions` overrides the dimension map (default: `states: "state"`, `sizes: "size"`, `variants: "variant"`, `multiple: { propName: "multiple", multi: true }`, `modifiers: { propName: "modifier", multi: true, transform: true }`) — each key becomes a chain method, each propName a consumer prop. `config.useBooleans` (default `false`) switches dimension props from strings (`state="primary"`) to boolean shorthands (`<Button primary />`). Dev mode throws on missing `name`/`component`/`dimensions` and on dimension names colliding with reserved keys.',
      example: `import rocketstyle from '@pyreon/rocketstyle'

const rs = rocketstyle()                       // useBooleans: false (default)
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: 4, cursor: 'pointer' }))
  .states({ primary: { backgroundColor: '#0d6efd', color: '#fff' } })

<Button state="primary">Save</Button>          // string dimension props

// Custom dimensions — keys become chain methods, propNames become props
const rsCustom = rocketstyle({
  dimensions: { tones: 'tone', decorations: { propName: 'decoration', multi: true } },
})`,
      mistakes: [
        "Calling the factory with a tag string — `rs('button')` is not a valid form. The factory takes `{ name, component }` and BOTH are required (dev mode throws on a missing one)",
        'Passing boolean shorthand props under the default `useBooleans: false` — `<Button primary />` is an UNKNOWN prop that silently does nothing; write `<Button state="primary" />` or opt into `rocketstyle({ useBooleans: true })`',
        'Passing a function accessor to a dimension prop — `state={() => expr}` is the wrong shape; dimension props take plain string values (`state={expr}`) and the compiler handles reactivity via `_rp()` wrapping',
        "Using a reserved key as a custom dimension name — `light`, `dark`, `provider`, `consumer`, `DEBUG`, `name`, `component`, `inversed`, `passProps`, `styled`, `theme`, `styles`, `compose`, `attrs` all throw at factory init in dev mode",
        'Calling a dimension method with the singular prop name — `.state({...})` is not a method; DEFINITION methods are plural (`.states()`), the consumer PROP is singular (`state="primary"`)',
        'Mounting each rocketstyle-heavy view under its own theme provider — the `_rsMemo` dimension-prop memo is keyed by theme identity, so real apps need ONE shared `<PyreonUI>` provider for the memo to span component instances',
        'Expecting the chain to mutate — every chain method returns a NEW component; `Button.states({...})` without assigning the return value does nothing to `Button`',
      ],
      seeAlso: ['Provider', 'isRocketComponent', '@pyreon/attrs', '@pyreon/styler'],
    },
    {
      name: '.config()',
      kind: 'function',
      signature:
        '(opts: { name?; component?; provider?: boolean; consumer?: ConsumerCb; inversed?: boolean; passProps?: string[]; DEBUG?: boolean; styled?: boolean }) => RocketStyleComponent',
      summary:
        'Reconfigure the builder: rename (`name` → `displayName`), swap the base (`component`), wire parent-child pseudo-state context (`provider: true` exposes this component\'s hover/focus/pressed state to descendants; `consumer` reads a parent provider\'s state into this component\'s props), flip dark/light for the subtree (`inversed: true`), re-forward normally-consumed props to the base (`passProps`), and toggle dev-only debug logging (`DEBUG`). Accepted keys are exactly the CONFIG_KEYS set — anything else is ignored.',
      example: `// Parent provides its pseudo-state; child derives its own state from it
const ButtonGroup = Button.config({ provider: true })
const ButtonIcon = rs({ name: 'ButtonIcon', component: Element })
  .config({
    consumer: (ctx) => ctx(({ pseudo }) => ({ state: pseudo.hover ? 'active' : 'default' })),
  })
  .states({ default: { color: '#666' }, active: { color: '#fff' } })

<ButtonGroup state="primary"><ButtonIcon />Label</ButtonGroup>

// Swap the base — resets attrs/compose chains (see mistakes)
const Anchor = Button.config({ component: 'a', name: 'Anchor' }).attrs({ href: '#' })`,
      mistakes: [
        '`.config({ component: NewBase })` with a DIFFERENT component RESETS the accumulated `attrs` / `priorityAttrs` / `filterAttrs` / `compose` chains — they were tailored to the previous component\'s prop shape and would leak invalid props to the DOM (e.g. `disabled` on an `<a>`). `theme` / `styles` / dimension chains ARE preserved. Re-chain shared attrs explicitly after the swap',
        'Expecting `.config({ inversed: true })` to set a mode — it INVERTS whatever mode the surrounding provider resolves (light↔dark) for this subtree; it does not force dark',
        '`DEBUG: true` logging is dev-only (`process.env.NODE_ENV !== "production"`) — it is tree-shaken from production builds, so don\'t rely on it for runtime diagnostics',
        'Using `provider`/`consumer` for theme data — they propagate live PSEUDO-STATE (hover/focus/pressed) between parent and child rocketstyle components; theme/mode flow through the theme provider (`PyreonUI` or rocketstyle `Provider`), not this channel',
      ],
      seeAlso: ['rocketstyle', 'Provider'],
    },
    {
      name: '.attrs()',
      kind: 'function',
      signature:
        '(attrs: object | ((props, theme, helpers) => object), opts?: { priority?: boolean; filter?: string[] }) => RocketStyleComponent',
      summary:
        'Inject default props into the wrapped component. Object form for static defaults; callback form receives `(props, theme, helpers)` where `helpers = { render, mode, isDark, isLight }` (`mode` is the resolved `"light" | "dark"` string here, unlike `.theme()` where it is a helper function). Merge precedence at render time is `priorityAttrs < attrs < explicit call-site props` — explicit props always win; `undefined` explicit values are stripped so they never shadow defaults. `{ priority: true }` puts the entry on the priority chain (resolved FIRST, visible as input to later `.attrs()` callbacks, LOWEST final precedence); `{ filter: [...] }` strips prop names before they reach the base (accumulates across the chain).',
      example: `const SubmitButton = rs({ name: 'SubmitButton', component: Element })
  // Layout / structural props belong here (tag, direction, alignX, gap...)
  .attrs({ tag: 'button', type: 'submit' })
  // Callback form — helpers carries the resolved mode
  .attrs((props, theme, { mode, isDark }) => ({
    'data-mode': mode,                        // 'light' | 'dark'
    title: props.disabled ? 'Disabled' : 'Submit',
  }))
  // Strip an internal control prop before it reaches the DOM
  .attrs({}, { filter: ['internalFlag'] })

<SubmitButton />                 // type="submit" applies
<SubmitButton type="button" />   // explicit prop wins over the default`,
      mistakes: [
        'Putting CSS in `.attrs()` — the convention with Element-based bases is LAYOUT props in `.attrs()` (`tag`, `direction`, `alignX`, `alignY`, `gap`, `block`) and visual CSS in `.theme()` (colors, spacing, borders, shadows)',
        'Assuming `{ priority: true }` means "wins over explicit props" — priority attrs are resolved FIRST and feed later `.attrs()` callbacks as input, but they sit at the LOWEST precedence in the final merge (`priorityAttrs < attrs < explicit props`)',
        'Expecting `.attrs()` callback prop reads to be reactive — callbacks legitimately read prop VALUES one-shot at mount time by design (`({ href }) => ({ tag: href ? "a" : "button" })`); reactive getter props survive the merge for downstream JSX, but the callback body itself is not a tracked scope',
        'Passing `undefined` explicitly to defeat a default — `<Button type={undefined} />` does NOT shadow the `.attrs()` default; undefined values are stripped before merging',
        'Confusing `.attrs()` (per-component default props) with the `@pyreon/attrs` package factory — rocketstyle builds on the same chaining engine but adds theme/dimension resolution on top',
      ],
      seeAlso: ['.theme()', '.config()', '@pyreon/attrs'],
    },
    {
      name: '.theme()',
      kind: 'function',
      signature:
        '(theme: object | ((theme, mode, css) => object)) => RocketStyleComponent',
      summary:
        'Always-applied base styles, merged under every dimension slice. The callback receives `(theme, mode, css)`: `theme` is the app theme from context, `mode` is the `mode(light, dark)` HELPER function (returns the value matching the active mode — NOT a string), `css` is the styler helper. Chaining `.theme()` multiple times is additive (results deep-merge in chain order). Pseudo-state styles nest as objects (`hover` / `focus` / `active` / `pressed` / `disabled` / `readOnly`) and compile to CSS pseudo-selectors. Property names follow the unistyle convention.',
      example: `const Card = rs({ name: 'Card', component: 'div' })
  .theme((t, mode, css) => ({
    borderRadius: 8,
    // mode(light, dark) picks per active mode — one definition, both modes
    backgroundColor: mode('#ffffff', '#1a1a1a'),
    color: mode('#1a1a1a', '#e0e0e0'),
    borderWidthTop: 1,                        // unistyle naming, NOT borderTopWidth
    hover: { boxShadow: mode('0 2px 8px rgba(0,0,0,0.1)', '0 2px 8px rgba(0,0,0,0.6)') },
    disabled: { opacity: 0.5 },
  }))`,
      mistakes: [
        'Chaining an empty `.theme({})` — a no-op that merges nothing; skip `.theme()` entirely when a component has no base styles',
        'Treating the second callback argument as a string — in `.theme()` and dimension callbacks `mode` is the `mode(light, dark)` HELPER function (`backgroundColor: mode("#fff", "#333")`), not `"light" | "dark"`; the resolved string form lives on `.attrs()` callbacks\' `helpers.mode`',
        'Using CSS-spec property order — rocketstyle themes use the unistyle convention (`borderWidthTop`, `borderColorLeft`), NOT `borderTopWidth` / `borderLeftColor`',
        'Expecting `:hover` styles to apply only to interactive components — `hover` theme compiles to an UNCONDITIONAL `:hover` rule on every component that defines it; only `cursor: pointer` is gated on `onClick` / `href`',
        'Passing unitless numbers to `mode()` under `init({ cssVariables: true })` — `mode(8, 12)` is emitted verbatim into the CSS var with no unit applied (dev warns); pass unit-complete values (`mode("8px", "12px")`)',
      ],
      seeAlso: ['.states() / .sizes() / .variants()', '.styles()', 'resolveModeVar'],
    },
    {
      name: '.states() / .sizes() / .variants()',
      kind: 'function',
      signature:
        '(values: Record<string, object> | ((theme, mode, css) => Record<string, object>)) => RocketStyleComponent',
      summary:
        'Single-value dimension definition methods (from the default dimension map). Each declares every valid value for its consumer prop — `.states({...})` drives `state="..."`, `.sizes({...})` drives `size="..."`, `.variants({...})` drives `variant="..."`. The active value\'s style slice merges over the `.theme()` base; a dimension prop with no matching value contributes nothing (every dimension is optional at the call site). The callback form receives `(theme, mode, css)` for theme-token-driven values. Custom dimensions declared at factory init get an identically-shaped method named after each dimension key.',
      example: `const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: 4, cursor: 'pointer' }))
  .states((t, mode) => ({
    primary: { backgroundColor: '#0d6efd', color: '#fff', hover: { backgroundColor: '#0b5ed7' } },
    danger: { backgroundColor: '#dc3545', color: '#fff' },
  }))
  .sizes({
    sm: { fontSize: 14, paddingX: 12, paddingY: 6 },
    lg: { fontSize: 18, paddingX: 20, paddingY: 10 },
  })

<Button state="primary" size="lg">Save</Button>
<Button>plain — dimensions are optional</Button>`,
      mistakes: [
        'Method/prop name confusion — DEFINITION methods are plural (`.states()`, `.sizes()`, `.variants()`), consumer PROPS are singular (`state`, `size`, `variant`)',
        'Using a dimension prop the component never defined — e.g. `variant="outlined"` on a component with no `.variants()` chain is invalid and surfaces as a type error (`never[]`); check the component definition first',
        'Nesting pseudo-state at the wrong level — `hover` nests INSIDE a value slice (`primary: { hover: {...} }`), where it overrides the `.theme()`-level `hover` for that state',
        'Expecting per-instance style overrides through dimension props — dimension values are a closed set declared at definition time; arbitrary one-off styles go through the base component\'s style props or a new dimension value',
      ],
      seeAlso: ['.multiple() / .modifiers()', '.theme()', 'rocketstyle'],
    },
    {
      name: '.multiple() / .modifiers()',
      kind: 'function',
      signature:
        '(values: Record<string, object | ((theme) => object)> | ((theme, mode, css) => Record<string, object>)) => RocketStyleComponent',
      summary:
        'Multi-value dimension definition methods (from the default dimension map). `.multiple({...})` drives the `multiple` prop, `.modifiers({...})` drives `modifier` — both accept an ARRAY of active values at the call site (`multiple={["rounded", "shadow"]}`), all of which compose onto the theme. `modifiers` is additionally a TRANSFORM dimension: its value functions receive the theme ACCUMULATED from all prior dimensions, so a modifier can derive from the active state (e.g. `outlined` reading the current state\'s `backgroundColor`). Custom dimensions opt into the same behaviors via `{ multi: true }` / `{ transform: true }`.',
      example: `const Box = rs({ name: 'Box', component: Element })
  .multiple({
    rounded: { borderRadius: 999 },
    shadow: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
  })
<Box multiple={['rounded', 'shadow']} />       // both slices compose

// Transform dimension — value fn receives the ACCUMULATED theme
const Button2 = rs({ name: 'Button2', component: Element })
  .theme({ backgroundColor: '#0d6efd', color: '#fff' })
  .states({ danger: { backgroundColor: '#dc3545' } })
  .modifiers({
    outlined: (t) => ({ color: t.backgroundColor, backgroundColor: 'transparent' }),
  })
<Button2 state="danger" modifier="outlined" />  // outlined sees danger's red`,
      mistakes: [
        'Passing a single string to a multi dimension and expecting array semantics — `multiple="rounded"` and `multiple={["rounded"]}` both work, but composing several values requires the array form',
        'Expecting a transform value fn to see the raw app theme — transform-dimension value functions receive the theme accumulated from PRIOR dimensions (base + active state/size/variant), which is the whole point; read app-theme tokens in a dimension-level callback instead',
        'Declaring a custom multi dimension as a bare string — `{ decorations: "decoration" }` is single-value; multi needs the object form `{ propName: "decoration", multi: true }`',
      ],
      seeAlso: ['.states() / .sizes() / .variants()', 'rocketstyle'],
    },
    {
      name: '.styles()',
      kind: 'function',
      signature: '(cb: (css) => CSSResult) => RocketStyleComponent',
      summary:
        'Raw-CSS escape hatch for what the dimension model can\'t express. The callback receives the styler\'s tagged-template `css` helper; interpolation functions inside the template receive the component\'s styled-props, notably `$rocketstyle` (the fully resolved theme — base + active dimension slices merged, identity-cached per dimension-prop combo) and `$rocketstate` (active dimension values + `pseudo: { hover, focus, pressed, active, disabled, readOnly }` flags).',
      example: `const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ background: '#eee', hover: { background: '#ddd' } }))
  .styles(
    (css) => css\`
      transition: background 0.15s ease;
      border: none;
      \${({ $rocketstyle }) => css\`
        background: \${resolveTheme($rocketstyle).background};
      \`}
    \`,
  )`,
      mistakes: [
        'Reading `$rocketstyle` as a plain object in interpolations — it may be a function ACCESSOR (reactive) or a plain object depending on the render path; resolve it with `resolveTheme($rocketstyle)` from `@pyreon/rocketstyle`',
        'Reaching for `.styles()` for things the dimension model expresses — colors/spacing per state belong in `.states()` / `.theme()` where they get the mode helper, caching, and CSS-variables support; `.styles()` is for selectors and interpolation the object model can\'t say',
        'Driving pseudo-state visuals from `$rocketstate.pseudo` when a CSS pseudo-selector would do — the nested `hover: {...}` theme object already compiles to `:hover`; the JS flags are for components that track interaction state in JavaScript (via `.config({ provider: true })` wiring)',
      ],
      seeAlso: ['resolveTheme', '.theme()', '@pyreon/styler'],
    },
    {
      name: '.compose()',
      kind: 'function',
      signature:
        '(hocs: Record<string, ((c: ComponentFn) => ComponentFn) | null | false>) => RocketStyleComponent',
      summary:
        'Wrap the component in named higher-order components. The argument is a RECORD of `{ name: hoc }` (not an array) so later chain calls can remove a previously composed HOC by setting its name to a falsy value. The built-in rocketstyle attrs HOC is always the outermost wrapper, so default props are resolved before any user HOC runs.',
      example: `const withTooltip = (Component) => (props) => Component(props)

const Button = rs({ name: 'Button', component: 'button' })
  .states({ primary: { background: 'royalblue' } })
  .compose({ withTooltip })

// Remove a previously composed HOC by name
const Plain = Button.compose({ withTooltip: null })`,
      mistakes: [
        'Passing an array of HOCs — `.compose()` takes a named record (`{ withTooltip }`), which is what makes falsy-removal (`{ withTooltip: null }`) possible',
        'Composing a HOC that value-copies props (`{ ...props }` into a new object at setup) — that fires reactive getter props once and collapses them to static values; forward props by reference or merge with `mergeProps` from `@pyreon/core`',
        'Forgetting that `.config({ component: NewBase })` RESETS the compose chain along with the attrs chains — re-chain HOCs after a base swap',
      ],
      seeAlso: ['.config()', '@pyreon/attrs'],
    },
    {
      name: '.statics()',
      kind: 'function',
      signature: '(meta: Record<string, unknown>) => RocketStyleComponent',
      summary:
        'Attach arbitrary static metadata. Values land on the component\'s `.meta` object AND directly on the component itself (so `"key" in Component` checks work — `@pyreon/document-primitives` uses this for `_documentType`). Successive `.statics()` calls merge.',
      example: `const Button = rs({ name: 'Button', component: 'button' })
  .statics({ category: 'action', version: '1.0' })

Button.meta.category   // 'action'
'category' in Button   // true — also assigned onto the component`,
      mistakes: [
        'Using `.statics()` for per-instance data — statics are definition-level metadata shared by every instance; per-instance values are props',
        'Colliding with the builder surface — static keys land on the component object, so names like `attrs` / `config` / `theme` would shadow the chain methods; pick namespaced keys',
      ],
      seeAlso: ['.compose()', 'isRocketComponent'],
    },
    {
      name: 'Provider',
      kind: 'component',
      signature: '(props: TProvider) => VNodeChild',
      summary:
        'Tree-level theme + mode provider. Props are `{ children, theme?, mode?, inversed?, provider? }` — `mode` is `"light" | "dark"`, `inversed: true` flips the resolved mode for the subtree, and values merge over any parent rocketstyle context. Most apps use the higher-level `<PyreonUI>` from `@pyreon/ui-core` (theme + mode + config in one) and reach for rocketstyle\'s `Provider` only for fine-grained subtree overrides. The raw context object backing it is exported as `context`.',
      example: `import { Provider } from '@pyreon/rocketstyle'

<Provider theme={myTheme} mode="dark">
  <Button state="primary">Dark mode button</Button>
</Provider>

// Invert a subtree (dark island in a light page)
<Provider inversed>
  <Card>Resolves mode() as the opposite mode</Card>
</Provider>`,
      mistakes: [
        'Passing a `value` prop (React-context muscle memory) — there is no `value`; `Provider` takes `theme` / `mode` / `inversed` directly',
        'Mounting a fresh `Provider`/`PyreonUI` per view — the `_rsMemo` cache keys on theme identity, so per-view providers defeat cross-instance memoization; share ONE app-level provider',
        'Confusing this theme/mode provider with `.config({ provider: true })` — the latter is the component-to-component PSEUDO-STATE channel, unrelated to theming',
      ],
      seeAlso: ['rocketstyle', '.config()', '@pyreon/ui-core'],
    },
    {
      name: 'context',
      kind: 'constant',
      signature: 'context: ReactiveContext<{ theme; mode; isDark; isLight; … }>',
      summary:
        'The raw reactive context object backing `Provider` — RE-EXPORTED from `@pyreon/ui-core`, so it is the SAME context `<PyreonUI>` and rocketstyle `Provider` write, not a rocketstyle-specific one. `useContext(context)` returns a `() => { theme, mode, isDark, isLight, … }` ACCESSOR (reactive); rocketstyle\'s `Provider` and its per-component dimension resolution read the active theme + mode through it. Exposed for advanced consumers building their OWN theme/mode-aware primitives; app code uses `Provider` / `<PyreonUI>` + the built-in dimension resolution instead.',
      example: `import { context } from '@pyreon/rocketstyle'
import { useContext } from '@pyreon/core'

const getCtx = useContext(context)   // () => { theme, mode, isDark, isLight }
const { mode, isDark } = getCtx()    // call the accessor to read`,
      mistakes: [
        'Treating `useContext(context)` as the config object — it is the ACCESSOR `() => ctx` (a reactive context); CALL it to read: `const ctx = useContext(context)()`.',
        'Creating a fresh context expecting rocketstyle to read it — `context` is re-exported from `@pyreon/ui-core`; `<PyreonUI>` and rocketstyle `Provider` all write THIS same object. Provide through them, not a new context.',
      ],
      seeAlso: ['Provider', 'rocketstyle', '@pyreon/ui-core'],
    },
    {
      name: 'isRocketComponent',
      kind: 'function',
      signature: '<T>(component: T) => boolean',
      summary:
        'Runtime type guard — `true` when a value was created by `rocketstyle()` (checks the own `IS_ROCKETSTYLE` marker). Use it wherever code must discriminate rocketstyle components from plain functions/components — a `typeof value === "function"` check cannot tell them apart because a rocketstyle component IS a callable function.',
      example: `import { isRocketComponent } from '@pyreon/rocketstyle'

isRocketComponent(Button)   // true
isRocketComponent('div')    // false
isRocketComponent(() => null) // false — plain functions lack the marker`,
      mistakes: [
        'Discriminating with `typeof value === "function"` — rocketstyle components are callable, so the typeof check matches both; use the marker guard',
      ],
      seeAlso: ['rocketstyle', '@pyreon/attrs'],
    },
    {
      name: 'resolveTheme',
      kind: 'function',
      signature: '<T = Record<string, unknown>>(value: (() => T) | T) => T',
      summary:
        'Resolve a `$rocketstyle` value inside `styled()` / `.styles()` interpolation functions — handles both the function-accessor (reactive) shape and the plain-object shape, returning the resolved theme object either way.',
      example: `import { resolveTheme } from '@pyreon/rocketstyle'

styled(Component)\`
  color: \${(props) => resolveTheme(props.$rocketstyle).color};
\``,
      mistakes: [
        'Calling `props.$rocketstyle()` unconditionally — it is only sometimes a function; `resolveTheme` normalizes both shapes',
      ],
      seeAlso: ['.styles()', '@pyreon/styler'],
    },
    {
      name: 'resolveModeVar',
      kind: 'function',
      signature: "(value: unknown, mode?: 'light' | 'dark') => unknown",
      summary:
        'Under `init({ cssVariables: true })`, `mode(light, dark)` pairs are emitted as hashed CSS custom properties (`var(--px-m-<hash>)`). `resolveModeVar(value, mode)` resolves such a mode-pair reference back to its raw light/dark value — needed by non-CSS render targets (PDF / DOCX / email document export). Defaults to `mode: "light"`; non-strings and strings without a `var(` reference pass through unchanged.',
      example: `import { resolveModeVar } from '@pyreon/rocketstyle'

// after <X color={mode('#000', '#fff')} /> under cssVariables:
resolveModeVar('var(--px-m-abc123)', 'dark')   // '#fff'
resolveModeVar('#ff0000', 'dark')              // '#ff0000' — passthrough`,
      mistakes: [
        'Expecting it to resolve theme-leaf variables — it only resolves `--px-m-*` MODE-PAIR vars allocated by the mode factory; theme-token vars (`--px-spacing-small`) live in `themeToCssVars`\'s registry and need `resolveCssVarReferences` from `@pyreon/unistyle`',
      ],
      seeAlso: ['.theme()', '@pyreon/unistyle'],
    },
  ],
  gotchas: [
    'useBooleans defaults to FALSE — dimension props take strings (state="primary"), not boolean shorthands. Historically the TYPE default said true while the runtime was false, so boolean props typechecked but were silently dropped; the runtime default (false) is now authoritative in both.',
    {
      label: 'Layout vs CSS split',
      note: 'With Element-based bases, layout props go in `.attrs()` (`tag`, `direction`, `alignX`, `alignY`, `gap`, `block`) and visual CSS goes in `.theme()`. CSS property names follow the unistyle convention (`borderWidthTop`, not `borderTopWidth`).',
    },
    {
      label: 'Cache keys post-normalization',
      note: 'The `_rsMemo` dimension-prop memo keys on RESOLVED dimension values (after boolean-shorthand normalization), not raw props — under `useBooleans: true`, keying on raw props would collide every boolean variant onto the first cached entry (a real shipped bug, since fixed). Cache capacity is LRU 128 entries per theme; real apps need ONE shared `<PyreonUI>` for the memo to span instances.',
    },
    {
      label: 'Component-swap reset',
      note: '`.config({ component: NewBase })` resets the `attrs` / `priorityAttrs` / `filterAttrs` / `compose` chains (prop-shape-coupled), while `theme` / `styles` / dimension chains survive (they target rendered CSS). This reset is rocketstyle-specific — the lower-level `@pyreon/attrs` `.config()` preserves its chains.',
    },
    {
      label: 'Introspection surface',
      note: 'Every rocketstyle component carries `IS_ROCKETSTYLE: true`, `displayName`, `meta` (from `.statics()`), the read-only `__rs_attrs` accumulated attrs chain (used by `@pyreon/connector-document` to compute post-attrs props without mounting), plus `getDefaultAttrs(props, theme, mode)` and `getStaticDimensions(theme)` helpers.',
    },
  ],
})
