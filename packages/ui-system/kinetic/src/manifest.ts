import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/kinetic',
  title: 'CSS-Transition Animations',
  tagline:
    'CSS-transition animations — kinetic(tag) chainable factory, 4 modes (transition/collapse/stagger/group), SSR-safe',
  description:
    'CSS-transition animation engine for Pyreon. One factory — `kinetic(tag)` — produces a renderable, chainable component that animates an element as it enters and leaves the DOM. No JavaScript animation loop: kinetic applies your enter/leave classes or inline styles across a double-`requestAnimationFrame` and lets the browser\'s compositor interpolate, listening for `transitionend` / `animationend` (with a safety timeout) to know when it\'s done. Four modes: transition (single element enter/leave), collapse (height 0 ↔ auto), stagger (sequenced children), group (keyed-list enter/exit). Reduced motion is respected automatically; SSR always emits initially-hidden children with the hidden-state class inlined so scroll-reveal content reaches crawlers.',
  category: 'browser',
  peerDeps: ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-dom'],
  longExample: `import { kinetic, fade, slideUp } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'

// Define once at module scope — chaining is IMMUTABLE (every method
// returns a new component), so each definition is reusable.
const FadeBox = kinetic('div').preset(fade)          // transition mode (default)
const Accordion = kinetic('div').collapse()          // collapse mode (height 0 <-> auto)
const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 75 })
const AnimatedList = kinetic('ul').preset(fade).group() // keyed-list mode — no show prop

// Inline style-based config (zero-CSS path):
const SlidePanel = kinetic('aside')
  .enter({ opacity: 0, transform: 'translateX(-100%)' })
  .enterTo({ opacity: 1, transform: 'translateX(0)' })
  .enterTransition('all 300ms ease-out')
  .leave({ opacity: 1, transform: 'translateX(0)' })
  .leaveTo({ opacity: 0, transform: 'translateX(-100%)' })
  .leaveTransition('all 200ms ease-in')

// Class-based config (Tailwind / CSS modules):
const TailwindFade = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })

function App() {
  const visible = signal(true)
  const items = signal([{ id: 1, text: 'One' }, { id: 2, text: 'Two' }])
  return (
    <div>
      {/* show is a REACTIVE ACCESSOR, not a boolean */}
      <FadeBox show={() => visible()} onAfterEnter={() => console.warn('entered')}>
        <p>Fading content</p>
      </FadeBox>
      <Accordion show={() => visible()} transition="height 400ms ease-in-out">
        <p>Collapsible content</p>
      </Accordion>
      {/* Group mode: keyed children via an accessor — additions animate in,
          removals animate out then unmount */}
      <AnimatedList>
        {() => items().map((t) => <li key={t.id}>{t.text}</li>)}
      </AnimatedList>
    </div>
  )
}

// SSR / SSG scroll-reveal: show is false at server render (no
// IntersectionObserver on the server), yet children ARE emitted with
// the hidden-state class/style inlined — content stays indexable.
const Reveal = kinetic('section').preset(slideUp)
;<Reveal show={() => revealed()}>
  <h2>Indexable heading</h2>
</Reveal>`,
  features: [
    'kinetic(tag) factory — renderable component + immutable chain in one value',
    'Four modes: transition (default), collapse (.collapse()), stagger (.stagger()), group (.group())',
    'Style-based (.enter/.enterTo/.enterTransition + leave siblings) and class-based (.enterClass/.leaveClass) config',
    '.preset(p) merges a Preset object — 6 built-ins here, 122 more in @pyreon/kinetic-presets',
    'Lifecycle callbacks via .on() or props: onEnter / onAfterEnter / onLeave / onAfterLeave',
    'prefers-reduced-motion respected automatically — visuals skipped, callbacks still fire',
    'SSR contract: initially-hidden content always emitted with hidden-state class inlined (SSG scroll-reveal safe)',
    'Low-level hooks exported: useTransitionState (state machine) + useAnimationEnd (end listener + timeout)',
    'Stagger sets per-child `--stagger-index` / `--stagger-interval` CSS custom props (drive your own CSS-based timing) + a `transition-delay` preserved across the CSS transition-shorthand reset',
  ],
  api: [
    {
      name: 'kinetic',
      kind: 'function',
      signature: "<Tag extends string>(tag: Tag) => KineticComponent<Tag, 'transition'>",
      summary:
        'Create a renderable, chainable animated component in transition mode. Every chain method returns a NEW component (immutable) — define once at module scope and reuse. Style methods (`.enter`/`.enterTo`/`.enterTransition` + `leave` siblings) set inline-style phases; `.enterClass`/`.leaveClass({ active, from, to })` set class phases (Tailwind-friendly); `.preset(p)` spreads a `Preset`\'s fields; `.on(callbacks)` attaches lifecycle callbacks; `.config(opts)` sets mode-scoped options. Mode switches: `.collapse(opts?)` (height 0 ↔ auto, measures `scrollHeight`), `.stagger({ interval?, reverseLeave? })` (sequenced children), `.group()` (keyed-list enter/exit, no `show` prop). Rendered props: `show: () => boolean` (reactive accessor; not in group mode), `appear` (default false), `timeout` (default 5000ms), mode extras (`unmount` transition-only default true, `transition` collapse-only default "height 300ms ease", `interval` stagger-only default 50, `reverseLeave` stagger-only), the four callbacks, plus any HTML attr — forwarded to the rendered tag with reactivity preserved.',
      params: [
        {
          name: 'tag',
          type: 'Tag extends string',
          description: "HTML tag rendered as the container ('div', 'ul', 'section', ...).",
        },
      ],
      returns: {
        type: "KineticComponent<Tag, 'transition'>",
        description:
          'A component that is both JSX-renderable and a chain object; chain methods return new components.',
      },
      example: `const FadeBox = kinetic('div').preset(fade)                     // transition
const Accordion = kinetic('div').collapse({ transition: 'height 400ms ease-in-out' })
const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 80, reverseLeave: true })
const AnimatedList = kinetic('ul').preset(fade).group()          // keyed list

<FadeBox show={() => visible()} onAfterLeave={() => console.warn('gone')}>
  <p>Content</p>
</FadeBox>

// Group mode — keyed children via accessor, no show prop:
<AnimatedList>{() => todos().map((t) => <li key={t.id}>{t.text}</li>)}</AnimatedList>`,
      mistakes: [
        'Passing `show={visible()}` (a static boolean) — `show` is a reactive accessor `() => boolean`; kinetic subscribes to it and runs enter/leave on flips. Write `show={() => visible()}`',
        "Building `kinetic('div').preset(...)` inside a render body — chaining is immutable and re-creates the component on every call; define animated components once at module scope",
        'Passing a `show` prop in group mode — group has NO `show`; visibility is driven by which keys are present in the children',
        'Group-mode children without a unique `key` — the enter/exit diff is keyed; children without a key are skipped (no animation)',
        'Passing a plain snapshot `{todos().map(...)}` to a group and expecting later additions to animate — pass a reactive accessor `{() => todos().map(...)}` so the group re-evaluates and diffs keys on data change',
        'Using stagger mode for a list whose entries are added/removed at runtime — stagger snapshots its children once at render; use group mode for runtime add/remove',
        'Setting `unmount` outside transition mode — it is a transition-mode option only; collapse keeps content in the DOM and animates height, stagger/group manage per-child lifecycle',
        'Expecting `.config()` to accept every option in every mode — it takes only the current mode\'s set: `{ appear, unmount, timeout }` (transition), `{ appear, timeout, transition }` (collapse), `{ appear, timeout, interval, reverseLeave }` (stagger), `{ appear, timeout }` (group)',
        'Treating stagger `interval` as a total duration — it is the per-CHILD delay: five children at 75ms = 375ms stagger window',
        'Animating `width` / `height` / `top` / `left` in a preset — those run on the main thread and can jank; animate `transform` / `opacity` / `filter` for compositor-thread work, and use collapse mode for height',
        'Expecting an INITIALLY-HIDDEN transition with `unmount: true` to be removed from the DOM after a later leave — the SSR-structural contract keeps it in the DOM with the leave-to class applied; initially-visible transitions keep the true-unmount semantic (drive mount/unmount yourself if you need removal)',
        'Relying on the animation completing under `prefers-reduced-motion: reduce` — visuals are skipped instantly but callbacks (`onEnter` → `onAfterEnter`, `onLeave` → `onAfterLeave`) still fire; drive dependent logic from callbacks, not timing',
      ],
      seeAlso: ['KineticComponent', 'presets', 'useTransitionState', '@pyreon/kinetic-presets'],
    },
    {
      name: 'presets',
      kind: 'constant',
      signature:
        "Record<'fade' | 'scaleIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight', Preset>",
      summary:
        'The six built-in presets as one map — `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight` — each also available as a named export. All are style-form presets (opacity/transform with 300ms ease-out enter, 200ms ease-in leave). Pass one to `.preset(...)`. For the full 122-preset catalog plus factories and composition utilities, use `@pyreon/kinetic-presets`.',
      example: `import { kinetic, fade, presets } from '@pyreon/kinetic'

const FadeBox = kinetic('div').preset(fade)
const SlideBox = kinetic('div').preset(presets.slideUp)   // map access for dynamic selection`,
      mistakes: [
        'Looking for `fadeUp` / `bounceIn` / `zoomIn` etc. here — the core package ships only 6 presets; the 122-preset catalog is `@pyreon/kinetic-presets`',
      ],
      seeAlso: ['kinetic', 'Preset', '@pyreon/kinetic-presets'],
    },
    {
      name: 'useTransitionState',
      kind: 'hook',
      signature: '(options: { show: () => boolean; appear?: boolean }) => TransitionStateResult',
      summary:
        'Low-level enter/leave state machine that powers the transition renderer — exported for building custom animated primitives. Returns `stage` (a `Signal<TransitionStage>`: `hidden | entering | entered | leaving`), a `ref` callback to attach to the transitioning element (it triggers the `appear` animation once wired), a reactive `shouldMount()` accessor (false only while `hidden`), and `complete()` which advances `entering → entered` / `leaving → hidden`. Its signature type is exported as `UseTransitionState`.',
      params: [
        {
          name: 'options',
          type: '{ show: () => boolean; appear?: boolean }',
          description:
            'Reactive visibility accessor plus `appear` (default false) to run the enter animation on initial mount.',
        },
      ],
      returns: {
        type: 'TransitionStateResult',
        description: '`{ stage, ref, shouldMount, complete }` — see the TransitionStateResult type.',
      },
      example: `const { stage, ref, shouldMount, complete } = useTransitionState({
  show: () => visible(),
  appear: true,
})
// stage()       -> 'hidden' | 'entering' | 'entered' | 'leaving'
// shouldMount() -> false only while 'hidden'
useAnimationEnd({ ref: elementRef, active: () => stage() === 'entering' || stage() === 'leaving', onEnd: complete })`,
      mistakes: [
        'Never calling `complete()` — the stage stays `entering`/`leaving` forever; wire `useAnimationEnd`\'s `onEnd` (or your own end detection) to `complete`',
        'Not attaching the returned `ref` to the element — `appear` is triggered by the ref callback once the node is wired; without it the appear animation never fires',
        'Reading `shouldMount()` outside a reactive scope — it is an accessor; read it inside JSX expression thunks / effects to track stage changes',
      ],
      seeAlso: ['useAnimationEnd', 'TransitionStage', 'TransitionStateResult'],
    },
    {
      name: 'useAnimationEnd',
      kind: 'hook',
      signature:
        '(options: { ref: Ref<HTMLElement>; onEnd: () => void; active: () => boolean; timeout?: number }) => void',
      summary:
        'Listens for `transitionend` / `animationend` on `ref.current` while `active()` is true and calls `onEnd` exactly once when the animation finishes — or after `timeout` ms (default 5000) as a safety fallback if the event never fires. Events bubbling from child elements are ignored (`e.target` must be the element itself). Listeners attach when `active` flips true and are cleaned up when it flips false. Its signature type is exported as `UseAnimationEnd`.',
      params: [
        {
          name: 'options',
          type: '{ ref: Ref<HTMLElement>; onEnd: () => void; active: () => boolean; timeout?: number }',
          description:
            'Element ref object, one-shot end callback, reactive listen-gate accessor, and safety timeout in ms (default 5000).',
        },
      ],
      returns: { type: 'void', description: 'Registers reactive listeners; nothing to consume.' },
      example: `useAnimationEnd({
  ref: elementRef,                     // Ref<HTMLElement> object, read via .current
  active: () => stage() === 'entering' || stage() === 'leaving',
  timeout: 5000,
  onEnd: () => complete(),
})`,
      mistakes: [
        'Passing a callback ref — the option is a `Ref<HTMLElement>` OBJECT; the hook reads `ref.current` when `active` flips true',
        'Setting `timeout` shorter than the actual transition duration — the fallback timer calls `onEnd` early, before the animation finishes',
        'Expecting `onEnd` for a child element\'s transition — bubbled events where `e.target !== el` are deliberately ignored',
        'Passing a static boolean for `active` — it is a reactive accessor; the listeners attach/detach as it flips',
      ],
      seeAlso: ['useTransitionState'],
    },
    {
      name: 'KineticComponent',
      kind: 'type',
      signature:
        "type KineticComponent<Tag extends string, Mode extends KineticMode = 'transition'> = ComponentFn<KineticComponentProps<Tag, Mode>> & KineticChain<Tag, Mode>",
      summary:
        'The value `kinetic(tag)` returns — a renderable component intersected with the chain methods. The `Mode` parameter switches the accepted prop set (`show`/`unmount` in transition, `transition` in collapse, `interval`/`reverseLeave` in stagger, no `show` in group) and narrows what `.config(opts)` accepts.',
      example: `import type { KineticComponent } from '@pyreon/kinetic'

const FadeBox: KineticComponent<'div', 'transition'> = kinetic('div').preset(fade)
const List: KineticComponent<'ul', 'group'> = kinetic('ul').preset(fade).group()`,
      mistakes: [
        "Annotating a `.collapse()` / `.stagger()` / `.group()` result with the default `'transition'` mode parameter — mode switches change the type: `kinetic('ul').group()` is `KineticComponent<'ul', 'group'>`",
      ],
      seeAlso: ['kinetic'],
    },
    {
      name: 'Preset',
      kind: 'type',
      signature: 'type Preset = StyleTransitionProps & ClassTransitionProps',
      summary:
        'A plain object holding the style-form fields (`enterStyle`/`enterToStyle`/`enterTransition` + leave siblings) and/or the class-form fields (`enter`/`enterFrom`/`enterTo` + leave siblings) that `.preset(...)` spreads into the chain config. Structurally identical to the `Preset` type in `@pyreon/kinetic-presets`, so factory results from that package pass straight to `.preset(...)`.',
      example: `import type { Preset } from '@pyreon/kinetic'

const myPreset: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(20px)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0)' },
  enterTransition: 'all 400ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateY(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(20px)' },
  leaveTransition: 'all 250ms ease-in',
}
const Box = kinetic('div').preset(myPreset)`,
      seeAlso: ['StyleTransitionProps', 'ClassTransitionProps', '@pyreon/kinetic-presets'],
    },
    {
      name: 'StyleTransitionProps',
      kind: 'type',
      signature:
        'type StyleTransitionProps = { enterStyle?: CSSProperties; enterToStyle?: CSSProperties; enterTransition?: string; leaveStyle?: CSSProperties; leaveToStyle?: CSSProperties; leaveTransition?: string }',
      summary:
        'Style-form transition definition (the zero-CSS path). `enterStyle` applies on the first frame of enter, `enterToStyle` on the second frame (kept until complete), `enterTransition` is the CSS transition shorthand active during enter; the `leave*` trio mirrors it. Set via `.enter()` / `.enterTo()` / `.enterTransition()` and the leave siblings.',
      example: `const SlidePanel = kinetic('aside')
  .enter({ opacity: 0, transform: 'translateX(-100%)' })   // enterStyle
  .enterTo({ opacity: 1, transform: 'translateX(0)' })     // enterToStyle
  .enterTransition('all 300ms ease-out')`,
      seeAlso: ['ClassTransitionProps', 'Preset'],
    },
    {
      name: 'ClassTransitionProps',
      kind: 'type',
      signature:
        'type ClassTransitionProps = { enter?: string; enterFrom?: string; enterTo?: string; leave?: string; leaveFrom?: string; leaveTo?: string }',
      summary:
        'Class-form transition definition for utility-class CSS (Tailwind, CSS modules). `enter` stays on the element for the whole enter phase, `enterFrom` applies on the first frame and is removed on the next, `enterTo` applies on the second frame and is kept until complete; the `leave*` trio mirrors it. Set via `.enterClass({ active, from, to })` / `.leaveClass(...)` — `active` maps to `enter`/`leave`, `from` to `enterFrom`/`leaveFrom`, `to` to `enterTo`/`leaveTo`. The SSR hidden-state class is `leaveTo` when defined, else `enterFrom`.',
      example: `const TailwindFade = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })`,
      seeAlso: ['StyleTransitionProps', 'Preset'],
    },
    {
      name: 'TransitionCallbacks',
      kind: 'type',
      signature:
        'type TransitionCallbacks = { onEnter?: () => void; onAfterEnter?: () => void; onLeave?: () => void; onAfterLeave?: () => void }',
      summary:
        'Lifecycle callbacks — attach via `.on(callbacks)` on the chain or pass as props on the rendered component (props override the chain\'s). `onEnter` fires when the enter phase begins, `onAfterEnter` when the enter animation completes, `onLeave` / `onAfterLeave` mirror for leave. Under reduced motion the pairs fire back-to-back with no visual animation.',
      example: `const Notice = kinetic('div').preset(fade).on({
  onEnter: () => console.warn('entering'),
  onAfterLeave: () => console.warn('left'),
})`,
      seeAlso: ['kinetic'],
    },
  ],
  gotchas: [
    // First gotcha feeds the llms.txt one-liner teaser — the SSR
    // contract is the most distinctive user-facing behavior.
    {
      label: 'SSR contract',
      note: 'A transition whose `show` is false at server render still emits its children with the hidden-state class/style inlined (`leaveTo` if defined, else `enterFrom`) — content is structural, animation is visual (Framer Motion / react-transition-group norm). Load-bearing for SSG scroll-reveal where IntersectionObserver can\'t fire server-side. Trade-off: an INITIALLY-HIDDEN transition with `unmount: true` stays in the DOM (leave-to class applied) after a later leave; initially-visible transitions keep the true-unmount semantic.',
    },
    {
      label: 'Reduced motion',
      note: '`prefers-reduced-motion: reduce` is detected automatically — enter/leave skip the visual transition and jump to the final state, but lifecycle callbacks still fire so dependent logic stays correct. No configuration.',
    },
    {
      label: 'Children are snapshotted',
      note: 'Transition/collapse/stagger renderers read children once at render time (animation state is built per item) — they do not observe later child-list changes. The compiler may wrap `{children}` in a deferred accessor; kinetic unwraps it internally (`resolveChildren`). For lists that change at runtime, use group mode with accessor children: `{() => items().map((t) => <li key={t.id}>...</li>)}`.',
    },
    {
      label: 'Reactive HTML attrs forward',
      note: 'Non-kinetic props (`class`, `style`, `id`, event handlers) are forwarded to the rendered tag with reactivity preserved — the prop split uses descriptor-copying `splitProps`/`mergeProps`, so signal-driven attrs like `class={sig()}` keep updating (a plain `{...props}` value-copy would freeze them).',
    },
    {
      label: 'Compositor-thread animations',
      note: 'Only `transform` / `opacity` / `filter` animate on the GPU compositor thread. Animating `width` / `height` / `top` / `left` runs on the main thread and may jank — use collapse mode for height animation.',
    },
    {
      label: 'CSS-transition scope (not a JS animation engine)',
      note: 'kinetic offloads the tween to CSS/the compositor — it does NOT run a JS animation loop. It cannot do spring physics, interruptible / retargetable value animation, layout / shared-element (FLIP) animations, or gestures / drag; reach for Motion One or Framer Motion for those. What kinetic owns: declarative, SSR-safe, reactive-prop enter/leave/collapse/stagger with zero per-frame JS. Its framework JS overhead to reveal a list is competitive with Motion One (within ~1.5×, winning small-enter, tying elsewhere — see `bench/`), both a small constant over hand-rolled CSS.',
    },
  ],
})
