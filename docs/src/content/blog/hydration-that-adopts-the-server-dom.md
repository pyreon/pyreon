---
title: "Type before the page hydrates. Pyreon keeps every character"
description: "Hydration that rebuilds the DOM wipes what your users typed, their focus and their caret. Pyreon adopts the server’s nodes instead, and still hydrated a 320-component page faster than React, Preact and Vue in our benchmark. How it works and how we prove it."
date: 2026-12-07
slug: hydration-that-adopts-the-server-dom
tags: [javascript, ssr, webdev, performance]
cover: /blog/covers/hydration-that-adopts-the-server-dom.png
---

You're on a slow train. A server-rendered page shows up, you tap the search box and type three letters. Then the JavaScript lands, the page hydrates, and your three letters are gone. So is the cursor. The page looks exactly the same, which is what makes the bug so sneaky: hydration swapped every node for a fresh, identical-looking copy.

Pyreon did this to its users until August 2026. Today it keeps the server's nodes: your text, your focus, your scroll position and any listener another script attached early all survive the boot. And it is quick: on a 320-component app page, Pyreon hydrates in **4.02 ms, ahead of React (4.15), Preact (4.30) and Vue (4.47)**, with all four adopting every server node (one run).

*Synthetic, author-run, Apple M3 Max, real Chromium. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

Here is how adoption works, the gate that keeps it safe, and how we hunt the bugs.

## Why a template-cloning framework rebuilds by accident

Pyreon's compiler turns JSX made of DOM elements into a cached HTML template plus a small bind function. This is the real output of `transformJSX` for a greeting:

```tsx
export function Greeting(props) {
  return <p>Hello, {props.name}!</p>
}
```

```js
import { _fuse } from "@pyreon/core";
import { _tpl, bindPolymorphicText } from "@pyreon/runtime-dom";
export function Greeting(props) {
  return _tpl("<p> </p>", (__root) => {
    const __t0 = __root.firstChild;
    const __d0 = bindPolymorphicText(() => (_fuse("Hello, ", props.name, "!")), __t0, __root);
    return __d0
  })
}
```

On a client-only mount, `_tpl` clones the parsed template and runs the bind function against the clone. That path is fast, and it is a big reason the row-list board is competitive.

During hydration, the right DOM is already on the page. The tempting shortcut is to clone anyway, bind the clone and swap it in, because the markup comes out identical. Pyreon took that shortcut, and PR #2918 (merged 18 August 2026) named the problem in one line: **"identity is the entire product of hydration."**

The markup is the same. The node objects are not. Typed text in an uncontrolled field, `document.activeElement`, `scrollTop`, listeners added by code that isn't Pyreon's: all of it lives on the node object, and all of it dies when you replace that object.

The retention probe in that PR compiled with the real `transformJSX` and hydrated over real `renderToString` output:

| shape | server nodes kept, before | after |
| --- | ---: | ---: |
| leaf element | 0/2 | 2/2 |
| nested tree (3 levels) | 0/4 | 4/4 |
| `<For>` list | 10/10 | 10/10 |
| component-wrapped | 2/4 | 2/4 |

`<For>` already adopted, because its row path was the only one that told `_tpl` to bind against an existing node. Everything else that compiled to a template was rebuilt. (The component-wrapped shape kept its outer elements only because, at the time, a component child pushed them onto the slower `h()` path. Mount holes, below, brought that shape onto templates too.)

React 19, Preact and Vue 3 all adopt 100% of the server's nodes on our hydration benchmarks. The trap is specific to template cloning: cloning is the fast path, so it is the path you reach for, and it quietly hands you new nodes.

## How adoption works

Three kinds of server DOM, three mechanisms.

### Compiled templates bind to the server's element

When the hydration walk reaches a compiled template, it hands the template the server node sitting at that exact cursor. If that node passes verification (next section), the bind function runs against the server's element and no clone is made. `hydrateChild` then sees that the element it would insert is the one already in the document and leaves it alone. That last detail matters: replacing a node with itself still detaches and reattaches it, and that alone drops focus.

During hydration, a template's build is **deferred**. The template waits until the walk meets its real cursor, then adopts right there. Every compiled region inside a component therefore adopts at its own position, instead of the first template to run grabbing whatever node was armed.

### The skeleton gate: adoption can never produce wrong DOM

Position alone is not proof. Before a template binds to a server element, the runtime checks that the template's static skeleton matches it: same tags in the same order, same static attributes with the same values, same static text. Dynamic attributes are not in the template at all (the bind function sets them), so attributes are checked as a subset.

This gate exists because we reproduced the failure it prevents: a `<div class="other">` came back from hydration as `<div class="root">OTHERVAL<!--/$--></div>`, a child template having claimed its parent's server node. The gate lives in `matchDomAgainstTemplate` in `packages/core/runtime-dom/src/hydration-plan.ts`:

```ts
// STATIC-SKELETON GATE. Adoption is only sound when the template's static
// skeleton is byte-equal to the target's, because the one-shot slot is
// consumed by whichever `_tpl` runs FIRST inside the armed window — which
// for an h()-rooted component is an inner template, not the root. Under
// this gate a "wrong" consumer can only ever adopt a node byte-identical
// to the one it would have cloned, so mis-consumption is harmless: it
// costs an adoption, never correctness. Dynamic props are bound by the
// compiled `bind` and are absent from the template, hence SUBSET.
const wantAttrs = expected.attrs[at] as [string, string][]
for (let i = 0; i < wantAttrs.length; i++) {
  const pair = wantAttrs[i] as [string, string]
  if (el.getAttribute(pair[0]) !== pair[1]) return false
}
```

Read the guarantee in that comment again: the worst a wrong claimant can do is adopt a node byte-identical to the one it would have built. A failed match costs one adoption and falls back to clone-and-swap. It never costs correctness.

### Reactive ranges adopt when client and server agree

A reactive child (`{() => open() ? <A /> : <B />}`, a `<Show>` branch, anything that can render zero, one or many nodes) has an extent the client can't know in advance. The server wraps it in comment markers, `<!--$-->…<!--/$-->`.

The client renders the accessor's first value and compares it with that range. Agreement means the existing nodes are adopted. Disagreement (the accessor reads client-only state, say) means the range is discarded and rebuilt. The client's first render stays the source of truth; adoption only fires when the two sides agree. When an accessor is the only child of its element, the element's own tags delimit it, the server skips the markers, and adoption works the same way.

### Mount holes: declared, never inferred

With `@pyreon/vite-plugin` (the `templatizeComponentChildren` option, on by default since 0.52), an element whose trailing children are components becomes a template plus a declared hole. Here is the real compiler output:

```tsx
<section><h2>Title</h2><Card /><Card /></section>
```

```js
_tpl("<section data-pyreon-hole><h2>Title</h2></section>", (__root) => {
  const __d0 = _mountChild(<Card />, __root, null);
  const __d1 = _mountChild(<Card />, __root, null);
  return () => { __d0(); __d1() }
})
```

The `data-pyreon-hole` attribute is stripped once, when the template is parsed, so it never reaches your DOM. During hydration the verifier matches the template's own children, skips the hole, and the cards hydrate into the server's range instead of mounting fresh copies.

"Declared, never inferred" carries weight. Other helpers also fill empty template elements (`_setChild`, a spread `innerHTML`) and they don't hydrate, so a verifier that tolerated any extra children would duplicate their content.

### Sweeping what nobody claimed

`hydrateRoot` promises that everything on screen when it returns is live. Picture a warm server cache and a cold client: the server rendered rows, the client's first render says "Loading…". Adopt the matching part, leave the rest, and the user sees both, with dead rows that have no handlers. So every range snapshots its server nodes before the walk and removes the ones its first render did not claim, and `hydrateElement` sweeps from the cursor to the end of each element.

> **Hydration should be invisible. If your user notices it, it cost them their work.**

## How we hunt hydration bugs

Hydration bugs are almost always cursor or extent errors: something walks one node too far or stops one node short. Hand-written examples rarely find those, so most of the coverage is generated.

- **Two parity fuzzers.** One builds trees with `h()`. The other compiles one seeded source through `transformJSX` for both the server and the client emit and hydrates one over the other. Every seed must produce zero mismatches, DOM identical to a fresh client mount, identical DOM after identical state flips, and a reused root node.
- **Real Chromium.** happy-dom is not a browser, so mount-hole adoption, typed input and focus survival run as `*.browser.test.tsx` specs in Chromium.
- **Bisect-verified regression tests.** For #2918, removing the arming made the retention specs fail with `expected <input> to be <input> // Object.is equality` (typed input wiped). Removing the skeleton gate made the theft spec fail with `expected 'root' to be 'other'`.

The fuzzers have blind spots, and one of them taught us something. In October, `<First />{' '}<span />` hydrated with a doubled space (#3836). The server emits an explicit `{' '}` as the same bytes as formatting whitespace, which the cursor skips; the DOM can't tell them apart, only a parallel walk of the client tree can. Neither fuzzer caught it, because the fuzz grammar's text pool held no whitespace-only strings.

The fix added a look-back that adopts the skipped node. The lesson went into the grammar: a differential fuzzer is only as strong as its input alphabet, so `' '`, `'\n'`, `'\t'` and `''` are now in every text pool.

## What your users feel

When server and client agree, which is the normal case:

- text typed into an uncontrolled input before the bundle loaded is still there;
- focus stays where it was;
- scroll position inside adopted regions is preserved;
- listeners attached by non-Pyreon scripts before hydration keep working.

Routing gets the same treatment. A route component loaded with `lazy()` whose chunk hasn't arrived yet now waits for the chunk and hydrates its server range in place, instead of rendering nothing and discarding it (#3731). And `@pyreon/zero`'s `startClient` resolves the current route's code before calling `hydrateRoot`, so the first client render is the real page, not a loading fallback. While that resolves (normally straight from the `modulepreload` cache), the server's DOM stays on screen, untouched.

> **Your users typed it. Pyreon keeps it.**

## The numbers

Hydration is measured from SSR HTML to interactive, in real Chromium, on a production build, on an Apple M3 Max. Synthetic and author-run; the full method is on the [benchmarks page](/docs/benchmarks).

**App page:** 320 statically composed components, 2,206 DOM nodes. All four frameworks adopt all 2,206 nodes. One run.

| framework | hydrate (ms) | vs Pyreon |
| --- | ---: | ---: |
| **Pyreon** | **4.02** | |
| React 19 | 4.15 | 1.03× |
| Preact | 4.30 | 1.07× |
| Vue 3 | 4.47 | 1.11× |

Pyreon is fastest here. It is one run, and the record labels it exactly that way.

**Keyed table:** 1,000 rows. Every framework adopts 1,000 of 1,000 server rows. Two runs:

| framework | total, run 1 / run 2 (ms) | walk, run 1 / run 2 (ms) |
| --- | ---: | ---: |
| Vue 3 | 6.02 / 5.99 | 1.17 / 1.16 |
| **Pyreon** | 6.07 / 6.04 | 1.16 / 1.19 |
| React 19 | 6.52 / 6.53 | 1.69 / 1.69 |
| Preact | 8.56 / 8.53 | 3.47 / 3.55 |

*Synthetic, author-run, Apple M3 Max, real Chromium. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

"Total" includes the forced layout flush at the end of the timed region, about 80% of every framework's total and the same shape for all of them. "Walk" is the framework's own work. On the walk, Pyreon and Vue tie in both runs.

## Where Vue edges ahead

On the keyed-table total, Vue has the faster median in both runs. Run 1 is a tie: the intervals overlap. In run 2 they separate by 0.01 ms, Vue 5.99 ms [5.98–6.01] against Pyreon 6.04 [6.02–6.06], so Vue is 1.01× ahead.

No application will feel 0.05 ms. It still isn't a win for us, so we publish it as Vue marginally ahead. That's the deal with our numbers: we publish where we lose, so you can trust where we win.

Part of the gap is a modelling choice. Pyreon's idiomatic row holds a per-row signal so one row can update without touching the list; Vue's arm uses plain objects. Building that per-row state costs Pyreon about 100 µs of the walk. We keep it, because that is how you would write the component, and a benchmark arm nobody would ship proves nothing.

We also tested a lever that looked promising: skip skeleton verification for templates with no dynamic holes. Those templates turned out to be 0.0% of template instances on the app-page benchmark and 0.6% on a docs page, because data-free subtrees rarely repeat. Counting call sites instead of instances had overstated that shape 30–50×. The idea stays on the shelf, and the gate stays on.

## What's still open

- **Fallback is silent.** When a skeleton doesn't match, hydration takes the clone-and-swap path. The page still works, but that subtree loses its retained state, and no dev-mode report yet lists which templates fell back on a page. Real mismatches do warn in development, and `onHydrationMismatch(handler)` from `@pyreon/runtime-dom` forwards them to your error tracker in production too.
- **Mount holes cover one shape.** Component children join a template only in the trailing arrangement (elements first, then components). Interleave them, `<section><Card /><h2>Title</h2><Card /></section>`, and the element compiles to `h()` with the `<h2>` as its own small template. It still adopts; it takes the interpretive walk instead of the template path.
- **Two properties diverge on purpose.** The form-reset default of `<select>` and media `muted` behave differently between a client-mounted and a hydrated element, as they do in React, Preact and Solid. Portals always remount into their target.
- **Not measured yet:** streaming SSR hydration, Firefox and Safari, and your app. Both benchmarks are synthetic.
- **Pyreon is pre-1.0.** The hydration contract here is current as of 0.53, and these internals moved several times this year.

Found a page that loses state on hydration? The most useful bug report is the server HTML, the component, and whether the client's first render can differ from the server's (client-only state, `Date.now()`, `localStorage`). Mismatches are exactly where adoption correctly steps aside.

## Build something with it

```bash
npm create @pyreon/zero@latest
```

- How hydration works, in the docs: [runtime-dom](/docs/runtime-dom) and [SSR](/docs/ssr)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
