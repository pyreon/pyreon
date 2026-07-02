import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/kinetic-presets',
  title: 'Animation Presets',
  tagline:
    '122 animation presets + 5 configurable factories + 5 composition utilities for @pyreon/kinetic',
  description:
    'The preset catalog for `@pyreon/kinetic`. Every preset is a plain `Preset` object — style-form fields (`enterStyle` / `enterToStyle` / `enterTransition` + leave siblings) and/or class-form fields (`enter` / `enterFrom` / `enterTo` + leave siblings) — passed straight to `kinetic(...).preset(...)`. 122 ready-made presets ship as named exports AND on the `presets` map (for dynamic selection by name); five factories (`createFade` / `createSlide` / `createScale` / `createRotate` / `createBlur`) generate parameterized variants; five utilities (`compose` / `withDuration` / `withEasing` / `withDelay` / `reverse`) transform presets without forking them. Zero dependencies, framework-agnostic — presets are plain objects.',
  category: 'universal',
  longExample: `import { kinetic } from '@pyreon/kinetic'
import {
  fadeUp, bounceIn, presets,
  createFade, createScale,
  compose, withDuration, withEasing, withDelay, reverse,
} from '@pyreon/kinetic-presets'

// Use a preset directly (named export or via the presets map):
const Hero = kinetic('div').preset(fadeUp)
const Chosen = kinetic('div').preset(presets[userChoice]) // dynamic by name

// Factories generate parameterized variants:
const SlowFade = kinetic('div').preset(createFade({ direction: 'up', distance: 24, duration: 800 }))
const Spring = kinetic('div').preset(createScale({ from: 0.8, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }))

// Composition utilities return new Preset objects and chain freely:
const fancy = compose(createFade(), createScale({ from: 0.95 }))   // shallow style merge
const slow = withDuration(fadeUp, 600, 400)                        // enter 600ms, leave 400ms
const bouncy = withEasing(bounceIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)')
const delayed = withDelay(fadeUp, 150, 0)                          // enter delay 150ms
const flipped = reverse(fadeUp)                                    // swap enter <-> leave

// A preset is just an object — hand-craft your own:
import type { Preset } from '@pyreon/kinetic-presets'
const myPreset: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0) scale(1)' },
  enterTransition: 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  leaveStyle: { opacity: 1, transform: 'translateY(0) scale(1)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(-10px) scale(0.98)' },
  leaveTransition: 'all 250ms ease-in',
}`,
  features: [
    '122 presets — fades, slides, scales, zooms, flips, rotations, bounce/spring, blur, clip-path, perspective, tilt, swing, and more',
    'Every preset is a named export AND a `presets` map entry (dynamic selection by name)',
    '5 factories: createFade / createSlide / createScale / createRotate / createBlur (direction, distance, duration, easing)',
    '5 composition utilities: compose / withDuration / withEasing / withDelay / reverse',
    'Tree-shakeable — importing one preset ships ~300 bytes, not the whole catalog',
    'Style-form and class-form (Tailwind-friendly) preset fields',
    'Zero dependencies, framework-agnostic — presets are plain objects',
  ],
  api: [
    {
      name: 'presets',
      kind: 'constant',
      signature: 'Record<string, Preset>',
      summary:
        'The full catalog as one `as const` map — 122 entries, every one also available as a named export (`fadeUp`, `bounceIn`, `zoomInLeft`, ...). Use the map for dynamic selection (`presets[name]`); use named imports for tree-shaking (a single named preset ships ~300 bytes thanks to per-call pure annotations). Categories: fades (14), slides (8), scales (8), zooms (10), flips (6), rotations (8), bounce/spring/pop (10), blur (6), puff (2), clip-path (8), perspective (4), tilt (4), swing (4), slit (2), swirl (2), back (4), light-speed (2), roll (2), fly (4), float (4), push (2), expand (2), skew (4), drop/rise (2). All are style-form presets built on `all <duration> <easing>` transitions (default enter 300ms ease-out / leave 200ms ease-in; spring/bounce presets override the easing with cubic-bezier curves).',
      example: `import { fadeUp, bounceIn } from '@pyreon/kinetic-presets'   // tree-shakeable
import { presets } from '@pyreon/kinetic-presets'             // dynamic access

const Hero = kinetic('div').preset(fadeUp)
const Dynamic = kinetic('div').preset(presets[userChoice])    // 'fadeUp' | 'scaleIn' | ...`,
      mistakes: [
        "Indexing `presets[name]` with a misspelled name — it returns `undefined`, and `kinetic(...).preset(undefined)` silently applies nothing (spreading undefined is a no-op); there's no runtime error, the element just doesn't animate",
        'Importing the whole `presets` map when you use one or two presets — the map pins all 122 entries; named imports tree-shake to just what you use',
      ],
      seeAlso: ['Preset', 'compose', '@pyreon/kinetic'],
    },
    {
      name: 'createFade',
      kind: 'function',
      signature: '(options?: FadeOptions) => Preset',
      summary:
        'Factory for fade presets. With no `direction` it is a pure opacity fade (0 → 1); with a `direction` it adds movement — the element enters traveling in that direction (`\'up\'` starts `translateY(distance)` below and moves to 0). Options: `direction?: \'up\' | \'down\' | \'left\' | \'right\'`, `distance?: number` (px, default 16), plus the timing options every factory shares: `duration?: number` (ms, default 300), `leaveDuration?: number` (default 200), `easing?: string` (default \'ease-out\'), `leaveEasing?: string` (default \'ease-in\').',
      params: [
        {
          name: 'options',
          type: 'FadeOptions',
          description:
            'direction / distance (default 16) / duration (default 300) / leaveDuration (default 200) / easing / leaveEasing.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A style-form preset — pass to `kinetic(...).preset(...)`.' },
      example: `createFade()                                    // pure opacity fade
createFade({ direction: 'up', distance: 24 })   // fade with movement
createFade({ duration: 500, easing: 'ease-in-out' })`,
      seeAlso: ['createSlide', 'createScale', 'createRotate', 'createBlur'],
    },
    {
      name: 'createSlide',
      kind: 'function',
      signature: '(options?: SlideOptions) => Preset',
      summary:
        'Factory for slide presets — same shape as `createFade` but `direction` defaults to `\'up\'` (always includes movement). The generated preset fades opacity alongside the translate. Options: `direction?` (default \'up\'), `distance?` (px, default 16), plus the shared `duration` / `leaveDuration` / `easing` / `leaveEasing`.',
      params: [
        {
          name: 'options',
          type: 'SlideOptions',
          description: "direction (default 'up') / distance (default 16) / shared timing options.",
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A style-form preset.' },
      example: `createSlide({ direction: 'left', distance: 32 })
createSlide({ duration: 400, leaveDuration: 250 })`,
      seeAlso: ['createFade'],
    },
    {
      name: 'createScale',
      kind: 'function',
      signature: '(options?: ScaleOptions) => Preset',
      summary:
        'Factory for scale presets — enters from `scale(from)` + opacity 0 to `scale(1)` + opacity 1; leave reverses. `from` defaults to 0.9. Pair with a spring cubic-bezier easing for bouncy pop-ins. Shares the `duration` / `leaveDuration` / `easing` / `leaveEasing` timing options.',
      params: [
        {
          name: 'options',
          type: 'ScaleOptions',
          description: 'from (default 0.9) / shared timing options.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A style-form preset.' },
      example: `createScale({ from: 0.5, duration: 400 })
createScale({ from: 0.8, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' })  // spring bounce`,
      seeAlso: ['createFade', 'createBlur'],
    },
    {
      name: 'createRotate',
      kind: 'function',
      signature: '(options?: RotateOptions) => Preset',
      summary:
        'Factory for rotation presets — enters from `rotate(-degrees)` + opacity 0 to `rotate(0)`; the leave ends at `rotate(+degrees)` (opposite spin on the way out). `degrees` defaults to 15; pass a negative value for counter-clockwise enter. Shares the timing options.',
      params: [
        {
          name: 'options',
          type: 'RotateOptions',
          description: 'degrees (default 15) / shared timing options.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A style-form preset.' },
      example: `createRotate({ degrees: 30, duration: 400 })
createRotate({ degrees: -90 })  // counter-clockwise enter`,
      seeAlso: ['createFade'],
    },
    {
      name: 'createBlur',
      kind: 'function',
      signature: '(options?: BlurOptions) => Preset',
      summary:
        'Factory for blur presets — enters from `blur(amount)` + opacity 0 to `blur(0px)` + opacity 1. `amount` defaults to 8 (px). Optional `scale` adds a `transform: scale(scale)` to the hidden state for a combined blur-and-scale reveal. Shares the timing options. Note `filter` animates on the compositor thread, so blur presets stay smooth.',
      params: [
        {
          name: 'options',
          type: 'BlurOptions',
          description: 'amount (px, default 8) / scale (optional) / shared timing options.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A style-form preset.' },
      example: `createBlur({ amount: 12, duration: 400 })
createBlur({ amount: 8, scale: 0.95 })  // blur + scale`,
      seeAlso: ['createScale'],
    },
    {
      name: 'compose',
      kind: 'function',
      signature: '(...items: Preset[]) => Preset',
      summary:
        'Merge multiple presets into one. Style objects (`enterStyle` / `enterToStyle` / `leaveStyle` / `leaveToStyle`) are shallow-merged — a later preset wins per CSS property. Transition strings (`enterTransition` / `leaveTransition`) are LAST-preset-wins (replaced, not comma-joined). Class fields (`enter` / `enterFrom` / ... ) are concatenated with a space. Style-form and class-form fields merge independently, so composing an inline preset with a class preset yields both surfaces.',
      params: [
        { name: 'items', type: 'Preset[]', description: 'Presets merged left to right.' },
      ],
      returns: { type: 'Preset', description: 'A new merged preset; inputs are not mutated.' },
      example: `const fancy = compose(fade, scaleIn, blurIn)
// enterStyle:      { opacity: 0, transform: 'scale(0.9)', filter: 'blur(8px)' }
// enterTransition: 'all 300ms ease-out'  (from blurIn — the LAST preset wins)`,
      mistakes: [
        'Expecting transition strings to be comma-joined — `enterTransition` / `leaveTransition` are taken from the LAST preset that defines them; the built-in presets all use `all ...` transitions so the last one still animates every merged property',
        'Expecting property-level deep merge — style merge is shallow: if two presets both set `transform` in `enterToStyle`, the later one replaces it entirely',
      ],
      seeAlso: ['withDuration', 'withEasing', 'withDelay', 'reverse'],
    },
    {
      name: 'withDuration',
      kind: 'function',
      signature: '(preset: Preset, enterMs: number, leaveMs?: number) => Preset',
      summary:
        'Return a copy of the preset with new durations — replaces the FIRST duration token (e.g. `300ms`) in `enterTransition` and `leaveTransition` via regex. `leaveMs` defaults to `enterMs`. Only affects the style-form transition STRINGS: a class-form preset (Tailwind `duration-300` classes) is untouched — change the classes instead.',
      params: [
        { name: 'preset', type: 'Preset', description: 'Source preset (not mutated).' },
        { name: 'enterMs', type: 'number', description: 'New enter duration in ms.' },
        {
          name: 'leaveMs',
          type: 'number',
          description: 'New leave duration in ms; defaults to enterMs.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A new preset with rewritten transition strings.' },
      example: `const slow = withDuration(fadeUp, 600, 400)
// enterTransition: 'all 600ms ease-out'
// leaveTransition: 'all 400ms ease-in'`,
      mistakes: [
        'Applying it to a class-form preset — there is no transition string to rewrite, so the Tailwind `duration-*` classes keep their own timing',
        'Expecting every duration in a multi-property transition string to change — only the FIRST duration token is replaced (the built-in presets use single `all <duration> <easing>` shorthands, where this is exact)',
      ],
      seeAlso: ['withEasing', 'withDelay', 'compose'],
    },
    {
      name: 'withEasing',
      kind: 'function',
      signature: '(preset: Preset, enterEasing: string, leaveEasing?: string) => Preset',
      summary:
        'Return a copy of the preset with new easing — replaces the TRAILING easing token (`ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, or `cubic-bezier(...)`) at the end of `enterTransition` / `leaveTransition`. `leaveEasing` defaults to `enterEasing`. Style-form transition strings only, same caveat as `withDuration`.',
      params: [
        { name: 'preset', type: 'Preset', description: 'Source preset (not mutated).' },
        { name: 'enterEasing', type: 'string', description: 'New enter easing token.' },
        {
          name: 'leaveEasing',
          type: 'string',
          description: 'New leave easing; defaults to enterEasing.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A new preset with rewritten transition strings.' },
      example: `const springy = withEasing(scaleIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)')
// enterTransition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'`,
      mistakes: [
        'Using it on a transition string whose easing is not one of the recognized trailing patterns (`ease*` / `linear` / `cubic-bezier(...)`) — the regex will not match and the string is returned unchanged',
      ],
      seeAlso: ['withDuration', 'withDelay'],
    },
    {
      name: 'withDelay',
      kind: 'function',
      signature: '(preset: Preset, enterDelayMs: number, leaveDelayMs?: number) => Preset',
      summary:
        'Return a copy of the preset with a transition delay — inserts the delay after the first duration in the transition string, following the CSS shorthand order `property duration delay easing` (`all 300ms ease-out` → `all 300ms 150ms ease-out`). `leaveDelayMs` defaults to `enterDelayMs`; pass `0` for no leave delay. Useful for hand-rolled staggering when you are not using kinetic\'s stagger mode.',
      params: [
        { name: 'preset', type: 'Preset', description: 'Source preset (not mutated).' },
        { name: 'enterDelayMs', type: 'number', description: 'Enter delay in ms.' },
        {
          name: 'leaveDelayMs',
          type: 'number',
          description: 'Leave delay in ms; defaults to enterDelayMs.',
          optional: true,
        },
      ],
      returns: { type: 'Preset', description: 'A new preset with delay inserted into the transition strings.' },
      example: `const delayed = withDelay(fadeUp, 150, 0)
// enterTransition: 'all 300ms 150ms ease-out'
// leaveTransition: 'all 200ms 0ms ease-in'`,
      seeAlso: ['withDuration', 'compose'],
    },
    {
      name: 'reverse',
      kind: 'function',
      signature: '(preset: Preset) => Preset',
      summary:
        'Swap the enter and leave phases of a preset — ALL fields are swapped, style-form (`enterStyle` ↔ `leaveStyle`, `enterToStyle` ↔ `leaveToStyle`, `enterTransition` ↔ `leaveTransition`) and class-form (`enter` ↔ `leave`, `enterFrom` ↔ `leaveFrom`, `enterTo` ↔ `leaveTo`) alike. A preset that entered from below now enters from where it used to leave to.',
      params: [{ name: 'preset', type: 'Preset', description: 'Source preset (not mutated).' }],
      returns: { type: 'Preset', description: 'A new preset with enter and leave phases exchanged.' },
      example: `const flipped = reverse(fadeUp)
// enterStyle:   { opacity: 1, transform: 'translateY(0)' }     (was leaveStyle)
// enterToStyle: { opacity: 0, transform: 'translateY(16px)' }  (was leaveToStyle)`,
      mistakes: [
        'Expecting the reversed enter to look like "the same animation backwards" — `reverse` swaps the phase FIELDS wholesale, so timing asymmetry swaps too (the 200ms leave transition becomes the enter transition)',
      ],
      seeAlso: ['compose'],
    },
    {
      name: 'Preset',
      kind: 'type',
      signature:
        'type Preset = { enterStyle?: CSSProperties; enterToStyle?: CSSProperties; enterTransition?: string; leaveStyle?: CSSProperties; leaveToStyle?: CSSProperties; leaveTransition?: string; enter?: string; enterFrom?: string; enterTo?: string; leave?: string; leaveFrom?: string; leaveTo?: string }',
      summary:
        'A preset is a plain object with up to 12 optional fields: six style-form (`enterStyle` / `enterToStyle` : `CSSProperties`, `enterTransition` : `string`, + leave siblings) and six class-form strings (`enter` / `enterFrom` / `enterTo` + leave siblings, Tailwind-friendly). Structurally identical to `@pyreon/kinetic`\'s own `Preset` type, so hand-written objects and factory results interoperate. Supporting option types are also exported: `Direction`, `FadeOptions`, `SlideOptions`, `ScaleOptions`, `RotateOptions`, `BlurOptions`, `CSSProperties`.',
      example: `import type { Preset } from '@pyreon/kinetic-presets'

const twPreset: Preset = {
  enter: 'transition-all duration-300 ease-out',
  enterFrom: 'opacity-0 translate-y-4',
  enterTo: 'opacity-100 translate-y-0',
  leave: 'transition-all duration-200 ease-in',
  leaveFrom: 'opacity-100 translate-y-0',
  leaveTo: 'opacity-0 -translate-y-2',
}`,
      seeAlso: ['presets', '@pyreon/kinetic'],
    },
  ],
  gotchas: [
    // First gotcha feeds the llms.txt teaser.
    'Tree-shaking is first-class: an internal #__NO_SIDE_EFFECTS__ annotation on the preset factory plus sideEffects: false means importing one named preset ships ~300 bytes — importing the `presets` map pins all 122.',
    {
      label: 'compose() transition strings are last-wins',
      note: 'Style objects shallow-merge (later preset wins per property) and class strings concatenate, but `enterTransition` / `leaveTransition` are REPLACED by the last preset that defines them — not comma-joined. The built-ins all use `all <duration> <easing>` shorthands, so the surviving transition still animates every merged property.',
    },
    {
      label: 'Timing utilities are style-form only',
      note: '`withDuration` / `withEasing` / `withDelay` rewrite the CSS transition STRINGS via regex — a class-form preset (Tailwind `duration-300` etc.) has no transition string to rewrite and passes through unchanged; edit the classes instead.',
    },
    {
      label: 'Framework-agnostic',
      note: 'Zero dependencies and no Pyreon coupling — presets are plain objects; any runtime that accepts the same field shape can consume them. Pairs with `@pyreon/kinetic`\'s `.preset(...)`.',
    },
  ],
})
