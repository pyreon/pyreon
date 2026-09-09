---
'@pyreon/kinetic': patch
---

Read every kinetic prop from its holder at the point of USE, not once at setup

`show={isOpen}` rendering permanently invisible was one member of a class, not
a one-off. The compiler emits ANY signal-bearing prop in member position as an
`_rp` thunk that `makeReactiveProps` installs as a getter on `props`; every
kinetic surface then destructured those getters, or copied them into a
`callbacks` / `transitionConfig` object, at component setup — one read each,
keeping the first value forever. Measured on the previous tree: a swapped
`onEnter` never fired while the handler captured at mount did, `enter={sig}`
applied the class the signal had already left behind, and `kinetic('div')`'s
`kineticProps` destructure froze all ten at once — in a function whose own
comment explains that the `splitProps` two lines above exists to keep those
getters alive.

Props that are consumed during an animation cycle — the four callbacks, the
class/style/transition config, `timeout`, Collapse's `transition`, `unmount`
(which `<Show>` consults on every hide) — are now read per use. Props that are
genuinely construction-time keep a plain read and say why at the site: `appear`
asks a first-mount question whose latch is spent once the ref wires up, and a
stagger `interval` is baked into an already-resolved child array's static style
objects.

Two things this turns up that are worth stating separately. Live must not mean
tracked: `watch` runs its callback inside the effect's tracking scope, so a
tracked config read subscribes the state machine to its own styling and an
easing change mid-flight restarts the animation instead of restyling it — the
reads are untracked, and `show` stays the one deliberately tracked prop.
And a JSX spread is a plain object spread wherever the Pyreon compiler does not
run, which includes the framework's own packages, so `<Transition {...rest}>`
in `<Stagger>` / `<TransitionGroup>` was value-copying the descriptors
`splitProps` had just preserved; both now use `mergeProps`.

`useAnimationEnd`'s `timeout` additionally accepts an accessor (`() => number`)
— additive, since the deadline is re-armed per cycle and a caller whose own
`timeout` prop is getter-backed has to be able to forward the read.
