/**
 * Browser-safe error-diagnosis catalog — extracted from `react-intercept.ts`
 * (PR: @pyreon/compiler/diagnose subpath) so it loads WITHOUT the TypeScript
 * compiler API.
 *
 * `react-intercept.ts` imports `typescript` (AST-based React-pattern
 * detection + code migration) — Node-only + heavy. `diagnoseError` and its
 * `ERROR_PATTERNS` are pure regex + strings with ZERO TS-API dependency, so
 * they live here and are re-exported from the browser-safe
 * `@pyreon/compiler/diagnose` subpath — enabling dev throw-time error
 * diagnosis in the browser (the vite-plugin dev error printer) without
 * dragging `typescript` into the client bundle.
 *
 * The `Diagnose Catalog` CI gate (scripts/check-diagnose-catalog.ts) counts
 * `ERROR_PATTERNS` entries in THIS file.
 */

export interface ErrorDiagnosis {
  cause: string
  fix: string
  fixCode?: string | undefined
  related?: string | undefined
}

interface ErrorPattern {
  pattern: RegExp
  diagnose: (match: RegExpMatchArray) => ErrorDiagnosis
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    // useControllableState given a VALUE where its contract requires a GETTER.
    // The primitive throws this itself (dev-only) because the alternative is a
    // bare `value is not a function` from inside core — or, worse, silence: any
    // hand-rolled controlled/uncontrolled pattern that reads the prop eagerly
    // captures it ONCE at setup, so the component stops tracking its owner and
    // simply never updates again, with no error at all.
    pattern: /useControllableState: `?value`? must be a GETTER/i,
    diagnose: () => ({
      cause:
        '`useControllableState({ value: props.x })` passes the VALUE of the controlled prop. Components run ONCE in Pyreon, so an eager read captures whatever `props.x` was at setup and the component never sees the owner change it again — the controlled prop is frozen for the lifetime of the component. `value` is typed as a getter (`() => T | undefined`) precisely so the read happens lazily inside a reactive scope on every access.',
      fix: 'Wrap the prop read in an accessor: `value: () => props.x` (or `() => own.x` after `splitProps`). This is the same rule as every other reactive read in Pyreon — the accessor is what makes it live.',
      fixCode: `const [own, rest] = splitProps(props, ['checked', 'onChange'])
const [checked, setChecked] = useControllableState({
  value: () => own.checked,   // GETTER — not \`own.checked\`
  defaultValue: false,
  onChange: own.onChange,
})`,
      related:
        '`useControllableState` lives in `@pyreon/core` (next to `splitProps`/`mergeProps`) and is re-exported from `@pyreon/hooks`; both import paths are the same function. Destructuring props (`const { checked } = props`) breaks reactivity for the same reason.',
    }),
  },
  {
    // Hand-evaluated ssrTemplate output missing one of the runtime helpers.
    // The compile-to-string SSR fast path (default-on under vite-plugin)
    // emits calls to `_ssr` / `_ssrItem` / `_ssrChildren` / `_ssrForKeyed` /
    // `_esc` / `_ssrAttr` variants imported from `@pyreon/runtime-server`.
    // Apps never see this (the import is injected), but a bench harness /
    // REPL / custom eval pipeline that strips imports and injects helpers by
    // hand throws `X is not defined` for whichever helper it forgot — and
    // the helper SET grows across versions (`_ssrForKeyed` is newer than
    // `_ssr`), so a once-complete hand list silently rots.
    pattern: /_ssr(ForKeyed|Children|Item|Attr(Gen|Url)?)? is not defined|_esc is not defined/i,
    diagnose: () => ({
      cause:
        'Compiled SSR output (the `ssrTemplate` compile-to-string fast path, ON by default under the vite-plugin) references helpers imported from `@pyreon/runtime-server` (`_ssr`, `_ssrItem`, `_ssrChildren`, `_ssrForKeyed`, `_esc`, `_ssrAttr`/`_ssrAttrGen`/`_ssrAttrUrl`). A hand-rolled eval pipeline (bench harness, REPL, snippet runner) that strips the emitted imports and injects helpers manually is missing the named one — the helper set grows across versions, so a hand-maintained list rots.',
      fix: 'Let the emitted `import { … } from "@pyreon/runtime-server"` resolve naturally (bundle or run where that package resolves). If you must strip imports and inject by hand, inject the FULL current helper set — or disable the fast path for that pipeline with `transformJSX(src, file, { ssr: true })` (omit `ssrTemplate`), which falls back to plain `h()` output with identical bytes.',
      fixCode: `import * as rts from '@pyreon/runtime-server'
const deps = {
  _ssr: rts._ssr, _ssrItem: rts._ssrItem, _ssrChildren: rts._ssrChildren,
  _ssrForKeyed: rts._ssrForKeyed, _esc: rts._esc,
  _ssrAttr: rts._ssrAttr, _ssrAttrGen: rts._ssrAttrGen, _ssrAttrUrl: rts._ssrAttrUrl,
}
new Function(...Object.keys(deps), compiledBody)(...Object.values(deps))`,
      related:
        'The fast path is byte-identical to the h() SSR walk (hydration-safe by contract); disabling it only costs render speed, never correctness.',
    }),
  },
  {
    // <TransitionGroup> on web — two footguns from the multi-platform shape.
    // (1) The bare tag is only auto-lowered by PMTC on native; on web it needs
    //     a real value in scope, else `TransitionGroup is not defined` at mount
    //     (the whole app fails to render — an empty root element).
    // (2) The web component historically REQUIRED an items/keyFn/render
    //     render-prop; wrapping a keyed <For> as children threw
    //     `props.items is not a function`. Children mode now renders the wrapped
    //     list. Symptom-matched on the two thrown messages + "transitiongroup".
    pattern:
      /transitiongroup is not defined|props\.items is not a function|transitiongroup.*(not defined|undefined|keyfn|render prop|children|items)/i,
    diagnose: () => ({
      cause:
        '`<TransitionGroup>` is a web value from `@pyreon/runtime-dom`; on native PMTC lowers the bare tag by name (no import needed). In a shared multi-platform `.tsx`, using the tag without importing it on the WEB target throws `TransitionGroup is not defined` at mount and the whole app fails to render (an empty root element). Separately, the web component historically required an `items`/`keyFn`/`render` render-prop, so wrapping a keyed `<For>` as CHILDREN threw `props.items is not a function`.',
      fix: 'Import it on the web target: `import { TransitionGroup } from "@pyreon/runtime-dom"`. For the children shape (`<TransitionGroup><For .../></TransitionGroup>`), upgrade `@pyreon/runtime-dom` — it now renders the wrapped keyed list as a plain container when no `items` accessor is given. For the full per-item enter/leave animation, use the render-prop API with all three of `items`, `keyFn`, and `render`.',
      fixCode: `import { TransitionGroup } from '@pyreon/runtime-dom'

// Children (container) shape — wrap a keyed <For>:
<TransitionGroup>
  <For each={rows} by={(r) => r.id}>{(r) => <li>{r.text}</li>}</For>
</TransitionGroup>

// Full-animation shape — items/keyFn/render:
<TransitionGroup items={() => rows()} keyFn={(r) => r.id}
  render={(r) => <li>{r.text}</li>} />`,
      related:
        'A tag PMTC lowers by name on native still needs a real web value in scope. `items` supplied without `keyFn`/`render` now dev-warns and degrades to the plain container instead of throwing.',
    }),
  },
  {
    // Reactive style object with a `null`/`undefined` VALUE not clearing the
    // property. No exception fires — the symptom is behavioral ("multiple
    // toggles stay active", "background/style won't clear/reset", "old style
    // persists"), so match the words a user pastes into `pyreon doctor
    // diagnose` / MCP `diagnose`.
    pattern:
      /(style|background|color|css).*(won'?t|doesn'?t|not).*(clear|reset|remove|update|go away)|(multiple|all|previous).*(toggle|button|item|preset).*(active|highlight|selected|orange)|style.*(null|undefined).*(stuck|persist|stay)|null.*style.*(not|won'?t).*(clear|remove)/i,
    diagnose: () => ({
      cause:
        'On versions before this fix, a reactive style OBJECT whose property VALUE was `null`/`undefined` did not clear that property. `{ background: active ? "orange" : null }` produced `String(null)` → `"null"`, and `setProperty("background", "null")` is an INVALID CSS value the browser silently ignores — leaving the previous value in place. The key was also still tracked as "present", so the stale-key sweep skipped it. Net effect: a single-select toggle (preset selector, tab bar) left EVERY previously-clicked item styled-active.',
      fix: 'Upgrade `@pyreon/runtime-dom` — a `null`/`undefined` value in a reactive style object now removes the property (and stops tracking it), so `{ background: active ? "x" : null }` toggles cleanly. No app code change needed. If you cannot upgrade, use an empty string to unset instead (`background: active ? "x" : ""`), which `setProperty` treats as a removal.',
      fixCode: `// The single-select toggle idiom now clears correctly:
<button style={() => ({
  background: isActive() ? 'var(--accent)' : null,   // null now UNSETS
  color: isActive() ? 'var(--bg)' : null,
})}>{name}</button>`,
      related:
        'Distinct from the "stale key removed when a key DISAPPEARS from the object" behavior (#233), which already worked. This fix covers a key that STAYS in the object with a `null`/`undefined` value — the common `cond ? value : null` toggle.',
    }),
  },
  {
    // FW-2: a props-derived object SHORTHAND in a style/object literal. Before
    // the fix, the compiler inlined the prop-derived local into the shorthand
    // value WITHOUT expanding the `key:` prefix — the native (Rust) backend
    // emitted a keyless `{ (pick(props.v)) }`, a build-time syntax error the
    // user sees as "Unexpected token '('. Expected a property name."; the JS
    // backend didn't crash but left the shorthand captured-once (non-reactive).
    // Only the SHORTHAND form broke — the explicit `{ color: color }` always
    // worked. Matched on the parser message a user pastes, scoped by the fix
    // text to the shorthand-style shape.
    pattern:
      /expected a property name|unexpected token.*(shorthand|style=\{\{|object literal)|prop-?derived.*shorthand|shorthand.*(style|object).*(reactive|keyless|parse|unexpected)/i,
    diagnose: () => ({
      cause:
        'On versions before the FW-2 release, a props-derived local used as an object SHORTHAND inside a style/object literal (`const color = pick(props.v); <span style={{ color }} />`) was inlined without expanding the `key:` prefix. The native (Rust) backend emitted a keyless `{ (pick(props.v)) }` — a build-time syntax error ("Unexpected token \'(\'. Expected a property name."); the JS backend did not crash but left the shorthand captured-once (non-reactive). Only the SHORTHAND form broke — the explicit `{ color: color }` form always worked.',
      fix: 'Upgrade `@pyreon/compiler` — both backends now expand a prop-derived shorthand to `{ color: (pick(props.v)) }`, byte-identical to the explicit form and reactive. No app code change needed. If you cannot upgrade, write the property explicitly: `style={{ color: color }}` instead of `style={{ color }}`.',
      fixCode: `// Before (crashed on the native backend / non-reactive on JS):
const color = pick(props.v)
return <span style={{ color }} />

// After the fix, the shorthand works and is reactive. To work on ANY
// version, expand it yourself:
return <span style={{ color: color }} />`,
      related:
        "The bug was a divergence between the compiler's two backends: the JS backend skipped shorthand object-property values during prop-derived inlining (leaving them non-reactive), while the native backend substituted them and produced a keyless property. The fix expands the shorthand to `key: (value)` in BOTH backends, locked by the native-equivalence oracle.",
    }),
  },
  {
    // Text-binding coercion RESIDUALS, after the `_bindText` VNode upgrade
    // (PZ-02). A signal/accessor holding a VNode now mounts as a subtree, so
    // the classic `[object Object]` is gone — but two coercions REMAIN by
    // design and produce confusing, error-free output the user must be taught:
    //  • a plain-primitive ARRAY joins with commas (`['a','b']` -> "a,b"),
    //    because the mountable discriminator requires a VNode in the array;
    //  • a bound text node with NO parent can't mount a subtree, so it warns
    //    and stringifies (nowhere to put the nodes).
    // Symptom-matched (no exception fires for the array case).
    pattern:
      /(signal|array|binding|text).*(renders?|shows?|prints?|outputs?).*("?[a-z0-9]+,[a-z0-9]+"?|comma)|(comma-?separated|joined with commas).*(signal|array|text|binding)|text node has no parent|could not be mounted in its place/i,
    diagnose: () => ({
      cause:
        "Reactive text bindings are text-FIRST: `{sig()}` writes `String(value)` into a text node, and only a VNode-shaped value (a VNode, a NativeItem, or an array containing one) upgrades the binding to a real subtree mount. A signal holding a plain-primitive ARRAY (`signal(['a','b'])`) therefore renders the JS join — \"a,b\" — with no error, exactly like `String(['a','b'])`. Separately, if the bound text node has no parent (a detached node — compiled templates always bind attached nodes), there is nowhere to mount a subtree, so a VNode value warns and falls back to coercion.",
      fix: 'For a list of primitives, map them into elements (or join them explicitly if the comma output was intended) — a VNode-bearing array mounts as real nodes: `{() => items().map((i) => <li>{i}</li>)}`, or `<For each={items} by={…}>` for keyed reconciliation. For the detached-node warning, attach the text node before binding, or mount the value with `mountChild` directly. (Note: a signal holding a VNode/VNode[] now mounts automatically — upgrade `@pyreon/runtime-dom` if you still see literal `[object Object]`.)',
      fixCode: `const items = signal(['a', 'b'])

// renders the string "a,b" — plain-primitive array is coerced, by design:
<ul>{items()}</ul>

// renders real <li> nodes — the array now carries VNodes:
<ul>{() => items().map((i) => <li>{i}</li>)}</ul>

// keyed reconciliation for a dynamic list:
<For each={items} by={(i) => i}>{(i) => <li>{i}</li>}</For>`,
      related:
        'Companion to the `[object Object]` entry: a VNode-valued signal/accessor in a text position now UPGRADES to a subtree mount (matching what SSR always rendered, so the old guaranteed hydration mismatch is gone). Only plain-primitive arrays and the parentless-text-node degenerate case still coerce.',
    }),
  },
  {
    // TypeScript 7 Compiler-API removal. `@pyreon/compiler`'s detectors,
    // audits, and migrators parse with the classic Compiler API
    // (reading `ts.ScriptTarget.ESNext` when parsing a source file). TS7
    // ("tsgo", now `latest` on npm) removed it, so `ts.ScriptTarget` is
    // `undefined` and the parse throws the cryptic `Cannot read properties of
    // undefined (reading 'ESNext')`. Match the removed-member deref a user
    // would paste. NOTE: this module bundles for the browser and must pull ZERO
    // TypeScript API — `diagnose.test.ts` greps the bundle text, so name the
    // removed members via `ScriptTarget`/`ScriptKind`, never the source-file
    // creation token the grep treats as a bundled-TS marker.
    pattern:
      /reading '(ESNext|Latest|ScriptTarget|ScriptKind|forEachChild)'|ScriptTarget.*(undefined|is not)|typescript\s*7.*(classic|compiler api|tsgo)/i,
    diagnose: () => ({
      cause:
        'TypeScript 7 ("tsgo", the native preview published as `latest` on npm) removed the classic Compiler API (`ScriptTarget` / `ScriptKind` and the parse + traverse primitives). `@pyreon/compiler`\'s pattern detectors, audits, and migrators parse with that API, so under TS7 `ts.ScriptTarget` is `undefined` and the parse throws `Cannot read properties of undefined (reading \'ESNext\')`. A fresh `bunx @pyreon/mcp` — or any clean install that resolved an uncapped `typescript` range to 7.x — hits this; a project pinned to 5.x/6.x works.',
      fix: 'Pin `"typescript": ">=5.0.0 <7.0.0"` in your project — TypeScript 6.x is the supported classic-API line. Upgrade `@pyreon/compiler` / `@pyreon/mcp` / `@pyreon/cli` to a version whose `typescript` range is capped `<7`, so a fresh install stops pulling TS7 automatically.',
      fixCode: `// package.json
{
  "devDependencies": {
    "typescript": ">=5.0.0 <7.0.0"
  }
}`,
      related:
        'TypeScript 7 is a ground-up native rewrite that does not yet expose the classic Compiler API @pyreon/compiler depends on. Pyreon targets TypeScript 6.x until that API returns.',
    }),
  },
  {
    // <select value> fix (PZ-09): no exception fires — the symptom is
    // behavioral ("select always shows the first option", "select value
    // not working / ignored / not selected"), so the pattern matches the
    // words a user would paste into `pyreon doctor diagnose` / the MCP
    // `diagnose` tool rather than an error message.
    pattern:
      /select.*(value.*(ignored|not (work|select|appl|set|updat)|isn'?t (work|select|appl|set|updat)|doesn'?t (work|select|appl|set|updat))|(shows?|stuck (on|at)|always).*(first|wrong) option)|(first|wrong) option.*(selected|shows?).*select/i,
    diagnose: () => ({
      cause:
        'On versions before the PZ-09 release, `<select value>` was applied BEFORE the option children existed (and SSR serialized it as a `value="…"` content attribute, which the HTML parser ignores on <select>) — `HTMLSelectElement.value` is a PROPERTY whose setter selects a matching <option>, so an assignment with no options present is silently dropped and the first option stays selected. The drop hit compiled templates with static values, compiled templates with reactive values + dynamic (`.map`/`<For>`) options, the h()/component path, and SSR output.',
      fix: 'Upgrade `@pyreon/compiler`, `@pyreon/runtime-dom`, and `@pyreon/runtime-server` — the compiler defers select-value bind lines past the children lines, the runtime applies `value` after children mount/hydrate, and SSR marks the matching `<option selected>` instead of the dead attribute. No app code change needed. If you cannot upgrade, set the value imperatively after mount (`onMount(() => { selectRef.value = current() })`) or put `selected` on the matching option.',
      fixCode: `// All of these now select "b" correctly:
<select value="b"><option value="a">A</option><option value="b">B</option></select>
<select value={() => choice()}>{items().map((i) => <option value={i}>{i}</option>)}</select>
h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B'))`,
      related:
        'Known gaps: spread value (`<select {...props}>`) on the compiled template path still applies before DYNAMIC options; array values on `multiple` selects are unsupported (String()-coerced, matching the DOM .value setter).',
    }),
  },
  {
    // Template ref-hoist fix (PZ-08): a reactive/conditional slot
    // (`{cond() ? <A/> : <B/>}`, `{cond && <el/>}`) BEFORE static siblings
    // broke the compiled template's sibling ref-walk — `_mountSlot` mounts
    // content + a `<!--pyreon-->` marker and REMOVES its `<!>` placeholder,
    // so `const __eN = __root.firstChild.nextSibling…` walks emitted AFTER
    // it landed on the marker comment (TypeError reading 'setProperty' via
    // `_setStyle`), on null (setAttribute / .data), or — with TWO sibling
    // slots — on the FIRST slot's reactive marker, which the second
    // `_mountSlot` then removed (a later falsy→truthy re-flip of slot 0
    // crashed `insertBefore` and SILENTLY LOST the subtree).
    pattern:
      /reading ['"]setProperty['"]|(reading ['"](setAttribute|data|setProperty)['"]|insertBefore.*not a child of this node).*(_mountSlot|_tpl|_setStyle|pyreon|slot|marker|template)|(_mountSlot|<!--pyreon-->).*(sibling|marker|wrong node|null|missing|lost)/i,
    diagnose: () => ({
      cause:
        "On `@pyreon/compiler` versions before the template ref-hoist release, a reactive/conditional slot child (`{cond() ? <A/> : <B/>}`, `{cond && <el/>}`, `{arr.map(…)}`) placed BEFORE static siblings broke the compiled template's sibling ref-walk: `_mountSlot` mounts content + a `<!--pyreon-->` marker and removes its `<!>` placeholder (net sibling-count change), and the sibling refs / second-slot placeholder walks were emitted AFTER that mutation — so they resolved to the marker comment (TypeError: Cannot read properties of undefined (reading 'setProperty') from a style binding), to null (setAttribute / text .data), or to a sibling slot's marker, which was then removed — making that slot's next falsy→truthy re-flip throw `insertBefore … is not a child of this node` and silently lose its subtree. The failure was initial-state-dependent (some states accidentally correct).",
      fix: 'Upgrade `@pyreon/compiler` — templates now capture EVERY pristine-clone node reference (element walks, text captures, placeholder consts) BEFORE any `_mountSlot`/`replaceChild` mutation runs, in both backends. No app code change needed. If you cannot upgrade, wrap the dynamic child in its own static element (`<div style="display:contents">{cond && <X/>}</div>`) or move it after the static siblings.',
      fixCode: `// All of these now compile + run correctly:
<div>{banner() ? <Banner/> : <Fallback/>}<div style={styles.card}>card</div></div>
<div>{loading() && <Spinner/>}{items().length && <List/>}</div>
<div>{show && <em>badge</em>}<span id={dynamicId}>after</span></div>`,
      related:
        'Same fix family: @pyreon/flow MiniMap/Controls overlay child-order workaround and @pyreon/zero-content CodeBlock always-rendered-wrapper workaround existed because of this compiler bug.',
    }),
  },
  {
    // RouterLink without a resolvable router (PZ-07): matches the dev warning
    // the fixed @pyreon/router emits, AND the symptom descriptions of the OLD
    // behavior (hash-fallback `#/path` href in a history-mode app; click
    // swallowed by an early preventDefault → dead link).
    pattern:
      /RouterLink.*(without|no|missing).*(RouterProvider|router provider|provider)|RouterLink.*(#\/|hash).*(history|href|wrong)|RouterLink.*(click|link).*(nothing|dead|inert|not navigat|swallow)/i,
    diagnose: () => ({
      cause:
        'A `<RouterLink>` rendered with NO resolvable router — no `<RouterProvider>` ancestor and no `setActiveRouter()` fallback. On `@pyreon/router` versions before the link-DX release, this was broken three ways: the link read the context BARE (ignoring the active-router fallback every hook uses), the `href` fell back to a hash URL (`#/path` — wrong for history-mode apps, the dominant mode), and `handleClick` called `preventDefault()` BEFORE the no-router bail, swallowing the click entirely (dead link). The fixed version resolves the router like the hooks do, degrades to a plain anchor (plain-path `href`, full-load navigation on click), and warns once per `to` in dev.',
      fix: 'Wrap the tree in `<RouterProvider router={router}>` (the standard fix — RouterLink then client-navigates). If you deliberately render links outside the provider tree (e.g. a portal), call `setActiveRouter(router)` or accept the plain-anchor degradation. Upgrade `@pyreon/router` if you are seeing the hash-fallback `#/path` href or dead-click symptoms.',
      fixCode: `import { createRouter, RouterProvider, RouterView, RouterLink } from "@pyreon/router"

const router = createRouter({ routes, mode: "history" })
mount(
  <RouterProvider router={router}>
    <nav><RouterLink to="/settings">Settings</RouterLink></nav>
    <RouterView />
  </RouterProvider>,
  document.getElementById("app")!,
)`,
      related:
        'Companion dev warning: a plain internal `<a href="/x">` in a router app warns "triggers a full page reload — use <RouterLink to=\\"/x\\">" at the document level. Deliberate full-load links opt out via `target`, `download`, or `data-allow-reload`.',
    }),
  },
  {
    // Auto-call reachability fix (2026-07 fuzz campaign) + template
    // classification TS-transparency fix (PZ-05): symptoms of the OLD emit —
    // a function's SOURCE leaking into DOM output / handler math. Two
    // historical causes, one symptom family: (a) bare signal reads not
    // auto-called in nested handler/callback/JSX positions; (b) TS
    // type-layers (`as never` / `satisfies` / `!` / parens) opaque to the
    // template child/attr classifier, so a cast accessor fell through to a
    // STATIC bake (`textContent = (() => x()) as never`).
    pattern: /(\(\.\.\.args\) =>|function\s*\(\)|\(\)\s*=>).*(setAttribute|attribute|title=|id=|textContent)|signal.*(function|source).*(attribute|DOM|rendered)|(as never|satisfies).*(textContent|attribute|source|rendered|literal text)|s\w*\.set\(.*=>.*\+/i,
    diagnose: () => ({
      cause:
        'A function\'s SOURCE text is rendering into the DOM. Two known causes: (1) on `@pyreon/compiler` versions before the auto-call reachability release, bare signal reads inside event-handler bodies, `.map`/callback re-emits, and nested JSX under conditional slots were NOT auto-called on one or both backends — the signal FUNCTION leaked into the emitted code, so string contexts rendered its source (`id="v(...args) => {…"`), boolean contexts were always truthy (`title={sig ? "a" : "b"}` stuck), and the canonical counter (`count.set(count + 1)`) concatenated the function. (2) On versions before the template-classification TS-transparency release, a TS-cast accessor child/attr (`{(() => x()) as never}`, `title={(() => x()) satisfies unknown}`, or even plain parens `{(() => x())}`) was OPAQUE to the template classifier and fell through to a STATIC bake — rendering the function source as literal text / attribute value.',
      fix: 'First, remove the cast: accessor-typed children and attrs accept the function form directly (`{() => x()}`, `title={() => x()}`) — an `as never` around an accessor is never needed and hides type errors. Then upgrade `@pyreon/compiler` if you are on an older release — the auto-call pass walks nested function bodies (shadow-aware) and nested JSX uniformly in BOTH backends, and the template classifier now unwraps TS type-layers/parens at the child + attr seams, so `(expr) as never` compiles byte-identically to `expr`. Both are locked by a seeded differential-fuzz gate.',
      fixCode: `// All of these now compile correctly:
<button onClick={() => count.set(count + 1)}>+</button>
<ul>{items().map((it) => <li title={flag ? "a" : "b"}>{it}</li>)}</ul>
{cond() ? <span id={\`v\${sig}\`}>x</span> : null}
// TS-layer wrappers are value-transparent (but prefer the bare form):
<div>{(() => name()) as never}</div>  // ≡ <div>{() => name()}</div>
<div title={(() => tip())!}>hi</div>  // ≡ <div title={() => tip()}>hi</div>`,
      related: 'duplicate-jsx-attr warning: duplicate JSX attributes now dedupe last-wins (JSX object semantics) with a compiler warning.',
    }),
  },
  {
    // Hydration-blob same-path collision (fixed alongside the server-loaders
    // correctness PR): a layout and its index page SHARE a route path, and
    // the SSR hydration blob keyed loader data by record.path — so on older
    // @pyreon/router versions, useLoaderData() in one of the two could read
    // the OTHER record's data after hydration (last-write-wins, timing-
    // dependent).
    pattern: /useLoaderData\(\).*(wrong|layout|other route|collid|overwrit)|loader data.*(layout|page).*(swap|collid|wrong|overwrit)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/router` versions before the server-loaders correctness release, the SSR hydration blob (`window.__PYREON_LOADER_DATA__`) keyed loader data by `record.path`. A layout and its index page share a path, so when BOTH carry loaders their data collided in the blob (last-write-wins) — post-hydration, `useLoaderData()` in one component read the other record\'s data.',
      fix: 'Upgrade `@pyreon/router` — the blob now keys the first record at a path bare (back-compat) and subsequent same-path records as `path#<occurrence>`, so layout + page data never collide. No app code change needed.',
      fixCode: `// routes/dashboard/_layout.tsx — layout loader
export async function loader() { return { user: await getUser() } }
// routes/dashboard/index.tsx — page loader (same /dashboard path)
export async function loader() { return { stats: await getStats() } }
// After the upgrade each component's useLoaderData() reads ITS OWN data.`,
    }),
  },
  {
    // Phase 5 (server loaders) — useLoaderData() returning undefined for a
    // route whose data comes from a `.server.ts` serverLoader sibling, on
    // @pyreon/router versions where the RouterView render gates checked
    // only `record.loader` before wrapping in LoaderDataProvider.
    pattern: /useLoaderData\(\).*(undefined|none).*(serverLoader|server loader|\.server\.ts)|serverLoader.*(data|useLoaderData).*(undefined|missing)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/router` versions before the server-loaders release, BOTH RouterView render-gate branches checked only `record.loader` before wrapping the route in `LoaderDataProvider` — a route whose data comes from a `.server.ts` `serverLoader` sibling rendered WITHOUT the provider, so `useLoaderData()` read the context default (undefined) even though the loader ran and the hydration blob carried the value.',
      fix: 'Upgrade `@pyreon/router` + `@pyreon/zero` to the server-loaders release (the gates now share one `carriesLoaderData` predicate covering loader / serverLoader / hasServerLoader). No code change needed in your app.',
      fixCode: `// src/routes/dashboard.server.ts
export async function serverLoader(ctx) { return db.load(ctx.request) }
// src/routes/dashboard.tsx — works after the upgrade:
const data = useLoaderData<Dashboard>()`,
    }),
  },
  {
    // Phase 4 (server islands) surfaced this runtime-dom bug class: data-*/
    // aria-* props on CUSTOM ELEMENTS landed as JS properties, so
    // getAttribute/dataset/CSS attribute selectors silently read null while
    // SSR HTML carried real attributes.
    pattern: /getAttribute\(['"](data-|aria-)[\w-]+['"]\).*(null|undefined)|dataset\.\w+.*undefined.*(custom|hyphen|web component)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before the data-/aria- carve-out, `data-*`/`aria-*` props on CUSTOM ELEMENTS (hyphenated tags) were set as JS PROPERTIES via the pre-upgrade branch — `getAttribute("data-x")`, `el.dataset`, and CSS attribute selectors all read null on client-mounted elements even though SSR HTML carried real attributes.',
      fix: 'Upgrade `@pyreon/runtime-dom` to the release where data-*/aria-* always go through setAttribute (React/Vue/Solid behavior). If you cannot upgrade, read the value as a property (`(el as any)["data-x"]`) on client-mounted custom elements — and remove that workaround after upgrading.',
      fixCode: `// after the upgrade this just works on custom elements:
<my-widget data-state={state()} aria-label="Cart" />
// el.getAttribute("data-state") / el.dataset.state both resolve`,
    }),
  },
  {
    // Compiler template fast-path — `dangerouslySetInnerHTML` on a
    // template-ized element (any multi-element JSX tree) fell through to a
    // generic `setAttribute("dangerouslySetInnerHTML", value)`, so the
    // `{ __html }` object stringified to "[object Object]" and the element
    // rendered EMPTY. SSR emitted the inner HTML correctly, then the client
    // template render replaced it with the empty attribute'd node — so an
    // SSR'd `<pre>` (e.g. a Shiki code block) BLINKED then vanished.
    pattern:
      /dangerouslySetInnerHTML.*(\[object Object\]|empty|blank|vanish|disappear|not render)|\[object Object\].*(innerHTML|inner html)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/compiler` versions before the template-path fix, `dangerouslySetInnerHTML` on an element that the compiler lowered into a `_tpl()` template (any JSX tree with ≥2 elements) fell through to a generic `setAttribute("dangerouslySetInnerHTML", value)`. The `{ __html }` object stringified to "[object Object]" and the element rendered EMPTY — the runtime `applyProp` path (`h()`/spreads) was correct, only the template fast path was wrong. SSR emitted the inner HTML, then the client template render replaced it with the empty node, so content BLINKED then vanished.',
      fix: 'Upgrade `@pyreon/compiler` to the release where the template fast path applies `dangerouslySetInnerHTML` as `el.innerHTML = value.__html` (mirroring the runtime `applyStaticProp` path, both JS + Rust backends). No app code change needed. If you cannot upgrade, set `innerHTML` imperatively in `onMount` from a `ref` instead.',
      fixCode: `// Works after the upgrade (template path now sets innerHTML):
<div class="wrapper">
  <div dangerouslySetInnerHTML={{ __html: html }} />
</div>

// Pre-upgrade workaround — imperative innerHTML via ref:
function Body({ html }) {
  let el
  onMount(() => { if (el) el.innerHTML = html })
  return <div class="wrapper"><div ref={(n) => (el = n)} /></div>
}`,
    }),
  },
  {
    // Compiler template fast-path — a DYNAMIC generic attribute
    // (`aria-disabled={x ? 'true' : undefined}`, `hidden={cond}`,
    // `data-x={maybe}`) fell through to a raw `setAttribute(name, value)`, so
    // a nullish value ToString-coerced to the literal "undefined"
    // (`aria-disabled="undefined"` — an INVALID aria value assistive tech reads
    // as the OPPOSITE state) and a boolean `false` rendered `hidden="false"`
    // (attribute PRESENT → element still hidden). The runtime `h()`/spread path
    // was correct — only the `_tpl()` template fast path diverged. Symptom-
    // matched (no exception fires; the user pastes the wrong attribute value or
    // an a11y complaint).
    pattern:
      /aria-[\w-]+="?undefined"?|(hidden|disabled|checked|draggable|selected|expanded)="(false|undefined)"|(attribute|attr|aria).*(renders?|shows?|set to|value).*("undefined"|=undefined|"false")|(screen ?reader|assistive|a11y|voiceover|nvda).*(wrong|opposite|reversed|ignore).*(state|announce|disabled|checked)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/compiler` versions before this fix, a DYNAMIC generic attribute on an element the compiler lowered into a `_tpl()` template fell through to a raw `setAttribute(name, value)` with no null/boolean normalization. A nullish value ToString-coerced to the literal string "undefined" (so the recommended ARIA shape `aria-disabled={x ? "true" : undefined}` rendered `aria-disabled="undefined"` — an INVALID aria value that assistive tech reads as the opposite / default state), and a boolean `false` rendered as a PRESENT attribute (`hidden={cond}` with `cond===false` → `hidden="false"`, still hidden). The runtime `h()`/spread path (`applyStaticProp`) was always correct — only the template fast path diverged, so SSR (also correct) disagreed with the client → a latent hydration mismatch too.',
      fix: 'Upgrade `@pyreon/compiler` + `@pyreon/runtime-dom` — the template fast path now routes generic dynamic attributes through the runtime `_setAttr` normalizer (= `applyAttrProp`), mirroring `applyStaticProp` in both JS + Rust backends: null/undefined → removeAttribute, boolean `aria-*` → "true"/"false", boolean → presence/absence. No app code change needed. If you cannot upgrade, drop the nullish branch (`aria-disabled={String(!!x)}` always emits "true"/"false") or set the attribute imperatively in `onMount` via a `ref`.',
      fixCode: `// All of these now normalize correctly (template + runtime + SSR agree):
<button aria-disabled={busy() ? 'true' : undefined}>Save</button>  // undefined -> ABSENT
<div hidden={collapsed()}>panel</div>                              // false -> ABSENT
<input aria-invalid={hasError() ? 'true' : undefined} />           // toggles absent<->"true"

// Pre-upgrade workaround — avoid the nullish branch for ARIA state:
<button aria-disabled={busy() ? 'true' : 'false'}>Save</button>`,
      related:
        'Sibling of the template-path `dangerouslySetInnerHTML` and class/style (`_setClass`/`_setStyle`) fixes — all are cases where the compiler template fast path had to be taught to mirror the runtime `applyStaticProp` value-normalization instead of assigning the raw value. Locked by the native-equivalence oracle + a real-transform mount regression.',
    }),
  },
  {
    // PZ-02 — a VNode String()-coerced into a text binding renders the
    // literal "[object Object]". Historical shapes: a JSX-returning helper
    // called inline in a text position (`<td>{cell(row.status)}</td>`), a
    // no-arg cross-file helper call (`{helper()}`), or a signal whose VALUE
    // is a VNode (`{sig()}` / `{() => sig()}`). SSR renders the subtree
    // correctly, so it also surfaces as a hydration mismatch. FIXED on
    // current versions: in-file helper calls route through `_mountSlot` at
    // the compiler, and `_bindText` (the single-signal/bare-call fast path)
    // upgrades to a subtree mount on the first VNode-shaped value at the
    // runtime — so the entry now leads with "upgrade". Placed AFTER the
    // dangerouslySetInnerHTML entry (innerHTML-mentioning reports route
    // there first) and BEFORE the SSR↔hydration parity entry at the end.
    // The first alternative matches runtime-dom's dev warning text prefix
    // (now fired only for a DETACHED bound text node); the second is scoped
    // to text/render context words to avoid over-broad matching.
    pattern:
      /VNode was coerced to "?\[object Object\]"?|\[object Object\][^\n]{0,80}(text binding|text position|instead of|as (plain )?text|in (a |the )?(table |list )?(cell|text))/i,
    diagnose: () => ({
      cause:
        'A VNode was String()-coerced into a TEXT binding — rendering the literal "[object Object]". On `@pyreon/runtime-dom` versions before the `_bindText` VNode upgrade this hit ANY VNode value reaching a text binding: an inline JSX-returning helper call (`<td>{cell(row.status)}</td>`), a no-arg helper call (`{helper()}`), or a signal holding a VNode (`{sig()}`, `{() => sig()}`). SSR renders the subtree correctly, so the client shows "[object Object]" plus a hydration mismatch.',
      fix: 'Upgrade `@pyreon/compiler` + `@pyreon/runtime-dom` — current versions FIX this shape: `_bindText` permanently upgrades the binding to a subtree mount on the first VNode-shaped value (string bindings are untouched), and in-file helper calls mount via `_mountSlot`. Style guidance still applies: Extract a real component and render it as a JSX element — `<Cell x={x} />` is clearer than `{cell(x)}` and works cross-file on any version. (PascalCase does not change a bare CALL — `{Cell(x)}` is still a call expression; the JSX element form is the component path.)',
      fixCode: `// ✗ on pre-upgrade versions, the returned VNode stringified → "[object Object]":
const cell = (s) => <span class="badge">{s}</span>
<td>{cell(row.status)}</td>

// ✓ upgrade — current runtimes mount the VNode automatically. Or extract a
// component — the JSX element form is mounted on any version:
function Cell(props) { return <span class="badge">{props.s}</span> }
<td><Cell s={row.status} /></td>`,
      related:
        'The one remaining warn-only case is a DETACHED text node bound manually via `_bindText` (nowhere to mount). A reactive accessor that only LATER yields a VNode (`{() => loading() ? "…" : <Table/>}`) was fixed earlier by the SSR↔hydration parity release (`bindPolymorphicText`).',
    }),
  },
  {
    // Universal VNode[] child mounting — before the polymorphic-child release,
    // a VNode ARRAY interpolated as a bare `{value}` child from a source the
    // compiler could not resolve to a literal/map (a prop, a param, a
    // const-from-call, a function return) hit the raw text path and stringified.
    // An array's `.toString()` comma-joins, so the tell-tale signature is
    // `[object Object],[object Object]` (a single VNode renders one
    // `[object Object]`). Distinct from the PZ-02 bare-call entry above (which
    // is scoped to text/cell/render context words and the runtime dev-warning
    // text) — this arm keys on the comma-joined ARRAY signature + the array/prop
    // source words, so the two never double-match.
    pattern:
      /\[object Object\],\[object Object\]|\[object Object\][^\n]{0,80}(VNode array|array of (elements|nodes|VNodes|children)|children prop|\{props\.\w+\}|\{items\}|list of elements)/i,
    diagnose: () => ({
      cause:
        'A `VNode[]` (or single VNode) interpolated as a bare `{value}` child stringified to "[object Object]" (an array shows the comma-joined "[object Object],[object Object]"). On `@pyreon/compiler`/`@pyreon/runtime-dom` versions before universal VNode[] child mounting, only an INLINE array literal or a `.map()` const was mounted — a VNode array reaching the child from a PROP, a function PARAM, a const bound to a call, or a function RETURN hit the raw `textContent`/`_bind(.data =)` text path and was String()-coerced instead of mounted.',
      fix: 'Upgrade `@pyreon/compiler` + `@pyreon/runtime-dom` to the release with universal VNode[] child mounting — a bare `{value}` child then MOUNTS a VNode/VNode[] from any source (prop, param, const, return), text-setting only primitives. If you cannot upgrade: wrap the value in an accessor `{() => value}`, render it with `<For each={value} by={…}>`, or inline the array literal / `.map()` at the JSX site.',
      fixCode: `// ✗ on pre-universal-mount versions, a VNode[] prop/param stringifies:
function List({ items }) { return <ul>{items}</ul> }        // "[object Object],[object Object]"

// ✓ upgrade — a bare {items} now mounts the array as real <li> elements.
// Or, without upgrading, force the mount path:
function List({ items }) { return <ul>{() => items}</ul> }  // accessor → subtree mount
// or:  <For each={items} by={i => i.key}>{i => <li>{i.label}</li>}</For>`,
      related:
        'The compiler lowers these children to `_setChild` (static sole), `_setChildAt` (static mixed), or `bindPolymorphicText` (general reactive) — each detects a VNode/VNode[] value and mounts it. A bare VNode-returning CALL child (`<td>{cell(x)}</td>`) is a DIFFERENT shape — see the PZ-02 "[object Object]" entry.',
    }),
  },
  {
    // Phase 1 render-pipeline unification — the shipped-broken
    // `useRequestLocals` (renderToString/renderToStream opened a FRESH ALS
    // context stack, discarding request-level provide() frames). Users on
    // older runtime-server versions see the locals hook resolving its
    // default ({}), so reads like `locals.nonce` / `locals.user` are
    // undefined inside SSR-rendered components even though the handler's
    // middleware populated ctx.locals.
    pattern: /useRequestLocals\(\).*(undefined|empty|\{\})|locals.*(nonce|user).*undefined.*(SSR|server)/i,
    diagnose: () => ({
      cause:
        '`useRequestLocals()` resolves its default ({}) inside SSR-rendered components on `@pyreon/runtime-server` versions where `renderToString`/`renderToStream` opened a FRESH request-context stack — the nested ALS scope silently discarded every request-level `provide()`, including the handler\'s `provideRequestLocals(ctx.locals)` bridge.',
      fix: 'Upgrade `@pyreon/runtime-server` + `@pyreon/server` to the release where the renderers INHERIT an active `runWithRequestContext` scope (the renderPage unification). Middleware locals then reach components with no code change. If you cannot upgrade, pass values through route loaders instead of locals.',
      fixCode: `// middleware (unchanged):
middleware: [(ctx) => { ctx.locals.nonce = makeNonce() }]
// component (works after the upgrade):
const { nonce } = useRequestLocals()`,
    }),
  },
  {
    pattern: /Cannot read properties of undefined \(reading '(set|update|peek|subscribe)'\)/,
    diagnose: (m) => ({
      cause: `Calling .${m[1]}() on undefined. The signal variable is likely out of scope, misspelled, or not yet initialized.`,
      fix: 'Check that the signal is defined and in scope. Signals must be created with signal() before use.',
      fixCode: `const mySignal = signal(initialValue)\nmySignal.${m[1]}(newValue)`,
    }),
  },
  {
    pattern: /Cannot read properties of undefined \(reading 'ref'\)/,
    diagnose: () => ({
      cause:
        'Pyreon\'s client mount/hydrate hit a Promise where it expected a VNode — typically an `async function Component()` returned to a route or other JSX call site on a runtime-dom version older than this fix. SSR awaits the Promise and inlines content; the older client read `.props.ref` straight off the Promise and crashed.',
      fix: 'Upgrade `@pyreon/runtime-dom` to the version that ships async-function-component support on the client (parity with `renderToString`). On older versions, refactor to one of the documented sync patterns:\n  • `lazy(() => import(...))` + `<Suspense>`\n  • move the await into `onMount(async () => { ... signal.set(result) })` and render from the signal',
      fixCode:
        '// Old pattern (crashes on the client):\nasync function DocBody({ slug }) {\n  const entry = await getEntry("docs", slug)\n  return <article>...</article>\n}\n\n// Sync + signal alternative (works on every version):\nfunction DocBody({ slug }) {\n  const data = signal(null)\n  onMount(async () => {\n    const entry = await getEntry("docs", slug)\n    data.set(entry)\n  })\n  return () => {\n    const d = data()\n    if (!d) return <article class="loading" />\n    return <article>...</article>\n  }\n}',
    }),
  },
  {
    pattern: /Hydration: async component <(\w+)> SSR markers/,
    diagnose: (m) => ({
      cause: `Pyreon's client hydrate ran <${m[1]}> (an async function component) but couldn't find the SSR sentinel markers (\`<!--$pas-->\`/\`<!--$pae-->\`) that bracket the resolved subtree in the server-rendered HTML. Without them, the client can't attach events / onMount / signal subscriptions to the async subtree — content stays visible but is interactive-dead.`,
      fix: 'Almost always a version-skew issue: `@pyreon/runtime-server` (server build) is older than `@pyreon/runtime-dom` (client build). Bump them in lockstep so the SSR side emits the markers the client side expects.\n  • Check both packages are on the SAME version in package.json + lockfile\n  • Rebuild the server bundle after the upgrade — `lib/` may be cached from the older runtime-server\n  • If you intentionally pin runtime-server to an older version, downgrade runtime-dom to match (or accept that async subtrees won\'t hydrate)',
      fixCode:
        '// package.json — keep these two in lockstep:\n{\n  "dependencies": {\n    "@pyreon/runtime-server": "0.x.y",  // server SSR\n    "@pyreon/runtime-dom":    "0.x.y"   // client hydrate\n  }\n}\n\n// then:\nbun install\nbun run build  // rebuild both server + client bundles',
    }),
  },
  {
    // `_mountSlot` returned `null` for a falsy/boolean conditional slot
    // (`{showLock && <button>}` → false, `{cond ? <x/> : null}` → null), but
    // the compiler emits a template's cleanup as an UNCONDITIONAL call of every
    // slot disposer (`() => { __d0(); __d1(); … }`). So the disposer was `null`
    // and `__dN()` threw `<slot> is not a function` (minified: `g is not a
    // function`) the moment the reactive boundary re-ran or the component
    // unmounted. Surfaced as the @pyreon/flow Controls crash on drag/zoom/nav
    // (`showLock` defaults false → the lock-button slot is `_mountSlot(false)`
    // → null). Matched BEFORE the generic "X is not a function" entry below so
    // the slot-cleanup shape (Unhandled effect error / Object.cleanup) gets the
    // correct explanation instead of the "call your signal" advice.
    pattern:
      /(?:Unhandled effect error|Object\.cleanup|at cleanup|effect.*cleanup).*\bis not a function\b|\bis not a function\b.*\bcleanup\b/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before the `_mountSlot` callable-cleanup fix, a conditional JSX slot that evaluated FALSY/BOOLEAN (`{cond && <x/>}` → false, `{cond ? <x/> : null}` → null) made `_mountSlot` return `null` instead of a disposer. The compiler emits a template\'s cleanup as an UNCONDITIONAL call of every slot disposer (`() => { __d0(); __d1(); … }`), so the `null` slot threw `<slot> is not a function` (minified: e.g. `g is not a function` at `Object.cleanup`) the instant the reactive boundary re-ran or the component unmounted. The `@pyreon/flow` Controls crash on drag/zoom/navigate-away was exactly this (`showLock` defaults false → the lock-button slot is `_mountSlot(false)` → null).',
      fix: 'Upgrade `@pyreon/runtime-dom` to the release where `_mountSlot` ALWAYS returns a callable cleanup (a shared no-op for the falsy case), so the compiler-emitted unconditional disposer call is always safe. No app code change needed. If you cannot upgrade, avoid bare falsy conditional slots inside a templatized element — wrap the conditional in a `<Show>` (`<Show when={cond}>{<x/>}</Show>`) so the slot always mounts a real reactive child.',
      fixCode: `// Crashes on re-render/unmount pre-upgrade (falsy slot → null disposer):
<div class="controls">{showLock && <button>Lock</button>}</div>

// Works after the upgrade (slot returns a callable no-op when falsy).
// Pre-upgrade workaround — route through <Show>:
<div class="controls"><Show when={showLock}><button>Lock</button></Show></div>`,
    }),
  },
  {
    // TWO distinct Pyreon causes share this message shape — teaching only the
    // signal one was actively wrong for the reactive-prop variant (PZ-10),
    // where the fix is the OPPOSITE direction (stop calling it).
    pattern: /(\w+) is not a function/,
    diagnose: (m) => ({
      cause: `'${m[1]}' is not callable. Two common Pyreon causes: (1) it is a signal you meant to call — signals are callable functions: ${m[1]}(). (2) it is a component PROP the child typed as an accessor (\`${m[1]}: () => T\`) — but \`${m[1]}={expr}\` with a compiler-visible signal compiles to a reactive prop that Pyreon auto-unwraps, so \`props.${m[1]}\` is already the current VALUE and calling it throws. The prop variant is intermittent across call sites: raw arrows and hook-returned callables pass through un-wrapped and work.`,
      fix: `If '${m[1]}' is a signal: read with ${m[1]}(), write with ${m[1]}.set(value). If '${m[1]}' is a component prop: type it as the VALUE (not \`() => T\`) and read props.${m[1]} in a reactive scope (JSX accessor / effect / computed); if you genuinely need a lazy accessor, have the CALLER pass an explicit arrow: ${m[1]}={() => value}. In dev, Pyreon's setup-catch prints a "compiler-wrapped reactive prop" diagnosis when the throwing name matches a getter-backed prop.`,
      fixCode: `// (1) Signal — read / write:\nconst value = ${m[1]}()\n${m[1]}.set(newValue)\n\n// (2) Reactive prop — type as the value, read reactively:\nfunction Child(props: { ${m[1]}: Item[] }) {\n  return <ul><For each={props.${m[1]}} by={i => i.id}>{i => <li>{i.name}</li>}</For></ul>\n}\n// Need laziness? The caller passes an explicit arrow:\n<Child ${m[1]}={() => items()} />`,
    }),
  },
  {
    pattern: /Cannot find module '(@pyreon\/\w[\w-]*)'/,
    diagnose: (m) => ({
      cause: `Package ${m[1]} is not installed.`,
      fix: `Run: bun add ${m[1]}`,
      fixCode: `bun add ${m[1]}`,
    }),
  },
  {
    pattern: /Cannot find module 'react'/,
    diagnose: () => ({
      cause: "Importing from 'react' in a Pyreon project.",
      fix: 'Replace React imports with Pyreon equivalents.',
      fixCode:
        '// Instead of:\nimport { useState } from "react"\n// Use:\nimport { signal } from "@pyreon/reactivity"',
    }),
  },
  {
    pattern: /Property '(\w+)' does not exist on type 'Signal<\w+>'/,
    diagnose: (m) => ({
      cause: `Accessing .${m[1]} on a signal. Pyreon signals don't have a .${m[1]} property.`,
      fix:
        m[1] === 'value'
          ? 'Pyreon signals are callable functions, not .value getters. Call signal() to read, signal.set() to write.'
          : `Signals have these methods: .set(), .update(), .peek(), .subscribe(). '${m[1]}' is not one of them.`,
      fixCode:
        m[1] === 'value' ? '// Read: mySignal()\n// Write: mySignal.set(newValue)' : undefined,
    }),
  },
  {
    pattern: /Type '(\w+)' is not assignable to type 'VNode'/,
    diagnose: (m) => ({
      cause: `Component returned ${m[1]} instead of VNode. Components must return JSX, null, or a string.`,
      fix: 'Make sure your component returns a JSX element, null, or a string.',
      fixCode: 'const MyComponent = (props) => {\n  return <div>{props.children}</div>\n}',
    }),
  },
  {
    pattern: /onMount callback must return/,
    diagnose: () => ({
      cause: 'onMount expects a callback that optionally returns a CleanupFn.',
      fix: 'Return a cleanup function, or return nothing.',
      fixCode: 'onMount(() => {\n  // setup code\n})',
    }),
  },
  {
    pattern: /Expected 'by' prop on <For>/,
    diagnose: () => ({
      cause: "<For> requires a 'by' prop for efficient keyed reconciliation.",
      fix: 'Add a by prop that returns a unique key for each item.',
      fixCode:
        '<For each={items()} by={item => item.id}>\n  {item => <li>{item.name}</li>}\n</For>',
    }),
  },
  {
    // <For> keyed reconciler — a NEW key added into a slot VACATED by a removal
    // landed at the physical TAIL instead of its logical position. No exception
    // fires — the symptom is behavioral (wrong DOM order), so match the words a
    // user pastes into `pyreon doctor diagnose` / MCP `diagnose`. Kept specific
    // to list/<For> ORDER wording so it can't shadow the generic entries.
    pattern:
      /<?for>?\b.*(wrong|incorrect|out.?of).*order|list.*(wrong|incorrect|out.?of).*order|(new|added|inserted).*(row|item|element|key).*(end|tail|bottom|last)|(row|item|key).*(strand|stuck|end up).*(end|tail|bottom)|list.*order.*(after|when).*(add|remov|insert|delet)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before this fix, adding a NEW key into a slot VACATED by a removal (e.g. `[1,2,3,4]` → `[1,5,3]`) placed the new row at the physical TAIL instead of its logical position, rendering `[1,3,5]`. In the general LIS reconciler path (taken when the list LENGTH changes, i.e. an add + a remove together), the new entry was mounted at the tail but recorded its `pos` as its NEW logical index. The LIS reads `pos` as the entry\'s CURRENT DOM position to decide which rows stay vs. move, so a new row whose index sat between two survivors looked "already in order" and was never moved off the tail. The small-k reorder path (used when the list length is unchanged) was unaffected because it places via survivor anchors, not `pos`.',
      fix: 'Upgrade `@pyreon/runtime-dom` — a new `<For>` entry that has a survivor after it in the new order is now excluded from the reorder\'s "already-ordered" set and moved to its logical slot, while trailing appended rows stay put (so the prepend/append fast paths are unaffected). No app code change needed. If you cannot upgrade, force a full re-render for that update (change the container `key`, or clear then re-set the array) so the reconciler rebuilds from scratch instead of reordering.',
      fixCode: `// This now renders [1,5,3] (was [1,3,5] before the fix):
const items = signal([1, 2, 3, 4])
<For each={items} by={(x) => x}>{(x) => <li>{x}</li>}</For>
items.set([1, 5, 3])  // remove 2 & 4, add 5 in the middle`,
      related:
        'The mount-order-vs-logical-position class: any reconciler that mounts new nodes at a fixed anchor (the tail) but feeds a position-based reorder must record the node\'s ACTUAL physical position, not its target logical index — the reorder trusts that position to decide moves.',
    }),
  },
  {
    pattern: /useHook.*outside.*component/i,
    diagnose: () => ({
      cause:
        'Hook called outside a component function. Pyreon hooks must be called during component setup.',
      fix: 'Move the hook call inside a component function body.',
    }),
  },
  {
    pattern: /Hydration mismatch/,
    diagnose: () => ({
      cause: "Server-rendered HTML doesn't match client-rendered output.",
      fix: 'Ensure SSR and client render the same initial content. Check for browser-only APIs (window, document) in SSR code.',
      related: "Use typeof window !== 'undefined' checks or onMount() for client-only code.",
    }),
  },
  {
    // W16 — Transition wrapped in Portal/Show queued applyEnter before the
    // child ref was assigned, so el.classList.remove threw. Closed in PR
    // #960 by retrying for up to 16 microtasks. Catch the rarer residual
    // shape (e.g. ref never resolves) and explain the fix.
    pattern: /Cannot read propert(?:y|ies) of null \(reading 'classList'\)/,
    diagnose: () => ({
      cause:
        "A <Transition> tried to read .classList on a null element. Usually the ref to the animated child element wasn't assigned by the time applyEnter/applyLeave ran — e.g. the child is itself an async-mounted component, or the Transition wraps something other than a single DOM element.",
      fix: "Transition must wrap a single DOM element directly (not a component VNode). If you need a component, wrap the component's root DOM element in Transition externally, or expose the ref via forwardRef.",
      fixCode:
        '// ✗ Component child — Transition can\'t inject ref\n<Transition show={open}>\n  <MyComponent />\n</Transition>\n\n// ✓ DOM element child\n<Transition show={open}>\n  <div class="modal">...</div>\n</Transition>',
    }),
  },
  {
    // W14 — hotkeys sequential combos. Catch the rare case where a user
    // sees the warning about an empty shortcut string.
    pattern: /\[@pyreon\/hotkeys\] empty shortcut/,
    diagnose: () => ({
      cause:
        'registerHotkey() / useHotkey() was called with an empty or whitespace-only shortcut string.',
      fix: 'Provide a non-empty key combo. Sequential combos use whitespace: useHotkey("g t", ...). Modifier combos use +: useHotkey("ctrl+s", ...).',
      fixCode: "useHotkey('g t', () => router.push('/top'))",
    }),
  },
  {
    // W19 — user runs `zero build` against an SPA-only
    // project that has no `src/entry-server.ts`. As of v0.25.2 the CLI
    // skips the server build for `mode: 'spa'` AND when entry-server.ts
    // is absent; this pattern catches older zero-cli versions or apps
    // that declare a non-SPA mode without the matching entry file.
    pattern: /\[UNRESOLVED_ENTRY\][^\n]*src\/entry-server\.ts/,
    diagnose: () => ({
      cause: "`zero build` is doing an SSR build pass but `src/entry-server.ts` doesn't exist.",
      fix: "If your app is SPA-only: declare `zero({ mode: 'spa' })` in vite.config.ts AND upgrade `@pyreon/zero-cli` to ≥0.25.2 (where the SSR build pass is skipped for SPA mode). If your app needs SSR/SSG: add `src/entry-server.ts` exporting `createServer(...)` from `@pyreon/zero/server`.",
      fixCode:
        "// vite.config.ts\nimport zero from '@pyreon/zero/server'\nexport default {\n  plugins: [zero({ mode: 'spa' })],\n}",
    }),
  },
  {
    // W18 — user pairs only one half of the cross-list
    // dnd contract. `groupId` is the opt-in; the destination must
    // provide `onCrossListReceive`, the source must provide
    // `onCrossListDrop`. Without one half, items appear duplicated
    // (no source removal) or disappear (no destination insert).
    pattern: /\[@pyreon\/dnd\] useSortable cross-list/,
    diagnose: () => ({
      cause:
        'A useSortable with groupId received a cross-list drop but missed either onCrossListReceive (destination inserts) or onCrossListDrop (source removes).',
      fix: 'Pair both callbacks across the two sortables that share a groupId. Destination inserts; source removes.',
      fixCode:
        "const a = useSortable({\n  items: colA, by: c => c.id, onReorder: setColA,\n  groupId: 'kanban',\n  onCrossListDrop: item => setColA(colA().filter(c => c.id !== item.id)),\n})\nconst b = useSortable({\n  items: colB, by: c => c.id, onReorder: setColB,\n  groupId: 'kanban',\n  onCrossListReceive: (item, i) => {\n    const next = [...colB.peek()]\n    next.splice(i, 0, item)\n    setColB(next)\n  },\n})",
    }),
  },
  {
    // R1 — `useRouter()` / `useNavigate()` / `useParams()` /
    // `useRoute()` / `onBeforeRouteLeave()` / `onBeforeRouteUpdate()`
    // / `useBlocker()` / `useSearchParams()` / etc. all share this
    // "[Pyreon] No router installed" throw shape. The most common
    // cause: the hook is called from a component mounted OUTSIDE
    // a `<RouterProvider router={createRouter({...})}>`. Common
    // forms: forgotten provider at app root, mounted a test fixture
    // without the provider, or split a component into a module
    // that's reused outside the routed tree.
    pattern: /\[Pyreon\] No router installed/,
    diagnose: () => ({
      cause:
        'A router hook (useRouter / useNavigate / useParams / useRoute / onBeforeRouteLeave / etc.) was called from a component that is not mounted inside a <RouterProvider>. The router context is provided per-tree, so descendants without a provider get the explicit "no router installed" throw rather than silently no-op.',
      fix: 'Wrap the app root in <RouterProvider router={createRouter({...})}>. For tests, render the unit under <RouterProvider router={...}> with a stub router. For shared components that may render in both routed AND non-routed contexts, accept the navigate callback as a prop instead of calling useNavigate() directly.',
      fixCode: `const router = createRouter({ routes })
mount(() => <RouterProvider router={router}><App /></RouterProvider>, root)`,
    }),
  },
  {
    // R2 — `ResolvedRoute.meta` is reference-stable + frozen (cached
    // per FlattenedRoute; dynamic-route nav `/posts/42` and `/posts/99`
    // share the SAME meta object identity). User code that does
    // `(route.meta as any).x = …` to stash per-navigation state now
    // throws this TypeError in strict mode (every Pyreon module file
    // is strict). The captured property name varies by user code, so
    // the regex captures it. Common code paths hit by this:
    // - navigation guards: `to.meta.requireRecheck = true` in a guard
    // - components: `route.meta.cached = …` to memoize per-route
    // - middleware: assignments to `ctx.route.meta.*`
    // Fix shape: never write THROUGH route.meta. Put per-navigation
    // state in your own store / context / signal.
    pattern: /Cannot assign to read only property '(\w+)' of object '#<Object>'/,
    diagnose: (m) => ({
      cause: `Attempted to write '${m[1]}' to a frozen object. If this came from \`route.meta.${m[1]} = …\` or similar, ResolvedRoute.meta is frozen and shared across every navigation through the same matched route — mutation would silently poison the cache, so the framework freezes it at flatten time.`,
      fix: "Don't write through `route.meta`. Move the per-navigation state to your own store, context, or signal. If you need a route-specific default, define `meta` on the route record itself (read-only by design) and read it via `useRoute().meta.X`.",
      fixCode: `// BAD — throws TypeError, meta is frozen + shared across navigations:
// (route.meta as any).viewedAt = Date.now()

// GOOD — per-navigation state in your own store:
const viewedAt = signal<number | null>(null)
onBeforeRouteEnter(() => { viewedAt.set(Date.now()) })`,
    }),
  },
  {
    // runtime-dom URL-injection guard. The warning fires when a
    // javascript:/data: URL is dropped from a URL-bearing attribute
    // (href/src/action/formaction/poster/cite/data). data:image/* is allowed
    // on image elements (<img>/<source>/<video> via src/srcset/poster) — this
    // is why <Image>/<OptimizedImage> blur+color placeholders work; the
    // post-0.28.0 fix stopped this guard from over-blocking them.
    pattern: /Blocked unsafe URL in "(\w+)" attribute/,
    diagnose: (m) => ({
      cause: `A \`javascript:\` or \`data:\` URL was blocked in the "${m[1]}" attribute to prevent injection. \`data:image/*\` URIs are allowed ONLY on image elements (\`<img>\`/\`<source>\`/\`<video>\` via \`src\`/\`srcset\`/\`poster\`); \`data:text/html\` on \`<iframe>\`/\`<object>\`, scripted SVG (\`<script>\`/\`on*=\`), \`data:\` on \`<a href>\`/\`<form action>\`, and \`javascript:\` anywhere stay blocked.`,
      fix: 'For an image/placeholder data URI, render it on an <img>/<source>/<video> src/srcset/poster. For everything else use a real URL — the runtime blocks javascript:/data: in URL attributes by design.',
      fixCode: `// ✓ allowed — image data URI on an image element:
<img src="data:image/webp;base64,UklGRvoA..." />
// ✓ allowed — scriptless SVG placeholder:
<img src="data:image/svg+xml,<svg>...</svg>" />

// ✗ blocked — data: on a navigable element:
// <a href="data:text/html,..." />
// ✗ blocked — scripted SVG:
// <img src="data:image/svg+xml,<svg onload=...>" />`,
    }),
  },
  {
    // mountFor LIS-scratch retention (fixed 2026-07): memory-growth symptom
    // when a large keyed list is reordered then filtered down.
    pattern: /(memory|heap|retained).*(For|list|rows).*(shrink|filter|grow|leak)|removed rows.*(retain|pinned|memory|leak)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before the LIS-scratch release fix, `<For>`\u2019s reorder scratch retained ForEntry references after each pass. A large reorder followed by a SHRINK (10k rows filtered to 50) left the stale scratch tail pinning every removed row\u2019s DOM subtree + cleanup closure for as long as the <For> stayed mounted.',
      fix: 'Upgrade `@pyreon/runtime-dom` — the scratch is now released (`entries.fill(undefined, 0, n)`) at the end of every reorder pass. No app code change needed.',
      fixCode: `// This access pattern no longer retains the removed 9,950 rows:
rows.set(tenThousandRows)   // large keyed <For>
rows.update(shuffle)        // reorder fills the LIS scratch
rows.set(filtered50)        // shrink — removed rows are now GC-eligible`,
    }),
  },
  {
    // SSR↔hydration parity fixes (2026-07 fuzz campaign): symptoms of the
    // OLD hydration behavior — duplicated lists, mismatches, or dynamic
    // content rendered wrong after hydration.
    pattern: /hydrat.*(duplicat|twice|doubled|wrong order)|<For>.*(duplicat|twice|doubled).*hydrat|\[object Object\].*(hydrat|reactive|accessor)|SSR.*(duplicat|doubled).*hydrat/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` / `@pyreon/runtime-server` versions before the SSR↔hydration parity release, hydration had cursor/extent bugs: a `<For>` duplicated its list (fresh rows mounted while the SSR rows stayed), adjacent text-producing children (merged into one node by the HTML parser) misaligned the sibling cursor, a reactive accessor with a multi-root initial removed only ONE node before re-mounting, and a reactive text accessor that later yielded a VNode rendered `[object Object]`.',
      fix: 'Upgrade `@pyreon/runtime-dom` + `@pyreon/runtime-server` together. The SSR renderer now wraps reactive-accessor children in `<!--$-->…<!--/$-->` hydration range markers and hydration consumes them (plus the `<!--pyreon-for-->` block) as a unit; a shared `bindPolymorphicText` upgrades a text binding to a subtree mount when the value stops being text. No app code change needed. NOTE: reactive-accessor children now carry `<!--$-->` comment markers in SSR output — update any snapshot/string assertions on SSR HTML for dynamic content to account for them.',
      fixCode: `// All correct after upgrade — no code change:
<ul><For each={rows} by={r => r.id}>{r => <li>{r.name}</li>}</For></ul>  // no dup on hydrate
<div>{count()}{' items'}</div>                                            // adjacent text OK
{() => loading() ? 'Loading…' : <Table/>}                                 // text→VNode OK`,
    }),
  },
  {
    // VNode-array-child fix: a VNode[] interpolated as a bare `{arr}` child of
    // a DOM element renders "[object Object],[object Object]". No exception —
    // behavioral, so match the pasted symptom words.
    pattern:
      /\[object Object\](,\[object Object\])+|\[object Object\].*(array|list|map|children|render)|(array|list|\.map|vnode).*renders?.*\[object Object\]/i,
    diagnose: () => ({
      cause:
        'A VNode ARRAY interpolated as a bare `{arr}` child of a DOM element — `const arr = [<a/>, <b/>]` or `const rows = items.map(i => <li/>)` then `<div>{arr}</div>` — was baked to `element.textContent = arr`, which stringifies the array to "[object Object],[object Object]". The single-VNode case (`const v = <x/>; {v}`) already mounted; array/map const children did not, because the compiler only tracked a DIRECT JSX-element initializer as mountable.',
      fix: 'Upgrade `@pyreon/compiler` (+ `@pyreon/runtime-dom`) — the compiler now classifies array-of-JSX and map-of-JSX const initializers as VNODE COLLECTIONS and mounts them via `_mountSlot` → `mountChild` (which renders arrays element-by-element). No app code change needed for an array LITERAL or a `.map()` const. If the array comes from a function call the compiler cannot statically see (`const arr = getVNodes()`), inline the `.map()` at the JSX site (`<div>{items.map(i => <li/>)}</div>` — already mounted) or use `<For each={items} by={i => i.id}>`.',
      fixCode: `// Fixed by upgrade (statically visible array/map consts):
const arr = [<span>a</span>, <span>b</span>]; // -> mounts both spans
const rows = items.map((i) => <li>{i}</li>);  // -> mounts each <li>
<div>{arr}</div>; <ul>{rows}</ul>;
// For a function-returned array, inline the map or use <For>:
<div>{getItems().map((i) => <li>{i}</li>)}</div>
<ul><For each={items} by={(i) => i.id}>{(i) => <li>{i.name}</li>}</For></ul>`,
      related:
        'A bare `h()`-call const (`const v = h("span")`) is also not tracked (write JSX, or wrap in a JSX element). A single primitive/string const stays on the text fast path (correct).',
    }),
  },
  {
    // SVG className-assignment throw — a `class={…}` binding on an SVG element
    // (`<g>`, `<path>`, `<rect>`, …) inside a compiled template. Pre-fix the
    // template path emitted `el.className = …`, but on a real SVGElement
    // `className` is a read-only `SVGAnimatedString`, so the assignment threw
    // — which surfaced once `_tpl` learned to give SVG-rooted templates the
    // correct namespace (before that, the elements were HTML and the throw
    // was latent). Chromium: "Cannot set property className of #<SVGElement>
    // which has only a getter"; Firefox/WebKit: "setting getter-only property
    // className". The classic symptom is an `@pyreon/flow` diagram whose nodes
    // render but whose edge LINES do not.
    pattern:
      /className.*(getter|read-?only)|(getter|read-?only).*className|(className|class).*SVGElement|SVGElement.*(className|class)|(flow|svg|edge).*(lines?|edges?|paths?).*(not|missing|don'?t).*(render|show|draw)/i,
    diagnose: () => ({
      cause:
        "A `class={…}` binding on an SVG element (`<g>`/`<path>`/`<rect>`/…) in a compiled template used `element.className = …`. On an HTMLElement `className` is a writable string, but on an SVGElement it is a READ-ONLY `SVGAnimatedString`, so the assignment throws — the reactive binding effect throws, and (for a `<For>` of edges) the item is skipped, so the shape renders nothing. It stayed hidden until `_tpl` began parsing SVG-rooted templates in the correct namespace: before that the cloned `<g>`/`<path>` were HTML-namespaced (writable `className`, but inert / invisible).",
      fix: 'Upgrade `@pyreon/compiler` + `@pyreon/runtime-dom`. The compiler now emits `_setClass(el, value)` for every class binding (the runtime `applyClassProp`), which uses `setAttribute("class", …)` — valid on BOTH HTML and SVG — instead of `el.className = …`. No app code change is needed. If you cannot upgrade, avoid a reactive `class=` on SVG elements in templates; set the class via `setAttribute` in a `ref` callback, or wrap the SVG element so its class lives on an HTML ancestor.',
      fixCode: `// Fixed by upgrade — a reactive class on an SVG element now works:
<svg>
  <For each={edges} by={(e) => e.id}>
    {(e) => <path d={() => e.path()} class={() => (e.selected() ? 'sel' : '')} />}
  </For>
</svg>
// Pre-upgrade workaround (set class imperatively via setAttribute):
<path ref={(el) => effect(() => el.setAttribute('class', cls()))} />`,
      related:
        'Same family as the SVG-namespace `_tpl` fix: an SVG-rooted template string (`<g><path…`) was parsed as HTML and rendered nothing. Both ship together — flow edges need the namespace fix AND the `_setClass` fix to render.',
    }),
  },
  {
    // #2348 — component-child {props.x} frozen on PRE-fix compilers. The
    // stable-reference carve-out emitted props-backed reads BARE in component
    // CHILD position: the jsx() runtime fired the compiler-emitted `_rp`
    // getter once and the child froze, while the identical expression as a
    // component ATTR (`_rp(() => …)`) or under a DOM element
    // (`bindPolymorphicText`) stayed live. Fixed: props-backed stable refs
    // (props-member reads, splitProps holders, prop-derived consts) now emit
    // the `() => expr` accessor in child position; plain stable refs stay
    // bare. This entry teaches the RESIDUAL for apps pinned to older
    // compilers, where the accessor form is the manual fix.
    pattern:
      /(child(ren)?|component).*(frozen|stale|not.*(updat|react)|stuck)|(\{props\.[a-zA-Z_$][\w$]*\}).*(frozen|stale|not.*updat)|(frozen|stale).*(component.*child|\{props\.)/i,
    diagnose: () => ({
      cause:
        'A bare `{props.x}` (or a prop-derived const) as a COMPONENT child was emitted without an accessor wrap on compilers before the #2348 fix — the automatic JSX runtime read the reactive-prop getter ONCE at jsx() time, freezing the child, while the identical expression as a component attr (`label={props.x}`) stayed live via `_rp(() => …)`. The counter-intuitive split: the same `{props.x}` under a DOM element was live too.',
      fix: 'Upgrade `@pyreon/compiler` (the component-child props-backed stable-reference fix, issue #2348) — `{props.x}` in component-child position now compiles to the live accessor automatically. If you cannot upgrade, write the accessor form explicitly: `<Comp>{() => props.x}</Comp>` (and for prop-derived consts, `<Comp>{() => myDerived}</Comp>`).',
      fixCode: `// Pinned-compiler workaround — make the child an explicit accessor:
const B = (props) => <Heading label={props.title}>{() => props.title}</Heading>
// After upgrading, the bare form is live automatically:
const B = (props) => <Heading label={props.title}>{props.title}</Heading>`,
      related:
        'Component ATTRS and DOM-element children were always live — only the component-CHILD position was frozen. Plain (non-props) stable refs are still emitted bare deliberately: structural children consumers (kinetic-style VNode iteration) rely on `resolveChildren` for function children.',
    }),
  },
]

/** Diagnose an error message and return structured fix information */
export function diagnoseError(error: string): ErrorDiagnosis | null {
  for (const { pattern, diagnose } of ERROR_PATTERNS) {
    const match = error.match(pattern)
    if (match) {
      return diagnose(match)
    }
  }
  return null
}
