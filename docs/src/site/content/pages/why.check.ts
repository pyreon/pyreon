// Written by scripts/sync-site-content.ts from content/_why.json. Do not edit: re-run the sync.
// Typecheck only (never imported): fails when _why.json does not match WhyFile.
import type { WhyFile } from '../types-site'

export const checked = {
  "pages": [
    {
      "id": "components-run-once",
      "route": "/why/components-run-once",
      "title": "Components run once",
      "hook": {
        "eyebrow": "Fine-grained reactivity",
        "title": "Your component runs once. Ever.",
        "lede": "Delete `useMemo`. Delete `useCallback`. Delete every dependency array. A Pyreon component runs when it mounts, and a signal change updates the one DOM node that shows it, so there is nothing left to memoise.",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "sections": [
        {
          "kind": "proof",
          "title": "Skipping the work shows up on the clock.",
          "stats": [
            {
              "stat": "2.6×",
              "label": "faster than React 19 at creating 10,000 rows (72.6 ms vs 192.0 ms)",
              "condition": "final pass, two runs · Apple M3 Max · real Chromium · synthetic, author-run",
              "source": "BENCHMARKS.md §1"
            },
            {
              "stat": "2.4×",
              "label": "faster than React 19 at toggling 1,000 todos in a TodoMVC-shaped app (4.60 ms vs 11.41 ms)",
              "condition": "overnight run, one run · Apple M3 Max · synthetic, author-run",
              "source": "BENCHMARKS.md §6"
            },
            {
              "stat": "2.0–2.1×",
              "label": "faster effect propagation than Preact Signals (1,407 vs 2,874 ns, V8)",
              "condition": "final pass, two runs · Node (V8) · Apple M3 Max · synthetic, author-run",
              "source": "BENCHMARKS.md §8"
            }
          ],
          "note": "Also from the same record: clearing 1,000 todos runs 3–4× faster than React 19 (one run), and the reactivity core beats Preact Signals on batching (1.94–1.95×) and the computed diamond (1.30–1.31×) on V8, two runs. Reproduce any of it from /benchmarks."
        },
        {
          "kind": "diff",
          "title": "The code you delete.",
          "before": {
            "label": "React 19",
            "code": "import { memo, useCallback, useMemo, useState } from 'react'\n\nconst Controls = memo(function Controls({ onAdd }: { onAdd: () => void }) {\n  return <button onClick={onAdd}>+1</button>\n})\n\nexport function Counter() {\n  const [count, setCount] = useState(0)\n  const [log, setLog] = useState<{ id: number; at: number }[]>([])\n  const doubled = useMemo(() => count * 2, [count])\n  const add = useCallback(() => {\n    setCount((c) => c + 1)\n    setLog((l) => [...l, { id: l.length, at: Date.now() }])\n  }, [])\n\n  return (\n    <div>\n      <Controls onAdd={add} />\n      <p>{count} × 2 = {doubled}</p>\n      {count > 9 && <p>Double digits.</p>}\n      <ul>\n        {log.map((e) => (\n          <li key={e.id}>{new Date(e.at).toLocaleTimeString()}</li>\n        ))}\n      </ul>\n    </div>\n  )\n}"
          },
          "after": {
            "label": "Pyreon",
            "code": "import { signal, computed } from '@pyreon/reactivity'\nimport { For, Show } from '@pyreon/core'\n\nfunction Controls(props: { onAdd: () => void }) {\n  return <button onClick={props.onAdd}>+1</button>\n}\n\nexport function Counter() {\n  const count = signal(0)\n  const log = signal<{ id: number; at: number }[]>([])\n  const doubled = computed(() => count() * 2)\n  const add = () => {\n    count.update((c) => c + 1)\n    log.update((l) => [...l, { id: l.length, at: Date.now() }])\n  }\n\n  return (\n    <div>\n      <Controls onAdd={add} />\n      <p>{count()} × 2 = {doubled()}</p>\n      <Show when={() => count() > 9}>\n        <p>Double digits.</p>\n      </Show>\n      <ul>\n        <For each={log} by={(e) => e.id}>\n          {(e) => <li>{new Date(e.at).toLocaleTimeString()}</li>}\n        </For>\n      </ul>\n    </div>\n  )\n}"
          },
          "caption": "Same counter, same derived value, same list. On the left, `memo`, `useMemo` and `useCallback` exist only to tell React what not to redo. On the right, `add` is a plain function created once, `computed` tracks its own dependencies, and `<For>` keys rows with `by`. No dependency array anywhere, because a signal records who read it."
        },
        {
          "kind": "story",
          "title": "Zero re-renders, by construction.",
          "text": [
            "In React the counter body runs on every click. It builds a new element tree and the reconciler diffs it against the old one to find a single changed character. That is why `useMemo`, `useCallback`, `memo` and dependency arrays exist: every value in the body is recreated on each render, so you have to say which ones are stable.",
            "In Pyreon the body runs once, at mount. A handler defined in the body is created once. A `computed()` is created once and tracks what it reads. When `count` changes, `count` notifies the text node bound to it, and nothing else in the tree is visited.",
            "You lose the afternoon you used to spend on \"why did this re-render?\". There is no second render to ask about."
          ]
        },
        {
          "kind": "code",
          "title": "Ten lines in, one binding out.",
          "text": "This is what `transformJSX` from `@pyreon/compiler` emits for a counter. The static markup becomes a cached template string. The only dynamic part is one line: `_bindText(count, __t2)` subscribes that text node straight to the signal. Clicking `+` writes one text node, and that is the whole update.",
          "blocks": [
            {
              "label": "You write",
              "lang": "tsx",
              "code": "import { signal } from '@pyreon/reactivity'\n\nfunction Counter() {\n  const count = signal(0)\n  return (\n    <div>\n      <button onClick={() => count.update((n) => n - 1)}>-</button>\n      <span>{count()}</span>\n      <button onClick={() => count.update((n) => n + 1)}>+</button>\n    </div>\n  )\n}"
            },
            {
              "label": "The compiler emits",
              "lang": "js",
              "code": "import { _tpl, _bindText } from \"@pyreon/runtime-dom\";\nimport { signal } from '@pyreon/reactivity'\n\nfunction Counter() {\n  const count = signal(0)\n  return _tpl(\"<div><button>-</button><span> </span><button>+</button></div>\", (__root) => {\n    const __e0 = __root.firstElementChild;\n    const __e1 = __e0.nextElementSibling;\n    const __t2 = __e1.firstChild;\n    const __e3 = __e1.nextElementSibling;\n    __e0.__ev_click = () => count.update((n) => n - 1);\n    const __d0 = _bindText(count, __t2);\n    __e3.__ev_click = () => count.update((n) => n + 1);\n    return __d0\n  })\n}"
            }
          ],
          "caption": "Unedited compiler output apart from indentation and the parentheses around the returned template. Paste any component into `transformJSX` and read what comes back."
        },
        {
          "kind": "compare-strip",
          "title": "What replaces what.",
          "items": [
            {
              "label": "state",
              "before": "`const [n, setN] = useState(0)`",
              "after": "`const n = signal(0)`"
            },
            {
              "label": "derived value",
              "before": "`useMemo(() => n * 2, [n])`",
              "after": "`computed(() => n() * 2)`"
            },
            {
              "label": "stable handler",
              "before": "`useCallback(fn, [deps])`",
              "after": "a plain function"
            },
            {
              "label": "skip a child render",
              "before": "`memo(Child)`",
              "after": "nothing: children never re-render"
            },
            {
              "label": "update",
              "before": "`setN((n) => n + 1)`",
              "after": "`n.update((v) => v + 1)`"
            },
            {
              "label": "keyed list",
              "before": "`items.map((i) => <li key={i.id}>…)`",
              "after": "`<For each={items} by={(i) => i.id}>`"
            },
            {
              "label": "conditional",
              "before": "`{cond && <p/>}`",
              "after": "`<Show when={() => cond()}>`"
            }
          ]
        },
        {
          "kind": "steps",
          "title": "Watch it happen in your own app.",
          "items": [
            {
              "title": "Open the reactive overlay",
              "text": "Press `Ctrl+Shift+R` in any dev build (or call `$p.reactivity()` in the console). It is built into `@pyreon/runtime-dom` and tree-shaken from production builds, so there is nothing to install."
            },
            {
              "title": "Read the Health and Activity tabs",
              "text": "Health lists orphan signals, high fan-out and deep chains. Activity shows the latest updates with the chain of writes that caused each one."
            },
            {
              "title": "Press Pick, then click a value",
              "text": "In the Inspect tab, press Pick (or call `$p.pick()`) and click text bound to a single signal or computed. The panel shows that signal and its change chain. Text built from several signals shows nothing, by design: the link is recorded exactly when the binding is made, never guessed."
            }
          ]
        },
        {
          "kind": "list",
          "title": "Live or static, decided before you run anything.",
          "text": "The Reactivity Lens prints the compiler's own verdict next to every JSX expression in your editor, served by `pyreon-lint --lsp`.",
          "items": [
            {
              "title": "`live`",
              "text": "Reads a signal in a tracked position. It updates."
            },
            {
              "title": "`live·prop`",
              "text": "A reactive component prop, wired as a getter on `props`."
            },
            {
              "title": "`live·attr`",
              "text": "An attribute that re-evaluates when its signals change."
            },
            {
              "title": "`static`",
              "text": "Evaluated once. If you expected `live`, you just found the bug."
            },
            {
              "title": "`hoisted`",
              "text": "A provably static subtree lifted to module scope."
            }
          ]
        },
        {
          "kind": "quote",
          "text": "Signal reads inside reactive scopes re-evaluate when the signal changes. Signal reads outside reactive scopes evaluate once and become static.",
          "attribution": "Pyreon docs",
          "href": "/docs/reactivity-rules"
        },
        {
          "kind": "list",
          "title": "The rules, straight.",
          "text": "Run-once has a small set of rules. They are what the compiler emits, and the lint rules and the Lens catch the common slips.",
          "items": [
            {
              "title": "Destructuring props captures once",
              "text": "`const { name } = props` copies the value at setup, so the text never changes. Read `props.name`, or use `splitProps(props, ['name'])`, whose pieces keep their getters."
            },
            {
              "title": "A `const` derived from props stays live",
              "text": "`const name = props.name ?? 'stranger'` is inlined at its JSX use site and re-reads `props.name`. A `let` is never inlined."
            },
            {
              "title": "An early return runs once",
              "text": "`if (loading()) return <Skeleton />` pins the component to whichever branch was true at mount. Use `<Show when={loading} fallback={…}>`, or return an accessor."
            },
            {
              "title": "Write with `.set()`, not a call",
              "text": "`count(5)` is a read that ignores its argument. `count.set(5)` and `count.update(fn)` write."
            },
            {
              "title": "Prefer plain JavaScript? Opt in to Plain Mode",
              "text": "Plain Mode is an opt-in compile-time dialect: `'use plain'` at the top of a file (or `pyreon({ plain: true })` app-wide) lets you write `let count = state(0); count++`. Destructured props stay live and early returns on a reactive condition become reactive. It compiles to the same signal code.",
              "code": "'use plain'\nimport { state, derived } from '@pyreon/core/plain'\n\nlet count = state(0)\nconst double = derived(count * 2)\n\nexport function Counter({ label, step = 1 }: { label: string; step?: number }) {\n  return <button onClick={() => { count += step }}>{label}: {count} / {double}</button>\n}"
            }
          ]
        },
        {
          "kind": "note",
          "text": "We publish where we lose, so you can trust where we win: in the same record Solid mounts a deep 2,047-component tree 1.15–1.18× faster, creating a signal is about 5× slower than in Preact Signals, and the same keyed-table app is 17.2 KB gzip against Solid's 7.5 KB.",
          "href": "/benchmarks"
        },
        {
          "kind": "faq",
          "title": "Questions a React developer asks.",
          "items": [
            {
              "q": "Is this just Solid?",
              "a": "Same run-once model, and we are happy to say so. The compiler does more of the wiring: a bare signal read binds the signal itself with no closure, signal reads in component props become getters, and a `const` derived from props is inlined so it stays reactive."
            },
            {
              "q": "Can hooks be conditional?",
              "a": "Yes. React identifies hooks by call order across renders. Pyreon has no second render, so a hook is an ordinary call made during setup. What you cannot do is call one after setup: inside a click handler, a `setTimeout` or after an `await`."
            },
            {
              "q": "What about a list?",
              "a": "`<For each={items} by={(i) => i.id}>`. The key prop is `by`, because JSX reserves `key`. Each row's bindings are separate, so toggling one todo touches one attribute on one `<li>`, and reordering moves existing nodes by key."
            },
            {
              "q": "How do I know a value is live?",
              "a": "Look at the Lens hint in your editor. It is the compiler's own `live` or `static` verdict for that expression, so it shows what the build will do. `pyreon check` catches the common slips, such as destructured props, before you commit."
            }
          ]
        },
        {
          "kind": "links",
          "title": "Go deeper.",
          "items": [
            {
              "label": "Reactivity rules",
              "href": "/docs/reactivity-rules",
              "text": "Every edge case, one page."
            },
            {
              "label": "Reactivity Lens",
              "href": "/docs/reactivity-lens",
              "text": "The live/static hints in your editor."
            },
            {
              "label": "Devtools",
              "href": "/docs/devtools",
              "text": "The reactive overlay and the picker."
            },
            {
              "label": "Plain Mode",
              "href": "/docs/plain-mode",
              "text": "The opt-in dialect, law by law."
            },
            {
              "label": "Benchmarks",
              "href": "/benchmarks",
              "text": "Every number on this page, with its run."
            }
          ]
        }
      ],
      "end": {
        "title": "The best re-render is the one that never happens.",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "share": {
        "ogTitle": "Your component runs once. Ever.",
        "ogSub": "Delete useMemo, useCallback and every dependency array. 2.6× faster than React at 10,000 rows (synthetic, author-run)."
      },
      "sources": [
        {
          "claim": "Create 10,000 rows: Pyreon 72.64 ms vs React 19 192.01 ms (2.64×), two runs",
          "path": "BENCHMARKS.md §1 (record 2026-11-05)"
        },
        {
          "claim": "TodoMVC toggle-1000 4.60 vs 11.41 ms (2.48×), clear-1000 3–4×, one run",
          "path": "BENCHMARKS.md §6 real-bench"
        },
        {
          "claim": "Reactivity V8: effect 2.04–2.13×, batch 1.94–1.95×, diamond 1.30–1.31× vs Preact; creation loss 4.8×",
          "path": "BENCHMARKS.md §8"
        },
        {
          "claim": "Deep tree Solid 1.15–1.18×; bundle 17.2 vs Solid 7.5 KB",
          "path": "BENCHMARKS.md §2, §7, §13"
        },
        {
          "claim": "Counter compiles to _tpl + _bindText(count, __t2)",
          "path": "packages/core/compiler (transformJSX); post 05-blog/B01-components-run-once.md"
        },
        {
          "claim": "Pyreon counter in the diff compiles and passes MCP validate with no findings",
          "path": "packages/core/compiler/src/index.ts transformJSX; @pyreon/mcp validate (run 11 Nov)"
        },
        {
          "claim": "Reactive overlay: Ctrl+Shift+R, Health/Activity/Inspect, Pick on single-signal text, tree-shaken from production",
          "path": "packages/core/runtime-dom/src/devtools.ts; docs/src/content/docs/devtools.md"
        },
        {
          "claim": "Lens hints live, live·prop, live·attr, static, hoisted via pyreon-lint --lsp",
          "path": "docs/src/content/docs/reactivity-lens.md"
        },
        {
          "claim": "Reactivity rule quote",
          "path": "docs/src/content/docs/reactivity-rules.md line 14"
        },
        {
          "claim": "Destructured props capture once; const-from-props inlined; let not; early returns run once; key prop is by",
          "path": "AGENTS.md \"Components run once\"; docs/src/content/docs/reactivity-rules.md"
        },
        {
          "claim": "Plain Mode opt-in via use plain / @pyreon/core/plain / pyreon({ plain: true }); example code",
          "path": "docs/src/content/docs/plain-mode.md; packages/core/compiler/src/plain.ts"
        }
      ]
    },
    {
      "id": "one-codebase",
      "route": "/why/one-codebase",
      "title": "One codebase",
      "hook": {
        "eyebrow": "Web · iOS · Android",
        "title": "One .tsx file. A website, an iPhone app and an Android app.",
        "lede": "Write a component once in TypeScript. Pyreon renders it fine-grained on the web and compiles it to real SwiftUI and real Jetpack Compose, so each phone draws it with its own UI toolkit. The native targets are experimental, and this page says exactly what that means.",
        "cta": {
          "label": "Scaffold web + iOS + Android",
          "command": "npm create @pyreon/multiplatform@latest"
        }
      },
      "sections": [
        {
          "kind": "code",
          "title": "Same source. Three idiomatic outputs.",
          "text": "The counter every new multiplatform project starts with. On the web, Vite builds it against `@pyreon/runtime-dom`. Through `pyreon-native`, the same file becomes SwiftUI and Compose that Xcode and Gradle build like any other code.",
          "blocks": [
            {
              "label": "src/App.tsx",
              "lang": "tsx",
              "code": "// src/App.tsx, as scaffolded by @pyreon/create-multiplatform\nimport { signal } from '@pyreon/reactivity'\nimport { Stack, Text, Button } from '@pyreon/primitives'\n\nexport function App() {\n  const count = signal(0)\n  return (\n    <Stack gap=\"md\" align=\"center\">\n      <Text data-testid=\"count\">{count}</Text>\n      <Button data-testid=\"increment\" onPress={() => count.set(count() + 1)}>Increment</Button>\n    </Stack>\n  )\n}"
            },
            {
              "label": "iOS · SwiftUI",
              "lang": "swift",
              "code": "struct App: View {\n  @State private var count: Int = 0\n  var body: some View {\n    VStack(alignment: .center, spacing: 12) {\n      Text(verbatim: \"\\(count)\").accessibilityIdentifier(\"count\")\n      Button(\"Increment\") { count = count + 1 }.accessibilityIdentifier(\"increment\")\n    }\n  }\n}"
            },
            {
              "label": "Android · Jetpack Compose",
              "lang": "kotlin",
              "code": "@Composable\nfun App() {\n  var count by remember { mutableStateOf(0L) }\n  Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {\n    Text(text = \"${count}\", modifier = Modifier.testTag(\"count\"))\n    Button(onClick = { count = count + 1L }, modifier = Modifier.testTag(\"increment\")) {\n      Text(\"Increment\")\n    }\n  }\n}"
            }
          ],
          "caption": "Unedited compiler output, minus the import preamble and a one-line Kotlin helper. A signal becomes `@State` on iOS and `mutableStateOf` on Android; `data-testid` becomes an accessibility identifier and a test tag."
        },
        {
          "kind": "story",
          "title": "Experimental, stated plainly.",
          "text": [
            "The multiplatform docs call PMTC, the Pyreon Multi-Target Compiler, \"experimental — demo-quality, not production-ready\". We mean it. The web framework is pre-1.0; the native targets are a step behind that.",
            "What is device-proven is measured, not described: the multiplatform page carries a weighted capability matrix that credits a capability only when a test on a real iOS Simulator or Android emulator asserts it, and a CI gate recomputes the headline from the table. Check the rows your app needs before you commit."
          ]
        },
        {
          "kind": "compare-strip",
          "title": "Your primitives become their platform's own views.",
          "items": [
            {
              "label": "`<Stack>`",
              "before": "iOS: `VStack`",
              "after": "Android: `Column`"
            },
            {
              "label": "`<Inline>`",
              "before": "iOS: `HStack`",
              "after": "Android: `Row`"
            },
            {
              "label": "`<Field>`",
              "before": "iOS: `TextField` (`SecureField` for passwords)",
              "after": "Android: `TextField`"
            },
            {
              "label": "`<Toggle>`",
              "before": "iOS: `Toggle`",
              "after": "Android: `Switch`"
            },
            {
              "label": "`<Modal>`",
              "before": "iOS: `.sheet`",
              "after": "Android: `Dialog`"
            },
            {
              "label": "`<Scroll><For>`",
              "before": "iOS: `ScrollView { LazyVStack }`",
              "after": "Android: `LazyColumn`"
            },
            {
              "label": "`signal` / `computed`",
              "before": "iOS: `@State` / `@Observable`",
              "after": "Android: `mutableStateOf` / `derivedStateOf`"
            }
          ]
        },
        {
          "kind": "list",
          "title": "What lowers to native.",
          "text": "PMTC compiles your component source. It does not transpile npm packages to Swift or Kotlin: a package reaches the phone when its logic has a Swift/Kotlin runtime port the compiler recognises.",
          "items": [
            {
              "title": "The canonical primitives",
              "text": "`Stack`, `Inline`, `Scroll`, `Text`, `Button`, `Field`, `Toggle`, `Modal` and the rest, each with a real DOM implementation on the web and SwiftUI and Compose output natively. The next release brings the set to 22 with `Select`, `Tabs`, `Split`, `Canvas` and `Gesture`."
            },
            {
              "title": "The reactive core",
              "text": "`signal`, `computed`, typed props, `<For>`, `<Show>`, `if` and ternaries, array and string methods, object types as structs and data classes."
            },
            {
              "title": "Logic packages with native ports",
              "text": "`@pyreon/store`, `machine`, `state-tree`, `i18n`, `permissions`, `form`, `storage`, `flow`, the router, and `@pyreon/charts`, which draws to a native canvas."
            },
            {
              "title": "Device hooks",
              "text": "`useFetch`, `useOnline`, `useAppState`, `useClipboard`, `useColorScheme`, `useGeolocation`, `useHaptics`, `useShare`. For anything else, `useNativeModule('Name')` compiles to a Swift or Kotlin class you write."
            }
          ]
        },
        {
          "kind": "list",
          "title": "New on main, shipping in the next release.",
          "text": "Plain TypeScript that used to stop a native build now compiles. Each lowering is documented row by row on the multiplatform page.",
          "items": [
            {
              "title": "`effect()` in a component body",
              "text": "Runs when the view appears and again when a signal it reads changes (`.onAppear` + `.onChange(of:)` on iOS, a keyed effect in Compose). A returned cleanup runs as on the web.",
              "status": "next release"
            },
            {
              "title": "Timers",
              "text": "`setTimeout`, `setInterval` and their `clear…` twins lower to a `PyreonTimers` runtime. On iOS a timer keeps firing during a scroll, as in a browser.",
              "status": "next release"
            },
            {
              "title": "`Date`, enums and module-scope signals",
              "text": "`new Date(…)`, `Date.parse`, the getters and `toISOString` lower (a date is its epoch milliseconds). String enums become native enums. A file's module-scope `signal()` / `computed()` become one observable singleton per file.",
              "status": "next release"
            },
            {
              "title": "`throw`, `try` / `catch` / `finally`, `JSON.parse`",
              "text": "Error handling lowers in helper, handler and computed bodies. `JSON.parse` becomes a typed, throwing native decode, and a `@pyreon/validate` schema's `.parse(x)` returns the same `{ ok, value, issues }` it returns on the web, never throwing.",
              "status": "next release"
            },
            {
              "title": "`<Select>` and date/time `<Field>`",
              "text": "`<Select>` uses each platform's own picker. `<Field kind=\"date\" | \"time\" | \"datetime\">` with `min` / `max` opens iOS `DatePicker` and the Material 3 pickers on Android.",
              "status": "next release"
            },
            {
              "title": "More hooks",
              "text": "`useDocumentVisibility`, `usePrevious`, `useUpdateEffect`, `useReducedMotion`, `useKeyboard`, `useInfiniteQuery`, `useLatest` and a colour-scheme `useMediaQuery` now lower to iOS and Android.",
              "status": "next release"
            }
          ]
        },
        {
          "kind": "list",
          "title": "What stays on the web, and how you know.",
          "text": "Every package manifest declares a `multiplatform.tier` with a rationale: `shared`, `service-backend` or `web-only`. The docs and the MCP server read the same field. Several web-first packages still lower part of their API, so read each package's tier rather than guessing.",
          "items": [
            {
              "title": "`@pyreon/table`",
              "text": "The TanStack-backed `useTable` stays web; the dependency-free `createTableState` engine crosses."
            },
            {
              "title": "`@pyreon/dnd`",
              "text": "The page-wide drag monitor stays web; `useSortable`, `useDraggable` and `useDroppable` cross."
            },
            {
              "title": "`@pyreon/hotkeys`",
              "text": "The DOM shortcut registry stays web; the `useHotkey` hook crosses."
            },
            {
              "title": "`@pyreon/code`",
              "text": "CodeMirror is a DOM editor, so it stays web. The `<WebView>` primitive can host it on a phone with a two-way data bridge."
            }
          ]
        },
        {
          "kind": "code",
          "title": "When the compiler says no, it says why.",
          "text": "Code outside the native subset gets a named warning, per construct and per target, with the fix. The docs say this is what you get \"almost always\", and `check --typecheck` runs a real `swiftc -typecheck` for the rest.",
          "blocks": [
            {
              "label": "npx pyreon-native check (abridged)",
              "lang": "text",
              "code": "! Totals.tsx [swift] Component Totals: a top-level `for` statement has no native\n  lowering and was DROPPED — … Move loops/switch into a helper function that takes\n  parameters (they DO lower there) …\n! Totals.tsx [swift] <div> is a DOM/SVG element with no native lowering … Use the\n  shared vocabulary from `@pyreon/primitives` (Stack, Text, Image, …), keep web-only\n  markup inside a `<Web>` branch.\nchecked 1 file(s) [swift, kotlin] — 0 error(s), 4 warning(s)"
            }
          ]
        },
        {
          "kind": "steps",
          "title": "Tested on simulators and emulators, in CI.",
          "items": [
            {
              "title": "Type-checked against SDK stubs",
              "text": "On every PR that touches the native surface, emitted Swift and Kotlin are type-checked."
            },
            {
              "title": "Built with real Xcode and Gradle",
              "text": "The example apps (`native-todomvc`, `native-tasks`, `native-finance`, a router demo, a counter) build for real."
            },
            {
              "title": "Driven on devices",
              "text": "`iOS — xcodebuild` runs XCUITest on a Simulator and `Android — gradlew` runs Compose instrumented tests on an emulator, plus an R8-minified release lane. Both are required checks when native paths change."
            }
          ]
        },
        {
          "kind": "steps",
          "title": "From zero to three apps.",
          "items": [
            {
              "title": "Scaffold",
              "text": "Web needs Bun or Node. iOS needs macOS, Xcode and xcodegen. Android needs JDK 17, the Android SDK and `gradle` on `PATH`.",
              "code": "npm create @pyreon/multiplatform@latest my-app\ncd my-app\nnpm install"
            },
            {
              "title": "Build the web first",
              "text": "Layout, logic and styling with hot reload that keeps your module-level signal values. Nothing in the web build needs Xcode or Gradle.",
              "code": "npm run dev"
            },
            {
              "title": "Ask the compiler, then the device",
              "text": "`check` answers \"will this run on the device?\" in milliseconds; `dev` rebuilds, reinstalls and relaunches.",
              "code": "npx pyreon-native check --watch --source=src\nnpx pyreon-native dev --target=ios"
            }
          ]
        },
        {
          "kind": "faq",
          "title": "Questions a mobile lead asks.",
          "items": [
            {
              "q": "Is there a JavaScript runtime on the phone?",
              "a": "Not for your UI. The primitives compile to SwiftUI and Compose views. A web-only pane, such as a code editor, can be hosted in the `<WebView>` primitive when you choose to, and pays WebView startup cost."
            },
            {
              "q": "Is it ready for production?",
              "a": "No. The native targets are experimental. Use the capability matrix on the multiplatform page to see which capabilities are asserted on devices in CI, and treat the rest as unproven."
            },
            {
              "q": "Does my AI assistant know the native rules?",
              "a": "The multiplatform scaffold writes `AGENTS.md`, `CLAUDE.md` and `.mcp.json`, and switches on the `portable` lint rules for `src/`, so the editor flags non-portable code before you build."
            }
          ]
        },
        {
          "kind": "links",
          "title": "Go deeper.",
          "items": [
            {
              "label": "Multi-platform",
              "href": "/docs/multiplatform",
              "text": "Status, every lowering, and the capability matrix."
            },
            {
              "label": "Primitives",
              "href": "/docs/primitives",
              "text": "The primitive vocabulary and its mappings."
            },
            {
              "label": "Native dev loop",
              "href": "/docs/native-dev-loop",
              "text": "`pyreon-native check` and `dev`."
            },
            {
              "label": "Library status",
              "href": "/docs/multiplatform-libraries",
              "text": "Which packages lower, and how far."
            }
          ]
        }
      ],
      "end": {
        "title": "Write it once in TypeScript. Ship it fine-grained to the web, iOS and Android.",
        "cta": {
          "label": "Scaffold web + iOS + Android",
          "command": "npm create @pyreon/multiplatform@latest"
        }
      },
      "share": {
        "ogTitle": "One .tsx file. Three apps.",
        "ogSub": "A website, real SwiftUI and real Jetpack Compose from the same component. Experimental, device-tested in CI."
      },
      "sources": [
        {
          "claim": "Counter App.tsx and its Swift/Kotlin output",
          "path": "packages/zero/create-multiplatform templates; post 05-blog/B09-one-tsx-three-platforms.md (unedited compiler output)"
        },
        {
          "claim": "Status \"experimental — demo-quality, not production-ready\"; weighted capability matrix gated in CI",
          "path": "docs/src/content/docs/multiplatform.md line 7; docs/src/content/docs/stability-and-direction.md"
        },
        {
          "claim": "Primitive and signal mappings",
          "path": "docs/src/content/docs/primitives.md; docs/src/content/docs/multiplatform.md"
        },
        {
          "claim": "22 canonical primitives incl. Select and Field kind date/time/datetime",
          "path": "AGENTS.md; docs/src/content/docs/primitives.md"
        },
        {
          "claim": "New lowerings since 5 Nov (#4134, #4136, #4154, #4146, #4155, #4100, #4101, #4102, #4056, #4057, hooks #4149–#4171)",
          "path": "docs/src/content/docs/multiplatform.md; packages/native/compiler/src/module-state.ts; 00-brief/facts.md \"What shipped since 5 Nov\""
        },
        {
          "claim": "multiplatform.tier shared | service-backend | web-only in every manifest",
          "path": "AGENTS.md \"Documentation is generated from manifests\"; scripts/check-multiplatform-tier.ts"
        },
        {
          "claim": "table/dnd/hotkeys/code split between web and native",
          "path": "packages/fundamentals/{table,dnd,hotkeys,code}/src/manifest.ts; post B09"
        },
        {
          "claim": "Named warnings \"almost always\"; check --typecheck runs swiftc",
          "path": "docs/src/content/docs/multiplatform.md; docs/src/content/docs/native-dev-loop.md"
        },
        {
          "claim": "Native device CI required checks (XCUITest, Compose, R8 lane)",
          "path": ".github/workflows/native-device.yml; .agents/guides/ci/README.md"
        },
        {
          "claim": "Scaffold writes AGENTS.md, CLAUDE.md, .mcp.json",
          "path": "docs/src/content/docs/stability-and-direction.md \"Directions\" item 4"
        }
      ]
    },
    {
      "id": "ai-ready",
      "route": "/why/ai-ready",
      "title": "AI-ready",
      "hook": {
        "eyebrow": "Built for AI assistants",
        "title": "Your AI writes a bug. The framework catches it.",
        "lede": "Your assistant has read more React than anything else, so its first Pyreon draft comes back React-shaped and compiles fine. Pyreon ships the tools it checks its work against: an MCP server with 24 tools, the compiler's live/static verdict in your editor, `pyreon check` and generated `llms.txt`.",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "sections": [
        {
          "kind": "proof",
          "title": "Counted, not claimed.",
          "stats": [
            {
              "stat": "24",
              "label": "MCP tools: get_api, validate, diagnose, explain_reactivity and more",
              "condition": "tool list checked against the docs page by a CI step",
              "source": "docs/src/content/docs/mcp.md"
            },
            {
              "stat": "140",
              "label": "lint rules in 26 categories in `@pyreon/lint`",
              "condition": "count from AGENTS.md on main",
              "source": "AGENTS.md"
            },
            {
              "stat": "0",
              "label": "network calls from the MCP server: no model inside, deterministic answers",
              "condition": "as documented",
              "source": "docs/src/content/docs/mcp.md"
            }
          ]
        },
        {
          "kind": "code",
          "title": "A plausible draft, caught before you see it.",
          "text": "Two bugs that are not syntax errors: a signal \"written\" by calling it, and a React `key` on a list. The button never counts, and the list never gets the `by` it needs. The assistant passes the draft to the MCP `validate` tool first.",
          "blocks": [
            {
              "label": "The draft",
              "lang": "tsx",
              "code": "import { signal } from '@pyreon/reactivity'\nimport { For } from '@pyreon/core'\n\nexport function App() {\n  const count = signal(0)\n  const items = signal([{ id: 1, t: 'a' }])\n  return (\n    <div>\n      <button onClick={() => count(count() + 1)}>{count()}</button>\n      <For each={items} key={(i) => i.id}>{(i) => <li>{i.t}</li>}</For>\n    </div>\n  )\n}"
            },
            {
              "label": "validate (real output, trimmed)",
              "lang": "text",
              "code": "Found 2 issues:\n\n1. **signal-write-as-call** (line 9)\n   `count(value)` does NOT write the signal — `signal()` is the read-only callable\n   surface and ignores its arguments. Use `count.set(value)` to assign or\n   `count.update((prev) => …)` to derive from the previous value. …\n   Current: `count(count() + 1)`\n   Fix: `count.set(count() + 1)`\n   Auto-fixable: yes\n\n2. **for-with-key** (line 10)\n   `key` on <For> is reserved by JSX for VNode reconciliation and is extracted\n   before the prop reaches the runtime. In Pyreon, use `by` for list identity.\n   Current: `key={(i) => i.id}`\n   Fix: `by={(i) => i.id}`\n   Auto-fixable: yes"
            }
          ],
          "caption": "Each finding carries its code, line, the offending text, the fix and an auto-fixable flag, so the assistant applies the fix instead of guessing."
        },
        {
          "kind": "list",
          "title": "Five tools, one source of truth.",
          "text": "The API answers come from the same per-package manifests that generate the docs and `llms.txt`, and CI fails when they drift.",
          "items": [
            {
              "title": "MCP server",
              "text": "`@pyreon/mcp` speaks JSON-RPC over stdio and never modifies your files. `validate` runs three detector families (React habits, Pyreon misuse, native-build hazards), including `props-destructured`, `signal-write-as-call`, `for-missing-by` and `array-map-jsx`. Configs are documented for Claude Code, Cursor and Windsurf."
            },
            {
              "title": "Reactivity Lens",
              "text": "`pyreon-lint --lsp` draws `live`, `live·prop`, `live·attr`, `static` and `hoisted` next to each JSX expression. Watch for `static` where you expected `live`: it reviews whatever your assistant just pasted."
            },
            {
              "title": "`pyreon check`",
              "text": "The terminal twin of `validate`. It scans git-changed files (or a folder), prints each finding with its fix, applies the auto-fixable ones with `--fix`, and exits non-zero, so it fits a pre-commit hook or a CI step."
            },
            {
              "title": "`@pyreon/lint`",
              "text": "140 rules in 26 categories, with an LSP server, watch mode and an AST cache. Silence one line with `// pyreon-lint-ignore <rule>`."
            },
            {
              "title": "`llms.txt`",
              "text": "`llms.txt` and `llms-full.txt` sit at the root of the repository, generated from the manifests. An assistant that cannot speak MCP reads them directly."
            }
          ]
        },
        {
          "kind": "code",
          "title": "Register it once.",
          "blocks": [
            {
              "label": ".mcp.json",
              "lang": "json",
              "code": "{\n  \"mcpServers\": {\n    \"pyreon\": { \"command\": \"bunx\", \"args\": [\"@pyreon/mcp\"] }\n  }\n}"
            },
            {
              "label": "Your terminal",
              "lang": "sh",
              "code": "pyreon check            # git-changed .ts/.tsx files\npyreon check src/       # a directory\npyreon check --fix      # apply the auto-fixable rewrites"
            }
          ]
        },
        {
          "kind": "steps",
          "title": "Or let the scaffold wire it.",
          "items": [
            {
              "title": "Pick your assistants",
              "text": "`--ai` takes `mcp`, `claude`, `cursor`, `copilot` and `agents`. The default, `mcp,claude`, writes `.mcp.json` and a `CLAUDE.md`; `copilot` writes `.github/copilot-instructions.md`.",
              "code": "npm create @pyreon/zero@latest my-app -- --ai mcp,claude,cursor"
            },
            {
              "title": "Approve the server",
              "text": "Open the app in your editor, approve the Pyreon MCP server, and ask for a feature. Watch what your assistant checks."
            }
          ]
        },
        {
          "kind": "quote",
          "text": "The server makes no network calls and runs no long scans at startup.",
          "attribution": "Pyreon docs",
          "href": "/docs/mcp"
        },
        {
          "kind": "faq",
          "title": "Where these tools stop.",
          "items": [
            {
              "q": "Do the detectors know my types?",
              "a": "No. They read syntax, not types, so a signal used in arithmetic without being called (`count + 1`) slips past them. TypeScript flags that one, so keep `tsc` in the loop."
            },
            {
              "q": "Does this make the model smarter?",
              "a": "No. It gives the model something to check its work against. Whether it calls the tools depends on the client and the prompt, which is why the scaffolds write the instructions for you."
            },
            {
              "q": "Is the Lens on the VS Code Marketplace?",
              "a": "Not yet. VS Code uses an extension from the repo; other editors register `pyreon-lint --lsp` by hand."
            }
          ]
        },
        {
          "kind": "links",
          "title": "Go deeper.",
          "items": [
            {
              "label": "MCP server",
              "href": "/docs/mcp",
              "text": "Every tool, with an example."
            },
            {
              "label": "Reactivity Lens",
              "href": "/docs/reactivity-lens",
              "text": "The hints, and how to enable them."
            },
            {
              "label": "CLI",
              "href": "/docs/cli",
              "text": "`pyreon check` and friends."
            },
            {
              "label": "llms.txt on GitHub",
              "href": "https://github.com/pyreon/pyreon/blob/main/llms.txt",
              "text": "Generated from the package manifests."
            }
          ]
        }
      ],
      "end": {
        "title": "We cannot change what a model was trained on. We can change what it checks its work against.",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "share": {
        "ogTitle": "Your AI writes a bug. Pyreon catches it.",
        "ogSub": "An MCP server with 24 tools, live/static hints in your editor, pyreon check and llms.txt. No network calls."
      },
      "sources": [
        {
          "claim": "24 MCP tools; check-mcp-docs keeps server, manifest and docs in sync",
          "path": "AGENTS.md \"The Pyreon MCP server\"; docs/src/content/docs/mcp.md; post B13"
        },
        {
          "claim": "No network calls; Claude Code, Cursor, Windsurf configs",
          "path": "docs/src/content/docs/mcp.md lines 6, 55–72, 96"
        },
        {
          "claim": "validate output for signal-write-as-call and for-with-key",
          "path": "post 05-blog/B13-built-for-ai-assistants.md (real tool output); packages/core/compiler/src/pyreon-intercept.ts"
        },
        {
          "claim": "Detectors: props-destructured, signal-write-as-call, for-missing-by, array-map-jsx; three detector families",
          "path": "packages/core/compiler/src/{pyreon-intercept,react-intercept}.ts; docs/src/content/docs/mcp.md"
        },
        {
          "claim": "140 lint rules, 26 categories; LSP, watch mode, AST cache",
          "path": "AGENTS.md \"Notable package facts\""
        },
        {
          "claim": "pyreon check scope, --fix, non-zero exit, pyreon-lint-ignore",
          "path": "docs/src/content/docs/cli.md; packages/core/compiler/src/detector-suppression.ts"
        },
        {
          "claim": "Lens hints and pyreon-lint --lsp; VS Code extension not on Marketplace",
          "path": "docs/src/content/docs/reactivity-lens.md; post B13"
        },
        {
          "claim": "llms.txt at repo root (pyreon.dev/llms.txt 404 on 10 Nov)",
          "path": "llms.txt; 00-brief/facts.md"
        },
        {
          "claim": "create-zero --ai values and defaults",
          "path": "packages/zero/create-zero/src/{args,templates}.ts"
        }
      ]
    },
    {
      "id": "performance",
      "route": "/why/performance",
      "title": "Performance",
      "hook": {
        "eyebrow": "Measured in public",
        "title": "2.6× faster than React. Don't trust us. Run it.",
        "lede": "Ten frameworks, real Chromium, every arm on its own fast path. Pyreon builds 10,000 rows in 72.6 ms against React 19's 192.0. Every number on our board comes with its run count and the command that reproduces it.",
        "cta": {
          "label": "See the full board",
          "href": "/benchmarks"
        }
      },
      "sections": [
        {
          "kind": "proof",
          "title": "The numbers that survived.",
          "stats": [
            {
              "stat": "2.6×",
              "label": "faster than React 19 creating 10,000 rows (72.6 vs 192.0 ms); 3.8× faster than Preact",
              "condition": "final pass, two runs · Apple M3 Max · real Chromium · synthetic, author-run",
              "source": "BENCHMARKS.md §1"
            },
            {
              "stat": "4×",
              "label": "less JavaScript than React for the same keyed-table app (17.2 KB vs 69.6 KB gzip)",
              "condition": "final pass, one run (sizes are deterministic)",
              "source": "BENCHMARKS.md §7"
            },
            {
              "stat": "6.5×",
              "label": "faster compiled server rendering than React 19 at 1,000 rows (109.9 vs 714.4 µs)",
              "condition": "overnight run, one run · Apple M3 Max · synthetic, author-run",
              "source": "BENCHMARKS.md §5"
            }
          ],
          "note": "Synthetic, author-run, Apple M3 Max. Absolute times are machine-dependent; compare ratios."
        },
        {
          "kind": "list",
          "title": "More from the same record.",
          "items": [
            {
              "title": "Clear rows: the outright row-board win",
              "text": "130 µs vs Vue 3.6 Vapor (RC) 145 µs, 1.11–1.12×, with confidence intervals disjoint in both runs."
            },
            {
              "title": "Tied for the lightest memory",
              "text": "Retained heap after the suite: Pyreon 3.08 MB and Preact 3.09 MB, ahead of Solid 3.16, Svelte 3.27, Vue 3 3.30 and React 3.50. Both runs."
            },
            {
              "title": "Hydration that leads",
              "text": "On a 320-component app page Pyreon hydrates in 4.02 ms, ahead of React (4.15), Preact (4.30) and Vue (4.47). One run."
            },
            {
              "title": "TodoMVC against React 19",
              "text": "Toggle 1,000 todos about 2.4× faster, clear 1,000 3–4× faster. One run."
            },
            {
              "title": "Signals against Preact Signals",
              "text": "Effect propagation 2.04–2.13×, batching 1.94–1.95×, the computed diamond 1.30–1.31× on V8. Two runs."
            }
          ]
        },
        {
          "kind": "steps",
          "title": "Don't trust us. Run it.",
          "items": [
            {
              "title": "Reproduce the row board",
              "text": "Strictly sequential, gated on a one-minute load below 4. You get 100 samples per cell from five page loads, framework order reshuffled every pass.",
              "code": "git clone https://github.com/pyreon/pyreon && cd pyreon\nbun install\ncd examples/benchmark\nbun bench-fair.ts --repeat 5 --wait-quiet 4"
            },
            {
              "title": "Read the verdict rules",
              "text": "A result is a win only when the confidence intervals are disjoint in both runs. Overlapping intervals mean \"could not distinguish\", never \"equal\". A close verdict needs two agreeing runs."
            },
            {
              "title": "Check the rest",
              "text": "Every suite on the board, from SSR to the reactivity core, lists its own command on the benchmarks page."
            }
          ]
        },
        {
          "kind": "story",
          "title": "Eight bugs we found in our own benchmark.",
          "text": [
            "Pyreon's authors wrote every harness, every competitor arm, and decide what counts as a win. Every judgement call in a setup like that leans toward the home team. So we went looking, and found eight measurement bugs. Each one was fixed, re-run and published, and each has a guard that stops it coming back."
          ]
        },
        {
          "kind": "list",
          "title": "The eight, and the guard for each.",
          "items": [
            {
              "title": "1. Rivals on slow paths",
              "text": "Svelte and Vue arms ran on deep proxies and Octane was pinned eight patches behind. Guard: every arm on its framework's documented fast path."
            },
            {
              "title": "2. A 100 µs clock",
              "text": "Chromium clamps `performance.now()` on a non-isolated page. Guard: cross-origin isolated pages with a measured 5 µs quantum, and a batch instrument for tiny ops."
            },
            {
              "title": "3. A `String()` wrapper",
              "text": "It switched off Octane's compiler fast path. Guard: no presentation work a real user would not write; competitor arms are checked by compiling them."
            },
            {
              "title": "4. A V8 string cache",
              "text": "Its growth was billed to five arms' retained heap. Guard: every arm renders the raw `row.id`."
            },
            {
              "title": "5. `table-layout: auto`",
              "text": "Whole-table re-measures inflated a Pyreon partial-update lead; the published ~4.9× was withdrawn. Guard: `table-layout: fixed` plus a bimodality check."
            },
            {
              "title": "6. A busy machine",
              "text": "A hydration \"tie\" was measured at load 8.2. Guard: sequential runs gated on load below 4."
            },
            {
              "title": "7. A rival's upgrade",
              "text": "A clear-rows swing was mostly a competitor getting slower. Guard: split \"Pyreon moved\" from \"competitor moved\" before attributing a change."
            },
            {
              "title": "8. Pooled intervals",
              "text": "100 samples from 5 page loads were treated as independent. Guard: a two-stage cluster bootstrap over page loads."
            }
          ]
        },
        {
          "kind": "quote",
          "text": "Synthetic: these are synthetic micro- and scenario benchmarks. They do not predict the performance of your app.",
          "attribution": "Pyreon benchmark record",
          "href": "/benchmarks"
        },
        {
          "kind": "story",
          "title": "An independent venue, staged.",
          "text": [
            "The only full answer to author bias is someone else's harness. A keyed Pyreon implementation for krausest/js-framework-benchmark is staged in the repo under `contrib/krausest/pyreon-keyed/`. Staged, not yet submitted."
          ]
        },
        {
          "kind": "note",
          "text": "The board also lists where we are not first: Solid mounts a deep component tree 1.15–1.18× faster, Solid, Preact and Svelte ship smaller bundles, signal creation is about 5× slower than Preact Signals, and five row-board ops are statistical ties with the fastest rivals.",
          "href": "/benchmarks"
        },
        {
          "kind": "links",
          "title": "Go deeper.",
          "items": [
            {
              "label": "The benchmark board",
              "href": "/benchmarks",
              "text": "Every result, ties and losses included."
            },
            {
              "label": "Benchmark docs",
              "href": "/docs/benchmarks",
              "text": "The full record, competitor versions and every reproduce command."
            },
            {
              "label": "Components run once",
              "href": "/why/components-run-once",
              "text": "Why the work is not there to begin with."
            }
          ]
        }
      ],
      "end": {
        "title": "We publish where we lose, so you can trust where we win.",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "share": {
        "ogTitle": "2.6× faster than React. Don't trust us. Run it.",
        "ogSub": "Ten frameworks, real Chromium, one command to reproduce. Synthetic, author-run, M3 Max."
      },
      "sources": [
        {
          "claim": "Create 10k 72.64 vs React 192.01 vs Preact 278.03 ms; clear rows 1.11–1.12× vs Vapor; heap 3.08 vs 3.09 MB",
          "path": "BENCHMARKS.md §1"
        },
        {
          "claim": "Bundle 17.2 vs 69.6 KB (4.05×)",
          "path": "BENCHMARKS.md §7"
        },
        {
          "claim": "Compiled SSR 109.9 vs React 714.4 µs at 1,000 rows (6.50×), one run",
          "path": "BENCHMARKS.md §5"
        },
        {
          "claim": "App page hydration 4.02 / 4.15 / 4.30 / 4.47 ms, one run",
          "path": "BENCHMARKS.md §4"
        },
        {
          "claim": "TodoMVC toggle ~2.4×, clear 3–4×, one run",
          "path": "BENCHMARKS.md §6"
        },
        {
          "claim": "Reactivity V8 effect/batch/diamond ratios, two runs",
          "path": "BENCHMARKS.md §8"
        },
        {
          "claim": "Reproduce command bench-fair.ts --repeat 5 --wait-quiet 4 in examples/benchmark",
          "path": "BENCHMARKS.md \"Reproduce\" and §1; docs/src/content/docs/benchmarks.md line 171"
        },
        {
          "claim": "Win only when CIs disjoint in both runs; overlap = could not distinguish",
          "path": "BENCHMARKS.md header \"How to read\""
        },
        {
          "claim": "Eight harness bugs and guards",
          "path": ".agents/guides/benchmarks/README.md; post 05-blog/B02-we-keep-retracting-our-benchmark-wins.md"
        },
        {
          "claim": "krausest keyed implementation staged, not submitted",
          "path": "contrib/krausest/pyreon-keyed/; BENCHMARKS.md header"
        },
        {
          "claim": "Synthetic quote",
          "path": "BENCHMARKS.md header \"Synthetic\""
        },
        {
          "claim": "Losses: deep tree, bundle vs Solid/Preact, signal creation, row-board ties",
          "path": "BENCHMARKS.md §13"
        }
      ]
    },
    {
      "id": "full-stack",
      "route": "/why/full-stack",
      "title": "Full stack",
      "hook": {
        "eyebrow": "Pyreon Zero",
        "title": "SSG, SSR, ISR or SPA. Per route, in one line.",
        "lede": "`@pyreon/zero` lets every route pick how it renders, prints what it chose at build time, and hydrates by adopting the server's DOM, so what your users typed before the JavaScript landed is still there. Compiled server rendering runs 6.5× faster than React 19 at 1,000 rows (one run).",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "sections": [
        {
          "kind": "proof",
          "title": "Fast on the server, fast on the hand-off.",
          "stats": [
            {
              "stat": "5.7–6.6×",
              "label": "faster compiled SSR than React 19 at 10 / 100 / 1,000 rows",
              "condition": "overnight run, one run · Apple M3 Max · synthetic, author-run",
              "source": "BENCHMARKS.md §5"
            },
            {
              "stat": "1.64–4.68×",
              "label": "`renderToString` throughput vs Solid across four scenarios, byte-identical output enforced",
              "condition": "overnight run, one run · Apple M3 Max · synthetic, author-run",
              "source": "BENCHMARKS.md §5"
            },
            {
              "stat": "4.02 ms",
              "label": "to hydrate a 320-component page, ahead of React 4.15, Preact 4.30, Vue 4.47",
              "condition": "final pass, one run · real Chromium · Apple M3 Max · synthetic, author-run",
              "source": "BENCHMARKS.md §4"
            }
          ],
          "note": "Compiled SSR also leads Vue 3 (1.14–1.68×) and Svelte 5 (1.21–1.55×) at every size measured, one run. Synthetic, author-run, Apple M3 Max."
        },
        {
          "kind": "code",
          "title": "One export per route.",
          "text": "The app mode is only the default. A page, or a `_layout` that cascades to everything below it, declares its own mode. Prefer policy in one place? `routeRules` maps path globs to modes.",
          "blocks": [
            {
              "label": "src/routes/about.tsx",
              "lang": "tsx",
              "code": "export const renderMode = 'ssg'"
            },
            {
              "label": "vite.config.ts",
              "lang": "ts",
              "code": "zero({\n  mode: 'ssr',\n  routeRules: {\n    '/blog/**': { renderMode: 'isr' },\n    '/admin/**': { renderMode: 'spa' },\n  },\n})"
            },
            {
              "label": "npm run build",
              "lang": "text",
              "code": "[zero] Route modes (app: ssr) — 5 ssr λ · 1 ssg ○\n  λ ssr  /\n  ○ ssg  /about  (declared)\n  λ ssr  /counter\n  λ ssr  /dashboard\n  λ ssr  /posts\n  λ ssr  /posts/:id"
            }
          ],
          "caption": "Precedence is always the same: the page's own `renderMode`, the nearest `_layout`, `routeRules`, `mode: 'auto'` inference, then the app mode. Impossible combinations fail the build and name the route."
        },
        {
          "kind": "list",
          "title": "Or let Zero decide.",
          "text": "`mode: 'auto'` is experimental. It infers a mode per route on a \"static unless the code says otherwise\" rule, and the build prints the table so you can see every choice.",
          "items": [
            {
              "title": "`revalidate` export",
              "text": "ISR."
            },
            {
              "title": "`getStaticPaths` export",
              "text": "SSG, even next to a loader."
            },
            {
              "title": "`loader`, `.server.ts`, `guard` or `middleware`",
              "text": "SSR."
            },
            {
              "title": "Anything else",
              "text": "SSG."
            },
            {
              "title": "Inferred-SSG routes prerender in mixed apps",
              "text": "In a build that also has SSR routes, pages inferred as SSG are now prerendered, and one resolver answers \"what mode does this page get\" everywhere. New on main, shipping in the next release.",
              "status": "next release"
            }
          ]
        },
        {
          "kind": "story",
          "title": "Hydration that keeps what you typed.",
          "text": [
            "A slow train, a server-rendered page, three letters typed into the search box. Then the JavaScript lands and a hydrating framework that rebuilds the DOM throws the letters away, along with the cursor.",
            "Pyreon adopts the server's nodes instead of replacing them. Text typed into an uncontrolled input, focus, scroll position inside adopted regions and listeners other scripts attached early all survive the boot. Zero resolves the current route's code before hydrating, so the first client render is the real page, not a loading fallback."
          ]
        },
        {
          "kind": "list",
          "title": "Deploy where you already deploy.",
          "text": "`--adapter` on `npm create @pyreon/zero@latest` writes the platform files and wires the adapter into `vite.config.ts`.",
          "items": [
            {
              "title": "`node` and `bun`",
              "text": "A production server plus a Dockerfile."
            },
            {
              "title": "`vercel`",
              "text": "`vercel.json`."
            },
            {
              "title": "`netlify`",
              "text": "`netlify.toml`."
            },
            {
              "title": "`cloudflare`",
              "text": "A `wrangler.toml` with `nodejs_compat` already set."
            },
            {
              "title": "`static`",
              "text": "Just `dist/`. The scaffolder refuses it with SSR or ISR, because there is no server to run them."
            }
          ]
        },
        {
          "kind": "list",
          "title": "Content and a blog, built in.",
          "text": "`@pyreon/zero-content` turns `.md` and `.mdx` into real Pyreon JSX at build time, with typed collections, Shiki highlighting, callouts, search and inline live examples. It powers the Pyreon docs and blog.",
          "items": [
            {
              "title": "Typed collections",
              "text": "`getCollection`, `getEntry` and `getEntries` query your content with types."
            },
            {
              "title": "Scheduled publishing",
              "text": "Declare `publishDate: 'date'` on a collection and a future-dated entry stays out of listings, search, the sitemap and the feed of a production build until its date; `unpublished: 'omit'` keeps it out of the bundle too. `PYREON_CONTENT_NOW=<date>` builds the site as it will look that day. New on main, shipping in the next release.",
              "status": "next release"
            },
            {
              "title": "Feeds",
              "text": "Full-content RSS with `content: 'full'`, the shape dev.to's \"Publishing from RSS\" imports. New on main, shipping in the next release.",
              "status": "next release"
            }
          ]
        },
        {
          "kind": "steps",
          "title": "From scaffold to a running server.",
          "items": [
            {
              "title": "Scaffold",
              "text": "Pick a mode and an adapter, or take the defaults.",
              "code": "npm create @pyreon/zero@latest my-app -- --mode ssr-stream --adapter node"
            },
            {
              "title": "Build",
              "text": "Every SSG, SSR, ISR or auto build prints its per-route mode table.",
              "code": "npm run build"
            },
            {
              "title": "Run",
              "text": "The Node adapter writes a `node:http` server.",
              "code": "PORT=8080 node dist/index.js"
            }
          ]
        },
        {
          "kind": "faq",
          "title": "Questions before you ship.",
          "items": [
            {
              "q": "Does streaming SSR work?",
              "a": "Yes: `ssr: { mode: 'stream' }`. The default is buffered string rendering."
            },
            {
              "q": "What if a prerendered file goes missing?",
              "a": "The Node and Bun servers serve SSG pages from disk first and fall back to rendering the page, never to a 404."
            },
            {
              "q": "Will a typo in my config fail quietly?",
              "a": "No. Config typos fail with a did-you-mean."
            },
            {
              "q": "Is `mode: 'auto'` safe for production?",
              "a": "It is labelled experimental. The build table shows exactly what it chose, and an explicit `renderMode` export always wins, so you can pin any route."
            }
          ]
        },
        {
          "kind": "links",
          "title": "Go deeper.",
          "items": [
            {
              "label": "Zero",
              "href": "/docs/zero",
              "text": "Render modes, routeRules, adapters."
            },
            {
              "label": "Zero Content",
              "href": "/docs/zero-content",
              "text": "Collections, MDX and scheduled entries."
            },
            {
              "label": "Benchmarks",
              "href": "/benchmarks",
              "text": "SSR and hydration numbers with their runs."
            }
          ]
        }
      ],
      "end": {
        "title": "Your users typed it. Pyreon keeps it.",
        "cta": {
          "label": "Start building",
          "command": "npm create @pyreon/zero@latest"
        }
      },
      "share": {
        "ogTitle": "SSG, SSR, ISR or SPA. Per route, in one line.",
        "ogSub": "Pyreon Zero: per-route render modes, hydration that keeps what users typed, and SSR 6.5× faster than React 19 (one run)."
      },
      "sources": [
        {
          "claim": "Compiled SSR vs React 5.72/6.57/6.50×; Vue 1.68/1.35/1.14×; Svelte 1.21/1.55/1.46×",
          "path": "BENCHMARKS.md §5 bench:ssr table"
        },
        {
          "claim": "renderToString vs Solid 1.64–4.68×, byte-identical output",
          "path": "BENCHMARKS.md §5 bench:ssr-cross table"
        },
        {
          "claim": "App page hydration 4.02 ms vs 4.15/4.30/4.47, one run",
          "path": "BENCHMARKS.md §4"
        },
        {
          "claim": "renderMode export, _layout cascade, routeRules, precedence, build mode table, impossible combos fail",
          "path": "docs/src/content/docs/zero.md lines 490–540; packages/zero/zero/src/{fs-router,route-modes}.ts"
        },
        {
          "claim": "Build output sample",
          "path": "post 05-blog/B07-create-zero-to-deployed-in-5-minutes.md (real run)"
        },
        {
          "claim": "mode auto EXPERIMENTAL and its inference rule",
          "path": "docs/src/content/docs/zero.md line 522"
        },
        {
          "claim": "auto prerenders inferred SSG in mixed builds (#4138), unreleased",
          "path": "packages/zero/zero/src/fs-router.ts createFileRouteModeResolver; 00-brief/facts.md"
        },
        {
          "claim": "Hydration adopts server DOM: typed input, focus, scroll, foreign listeners; route code resolved before hydrateRoot",
          "path": "packages/core/runtime-dom/src/hydrate.ts; post 05-blog/B04-hydration-that-adopts-the-server-dom.md"
        },
        {
          "claim": "Scaffold adapters node, bun, vercel, netlify, cloudflare, static (no Deno); static refused with SSR/ISR",
          "path": "packages/zero/create-zero/src/{args,templates}.ts; post B07"
        },
        {
          "claim": "zero-content: compile-time md to JSX, typed collections, powers docs",
          "path": "docs/src/content/docs/zero-content.md"
        },
        {
          "claim": "publishDate scheduling and PYREON_CONTENT_NOW, unreleased",
          "path": "docs/src/content/docs/zero-content.md \"Drafts and scheduled entries\"; packages/zero/zero-content/src/publish.ts"
        },
        {
          "claim": "Streaming via ssr.mode stream; config typos did-you-mean; SSG static-first with SSR fallback",
          "path": "docs/src/content/docs/zero.md lines 151, 512; packages/zero/zero/src/config-validation.ts"
        }
      ]
    }
  ],
  "template": {
    "meta": {
      "title": "{title} · Pyreon"
    },
    "index": {
      "title": "Why Pyreon",
      "label": "{title} →"
    },
    "switcher": "Why Pyreon",
    "heroLink": {
      "label": "See the benchmarks",
      "href": "/benchmarks"
    },
    "tryIt": {
      "label": "try it",
      "title": "Click it. Count the renders.",
      "text": "A real Pyreon counter, running in this page. The numbers come from the component and the DOM, not from a script."
    },
    "diagram": {
      "scroll": "Diagram",
      "handOff": "Diagram of the hand-off, not a capture of this page."
    },
    "sections": {
      "proofCaveat": "synthetic · author-run · Apple M3 Max · record of 2026-11-05",
      "proofLink": {
        "label": "Every result, including where we lose →",
        "href": "/benchmarks"
      },
      "diff": "the difference",
      "code": "code",
      "steps": "steps",
      "list": "in detail",
      "compareStrip": "side by side",
      "faq": "questions",
      "links": "links",
      "noteLink": "source →",
      "table": "at a glance"
    }
  }
} satisfies WhyFile
