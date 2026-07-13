import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — kinetic snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/kinetic — CSS-transition animations — kinetic(tag) chainable factory, 4 modes (transition/collapse/stagger/group), SSR-safe (peer: @pyreon/core, @pyreon/reactivity, @pyreon/runtime-dom). A transition whose \`show\` is false at server render still emits its children with the hidden-state class/style inlined (\`leaveTo\` if defined, else \`enterFrom\`) — content is structural, animation is visual (Framer Motion / react-transition-group norm). Load-bearing for SSG scroll-reveal where IntersectionObserver can't fire server-side. Trade-off: an INITIALLY-HIDDEN transition with \`unmount: true\` stays in the DOM (leave-to class applied) after a later leave; initially-visible transitions keep the true-unmount semantic."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/kinetic — CSS-Transition Animations

      CSS-transition animation engine for Pyreon. One factory — \`kinetic(tag)\` — produces a renderable, chainable component that animates an element as it enters and leaves the DOM. No JavaScript animation loop: kinetic applies your enter/leave classes or inline styles across a double-\`requestAnimationFrame\` and lets the browser's compositor interpolate, listening for \`transitionend\` / \`animationend\` (with a safety timeout) to know when it's done. Four modes: transition (single element enter/leave), collapse (height 0 ↔ auto), stagger (sequenced children), group (keyed-list enter/exit). Reduced motion is respected automatically; SSR always emits initially-hidden children with the hidden-state class inlined so scroll-reveal content reaches crawlers.

      \`\`\`typescript
      import { kinetic, fade, slideUp } from '@pyreon/kinetic'
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
      </Reveal>
      \`\`\`

      > **Peer deps**: @pyreon/core, @pyreon/reactivity, @pyreon/runtime-dom
      >
      > **SSR contract**: A transition whose \`show\` is false at server render still emits its children with the hidden-state class/style inlined (\`leaveTo\` if defined, else \`enterFrom\`) — content is structural, animation is visual (Framer Motion / react-transition-group norm). Load-bearing for SSG scroll-reveal where IntersectionObserver can't fire server-side. Trade-off: an INITIALLY-HIDDEN transition with \`unmount: true\` stays in the DOM (leave-to class applied) after a later leave; initially-visible transitions keep the true-unmount semantic.
      >
      > **Reduced motion**: \`prefers-reduced-motion: reduce\` is detected automatically — enter/leave skip the visual transition and jump to the final state, but lifecycle callbacks still fire so dependent logic stays correct. No configuration.
      >
      > **Children are snapshotted**: Transition/collapse/stagger renderers read children once at render time (animation state is built per item) — they do not observe later child-list changes. The compiler may wrap \`{children}\` in a deferred accessor; kinetic unwraps it internally (\`resolveChildren\`). For lists that change at runtime, use group mode with accessor children: \`{() => items().map((t) => <li key={t.id}>...</li>)}\`.
      >
      > **Reactive HTML attrs forward**: Non-kinetic props (\`class\`, \`style\`, \`id\`, event handlers) are forwarded to the rendered tag with reactivity preserved — the prop split uses descriptor-copying \`splitProps\`/\`mergeProps\`, so signal-driven attrs like \`class={sig()}\` keep updating (a plain \`{...props}\` value-copy would freeze them).
      >
      > **Compositor-thread animations**: Only \`transform\` / \`opacity\` / \`filter\` animate on the GPU compositor thread. Animating \`width\` / \`height\` / \`top\` / \`left\` runs on the main thread and may jank — use collapse mode for height animation.
      >
      > **CSS-transition scope (not a JS animation engine)**: kinetic offloads the tween to CSS/the compositor — it does NOT run a JS animation loop. It cannot do spring physics, interruptible / retargetable value animation, layout / shared-element (FLIP) animations, or gestures / drag; reach for Motion One or Framer Motion for those. What kinetic owns: declarative, SSR-safe, reactive-prop enter/leave/collapse/stagger with zero per-frame JS. Its framework JS overhead to reveal a list is competitive with Motion One (within ~1.5×, winning small-enter, tying elsewhere — see \`bench/\`), both a small constant over hand-rolled CSS.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(9)
    expect(record['kinetic/kinetic']!.notes).toContain('chainable')
    expect(record['kinetic/kinetic']!.mistakes?.split('\n').length).toBe(12)
    expect(record['kinetic/useTransitionState']!.notes).toContain('state machine')
    expect(record['kinetic/useAnimationEnd']!.notes).toContain('transitionend')
  })
})
