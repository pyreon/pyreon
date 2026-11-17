// @ts-nocheck — bare signal reads (`count + 1`) are compiler sugar TypeScript types as the signal.
// pyreon-lint-disable-file pyreon/consistent-signal-read -- this fixture exercises the bare-read auto-call on purpose
/* oxlint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- the click targets are the element paths under test (childless, spread-carrying), driven by .click() */
/**
 * Compiled by the REAL Pyreon transform (see `../compiled-fixtures-plugin.ts`) for
 * `compiled-reads.browser.test.tsx`.
 */
import { signal, type Signal } from '@pyreon/reactivity'

// ── A prop-derived const that mints state (the documented <Example> counters) ──

/** `docs/src/content/docs/live-examples.md`. */
export function Counter(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <div class="counter">
      <button onClick={() => count.update((n) => n + 1)}>+</button>
      <span>{count()}</span>
    </div>
  )
}

/** `docs/src/content/docs/zero-content.md`. */
export function CounterButton(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <button class="counter-button" onClick={() => count.update((n) => n + 1)}>
      bump (now {() => count()})
    </button>
  )
}

// ── A pure prop-derived const stays live on every element path ──

function Btn(props: { onClick: () => void; class: string }) {
  return <button class={props.class} onClick={props.onClick}>b</button>
}

function Box(props: { children: unknown }) {
  return <p class="box">{props.children}</p>
}

export function LabelPaths(props: { label: string; seen: string[] }) {
  const label = props.label
  return (
    <div>
      <span class="label" title={label}>{label}</span>
      <Btn class="label-btn" onClick={() => props.seen.push(label)} />
      <em class="label-bare" onClick={() => props.seen.push(label)} />
      <Box>{() => label + '!'}</Box>
    </div>
  )
}

// ── #4536: a bare signal inside a function nested in JSX is read on every path ──

export const nestedCount = signal(0)
const rest = { id: 'spread' }

export function NestedComponent() {
  return <Btn class="cmp" onClick={() => nestedCount.set(nestedCount + 1)} />
}

export function NestedChildless() {
  return <i class="childless" onClick={() => nestedCount.set(nestedCount + 1)} />
}

export function NestedSpread() {
  return <b class="spread" {...rest} onClick={() => nestedCount.set(nestedCount + 1)}>s</b>
}

export function NestedFunctionChild() {
  return <Box>{() => nestedCount + 1}</Box>
}
