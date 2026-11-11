// Written by scripts/sync-site-content.ts from content/_migrate.json. Do not edit: re-run the sync.
// Typecheck only (never imported): fails when _migrate.json does not match MigrateSite.
import type { MigrateSite } from '../types-site'

export const checked = {
  "landing": {
    "id": "migrate",
    "route": "/migrate",
    "productHref": "/products/migrate",
    "hook": {
      "eyebrow": "Migrate",
      "title": "Bring your React app. Keep shipping while you move.",
      "lede": "Point `react` at `@pyreon/react-compat` and your hooks, deps arrays and all, run on Pyreon's engine. Then convert one component at a time, with a codemod for the mechanical parts, until the compat layer has nothing left to do."
    },
    "steps": [
      {
        "n": 1,
        "title": "Install the compat layer",
        "text": "The React layer plus the Pyreon runtime it sits on. The Vite plugin needs Vite 8. On the published packages `vite dev` renders a blank page (the compat JSX runtime ships no `jsxDEV`); `vite build` works, and the fix is on main for the next release.",
        "file": null,
        "code": "npm install @pyreon/react-compat @pyreon/core @pyreon/reactivity @pyreon/runtime-dom\nnpm install -D @pyreon/vite-plugin"
      },
      {
        "n": 2,
        "title": "Change two config files",
        "text": "Swap `@vitejs/plugin-react` for the Pyreon plugin in compat mode. It resolves `react`, `react-dom`, `react-dom/client` and the JSX runtime to the compat package, so your import lines stay as they are, and it renames `className` and `htmlFor` on the way through.",
        "file": "vite.config.ts + tsconfig.json",
        "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon({ compat: 'react' })],\n})\n\n// tsconfig.json\n{\n  \"compilerOptions\": {\n    \"jsx\": \"react-jsx\",\n    \"jsxImportSource\": \"@pyreon/react-compat\"\n  }\n}"
      },
      {
        "n": 3,
        "title": "Keep shipping",
        "text": "Function components behave like React: `useState` returns the value, the body re-runs, deps arrays are honoured. Before you deploy, check the four known gaps: class components are stubs, transitions run synchronously, a child's state resets when its parent re-renders (lift that state up), and libraries that reach into React internals will not run.",
        "file": null,
        "code": null
      },
      {
        "n": 4,
        "title": "Convert one component at a time",
        "text": "Run the codemod on a file, finish what it reports, and wrap the converted component in `nativeCompat()` so it runs in Pyreon's setup frame. The compat build skips Pyreon's compiler pass, so write reactive text as an arrow (`{() => …}`) until step 5.",
        "file": "Likes.tsx",
        "code": "import { nativeCompat } from '@pyreon/core'\nimport { signal } from '@pyreon/reactivity'\n\n// A converted component inside a compat app: it runs once.\nexport const Likes = nativeCompat(function Likes() {\n  const likes = signal(0)\n  return (\n    <button onClick={() => likes.update((n) => n + 1)}>\n      {() => `${likes()} likes`}\n    </button>\n  )\n})"
      },
      {
        "n": 5,
        "title": "Switch the compiler on",
        "text": "When no React-style component is left, drop `compat` from the plugin and set `jsxImportSource` to `@pyreon/core`. The compiler now makes `{likes()}` reactive without the arrow, and the app is plain Pyreon. Moving to Zero's file router is a separate step you can take later.",
        "file": "vite.config.ts",
        "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon()],\n})"
      }
    ],
    "tools": {
      "title": "Tools for the mechanical part.",
      "items": [
        {
          "name": "`migrate_react`",
          "package": "@pyreon/mcp",
          "what": "Your AI assistant hands it a React file and gets back `useState` turned into `signal`, `useMemo` into `computed`, `useEffect` into `effect`, `useCallback` unwrapped to a plain function, `className` and `htmlFor` renamed, `onChange` on inputs turned into `onInput`, the imports swapped, plus the list of changes it made and the findings it could not fix.",
          "how": "Add the server to `.mcp.json`: `{ \"mcpServers\": { \"pyreon\": { \"command\": \"bunx\", \"args\": [\"@pyreon/mcp\"] } } }`",
          "limits": "A first pass that does not run as is: setter calls such as `setCount(…)` stay dangling, value reads are not turned into calls, a `useRef` becomes a signal so its `.current` uses break, and a `memo()` wrapper can stay in place although the change list says it was removed. `.map()` lists are flagged for `<For>` but not rewritten; class components and React-specific libraries are not converted. TypeScript flags the dangling setters; review the diff."
        },
        {
          "name": "`pyreon check --fix`",
          "package": "@pyreon/cli",
          "what": "The same detectors in the terminal. It scans your git-changed files (or the paths you pass), prints each finding with its fix, writes the codemod's first-pass rewrites with `--fix`, and exits non-zero on any finding, so it works as a pre-commit gate.",
          "how": "`pyreon check src/components/Search.tsx --fix`",
          "limits": "Applies the same codemod as `migrate_react`, with the same gaps, and skips a file whose only React habit is a `.map()` list, an `onChange` or `dangerouslySetInnerHTML`."
        },
        {
          "name": "`--compat` scaffold",
          "package": "@pyreon/create-zero",
          "what": "Starting a new app next to the old one? The scaffold wires the compat layer into a Zero app for React, Vue, Solid or Preact.",
          "how": "`npm create @pyreon/zero@latest my-app -- --compat react`",
          "limits": "The scaffold offers `react`, `vue`, `solid` and `preact`; Svelte compat is set up by hand through the Vite plugin."
        }
      ]
    },
    "layersTitle": "Five frameworks, one engine.",
    "guidesTitle": "No compat layer, still a guide.",
    "cta": {
      "title": "Ship on Pyreon this week. Finish the move when it pays.",
      "command": "npm install @pyreon/react-compat",
      "secondary": {
        "label": "Read the React migration guide",
        "href": "/docs/migrating-from-react"
      }
    },
    "sources": [
      {
        "claim": "Vite plugin compat aliases for react, react-dom, react-dom/client and the JSX runtime",
        "path": "packages/tools/vite-plugin/src/index.ts lines 128–142 (compat option) and 430–462 (alias map)"
      },
      {
        "claim": "className/htmlFor renamed in compat mode; reactive JSX transform skipped in compat mode",
        "path": "packages/tools/vite-plugin/src/index.ts lines 1272–1287 (compat mode skips the reactive JSX transform; renames className/htmlFor for react and preact); packages/tools/vite-plugin/src/ast-rewrite.ts line 211"
      },
      {
        "claim": "@pyreon/vite-plugin peer: vite >= 8.0.0; compat peers core, reactivity, runtime-dom",
        "path": "packages/tools/vite-plugin/package.json; packages/tools/react-compat/package.json (peerDependencies)"
      },
      {
        "claim": "Value + re-render model, deps arrays honoured; known gaps (class stubs, sync transitions, nested state reset, React internals)",
        "path": "packages/tools/react-compat/README.md (Key differences, Gotchas, Third-party)"
      },
      {
        "claim": "nativeCompat() makes a component run in Pyreon's setup frame inside a compat app",
        "path": "docs/src/content/docs/native-compat.md; packages/tools/react-compat/src/jsx-runtime.ts lines 218–231"
      },
      {
        "claim": "Step 4 sample: a nativeCompat signal component inside a react-compat parent updates on click",
        "path": "/tmp/wt-site-content/.scratch/site-compare/{Mixed.tsx,mount-mixed.ts} (run 11 Nov 2026)"
      },
      {
        "claim": "migrate_react transforms and its documented limits",
        "path": "packages/tools/mcp/src/manifest.ts lines 142–162; packages/core/compiler/src/react-intercept.ts migrateReactCode"
      },
      {
        "claim": "migrate_react leaves setter calls and value reads unconverted (observed output)",
        "path": "/tmp/wt-site-content/.scratch/site-compare/{mig.ts,mig2.ts}"
      },
      {
        "claim": "pyreon check scans git-changed files or paths, --fix applies migratePyreonCode + migrateReactCode, exits non-zero",
        "path": "packages/tools/cli/src/check.ts lines 1–19"
      },
      {
        "claim": "MCP config for Claude Code via bunx @pyreon/mcp",
        "path": "docs/src/content/docs/mcp.md lines 40–53"
      },
      {
        "claim": "create-zero --compat none|react|vue|solid|preact",
        "path": "packages/zero/create-zero/src/args.ts lines 57–60, 278; generators/vite-config.ts line 23"
      }
    ]
  },
  "layers": [
    {
      "id": "react",
      "route": "/migrate/react",
      "name": "React",
      "package": "@pyreon/react-compat",
      "hook": {
        "title": "Your React code, on Pyreon's engine.",
        "lede": "`@pyreon/react-compat` covers React 19's public API with near-full parity, and it runs the value-and-re-render model you know: `useState` returns the value, the body re-runs, deps arrays are honoured. Most components move over with their imports untouched."
      },
      "covers": [
        "Every React 19 hook except `useEffectEvent`: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, `useRef`, `useId`, `useContext`, `useSyncExternalStore`, `useTransition`, `useDeferredValue`, `useImperativeHandle`, `useActionState`, `useOptimistic`, `use`, `useDebugValue`.",
        "React's hook rules: positional hooks, deps arrays, stale-closure semantics.",
        "`createContext`, `createPortal`, `lazy`, `Suspense`, `ErrorBoundary`, `memo`, `forwardRef`, `cloneElement`, `Children`, `createRef`, `isValidElement`, `StrictMode` and `Profiler` (both render their children).",
        "`createRoot` and `render` from `@pyreon/react-compat/dom`, standing in for `react-dom/client`.",
        "Pyreon's own components work inside a compat app: the router, query, form, toast, head and UI providers ship marked with `nativeCompat()` (33 components across 17 packages)."
      ],
      "doesNotCover": [
        "Class components: `Component` and `PureComponent` are stubs; `setState` and `forceUpdate` warn and do nothing, lifecycle methods never fire.",
        "Concurrent rendering: `useTransition`, `useDeferredValue`, `startTransition` and `flushSync` run synchronously.",
        "Nested state across a parent re-render: the parent rebuilds its subtree, so a child's `useState`, `useReducer` and `useRef` reset and `useEffect([])` runs again. `memo` does not stop it; lift the state up.",
        "`useLayoutEffect` and `useInsertionEffect` run with `useEffect`'s timing.",
        "`react-dom` resolves to `@pyreon/react-compat/dom`, which exports `createRoot` and `render` only. Import `createPortal` and `flushSync` from `react`; `hydrateRoot` and `react-dom/server` are not provided.",
        "Libraries that use React internals or its scheduler: `zustand/react`'s `useStore`, `@xyflow/react`, the heavier `react-aria` hooks. Prefer a `/vanilla` or `/core` entry where one exists.",
        "`version` reports `19.0.0-pyreon`, so code that checks for an exact React version will not match.",
        "A few React 19 exports: `useEffectEvent`, `<Activity>`, `<ViewTransition>` and `cache` are not provided, so an import of them fails."
      ],
      "install": "npm install @pyreon/react-compat @pyreon/core @pyreon/reactivity @pyreon/runtime-dom\nnpm install -D @pyreon/vite-plugin",
      "config": [
        {
          "file": "vite.config.ts",
          "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon({ compat: 'react' })],\n})",
          "note": "Use it in place of `@vitejs/plugin-react`. Aliases `react`, `react/jsx-runtime`, `react-dom` and `react-dom/client`."
        },
        {
          "file": "tsconfig.json",
          "code": "// tsconfig.json\n{\n  \"compilerOptions\": {\n    \"jsx\": \"react-jsx\",\n    \"jsxImportSource\": \"@pyreon/react-compat\"\n  }\n}",
          "note": "Types and the JSX runtime come from the compat package."
        }
      ],
      "scaffold": "npm create @pyreon/zero@latest my-app -- --compat react",
      "ports": [
        {
          "title": "Then, one component at a time",
          "before": {
            "label": "React (runs as-is on react-compat)",
            "file": "Counter.tsx",
            "code": "import { useState } from 'react'\n\nexport function Counter({ step }: { step: number }) {\n  const [count, setCount] = useState(0)\n  const doubled = count * 2\n  return (\n    <button className=\"counter\" onClick={() => setCount(count + step)}>\n      {count} / {doubled}\n    </button>\n  )\n}"
          },
          "after": {
            "label": "Pyreon",
            "file": "Counter.tsx",
            "code": "import { computed, signal } from '@pyreon/reactivity'\n\nexport function Counter(props: { step: number }) {\n  const count = signal(0)\n  const doubled = computed(() => count() * 2)\n  return (\n    <button class=\"counter\" onClick={() => count.update((c) => c + props.step)}>\n      {count()} / {doubled()}\n    </button>\n  )\n}"
          },
          "note": "The Pyreon side is the final form, after `compat` is switched off. While the app is still in compat mode, wrap it in `nativeCompat()` and write the text as an arrow (`{() => …}`), as in step 4 on /migrate."
        }
      ],
      "docs": [
        {
          "label": "@pyreon/react-compat reference",
          "href": "/docs/react-compat"
        },
        {
          "label": "Coming from React",
          "href": "/docs/migrating-from-react"
        },
        {
          "label": "The nativeCompat marker",
          "href": "/docs/native-compat"
        }
      ],
      "sources": [
        {
          "claim": "API surface, value + re-render model, key differences and gotchas",
          "path": "packages/tools/react-compat/README.md"
        },
        {
          "claim": "Exports",
          "path": "packages/tools/react-compat/src/index.ts; packages/tools/react-compat/src/dom.ts (createRoot, render only)"
        },
        {
          "claim": "react-dom and react-dom/client alias to @pyreon/react-compat/dom; react-dom/server not aliased",
          "path": "packages/tools/vite-plugin/src/index.ts lines 128–142 (compat option) and 430–462 (alias map)"
        },
        {
          "claim": "33 marked components across 17 packages",
          "path": "docs/src/content/docs/native-compat.md (Components shipped marked)"
        },
        {
          "claim": "Third-party libraries known not to work",
          "path": "packages/tools/react-compat/README.md (Third-party React hook library compatibility)"
        },
        {
          "claim": "Covered by unit, browser and Playwright e2e tests",
          "path": "packages/tools/react-compat/src/tests/; packages/tools/react-compat/src/*.browser.test.tsx; e2e/react-compat.spec.ts; e2e/cpa-app-react-compat.spec.ts"
        },
        {
          "claim": "Pyreon Counter compiles, typechecks and updates on click",
          "path": "/tmp/wt-site-content/.scratch/site-compare/{Counter.tsx,mount-counter.ts}"
        },
        {
          "claim": "React Counter typechecks (@types/react 19.3.0)",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/CounterReact.tsx"
        }
      ]
    },
    {
      "id": "vue",
      "route": "/migrate/vue",
      "name": "Vue",
      "package": "@pyreon/vue-compat",
      "hook": {
        "title": "Keep your composables. Port templates when you're ready.",
        "lede": "`@pyreon/vue-compat` runs the Composition API on Pyreon's engine: `ref`, `reactive`, `computed`, `watch`, the lifecycle hooks, `provide`/`inject`, `createApp`. It is a runtime layer, so components are TSX functions: `.vue` files are ported to TSX, and the composables they import keep running unchanged."
      },
      "covers": [
        "Refs: `ref`, `shallowRef`, `triggerRef`, `isRef`, `unref`, `toValue`, `toRef`, `toRefs`.",
        "`computed` (getter and writable `{ get, set }` forms); `reactive`, `shallowReactive`, `readonly`, `shallowReadonly`, `toRaw`, `markRaw`, `isReactive`, `isReadonly`, `isProxy`.",
        "`watch` (single source, getter or array) and `watchEffect`.",
        "Lifecycle: `onMounted`, `onUnmounted`, `onUpdated`, `onBeforeMount`, `onBeforeUnmount`, `onErrorCaptured`, `onRenderTracked`, `onRenderTriggered`; `nextTick`.",
        "`provide` / `inject`, `effectScope`, `getCurrentScope`, `onScopeDispose`.",
        "`defineComponent`, `defineAsyncComponent` (loading and error components, delay, timeout), `createApp(component, props)`.",
        "Built-ins: `Teleport`, `KeepAlive`, `Transition`."
      ],
      "doesNotCover": [
        "The `.vue` single-file component compiler, and with it `<script setup>`.",
        "Template directives (`v-if`, `v-for`, `v-model`): use the JSX equivalents.",
        "The Options API (`data`, `methods`, a `computed` block, `created`, `beforeDestroy`…).",
        "Lifecycle hooks fire once per instance; `onUpdated`'s render-driven re-fires become per-subscription effects."
      ],
      "install": "npm install @pyreon/vue-compat @pyreon/core @pyreon/reactivity @pyreon/runtime-dom\nnpm install -D @pyreon/vite-plugin",
      "config": [
        {
          "file": "vite.config.ts",
          "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon({ compat: 'vue' })],\n})",
          "note": "Aliases `vue` and its JSX runtime to the compat package."
        },
        {
          "file": "tsconfig.json",
          "code": "// tsconfig.json\n{\n  \"compilerOptions\": {\n    \"jsx\": \"react-jsx\",\n    \"jsxImportSource\": \"@pyreon/vue-compat\"\n  }\n}",
          "note": "Types and the JSX runtime come from the compat package."
        }
      ],
      "scaffold": "npm create @pyreon/zero@latest my-app -- --compat vue",
      "ports": [
        {
          "title": "Step 1: the template becomes TSX, the logic stays",
          "before": {
            "label": "Vue single-file component",
            "file": "Counter.vue",
            "code": "<script setup lang=\"ts\">\nimport { computed, ref } from 'vue'\n\nconst props = defineProps<{ step: number }>()\nconst count = ref(0)\nconst doubled = computed(() => count.value * 2)\n</script>\n\n<template>\n  <button class=\"counter\" @click=\"count += props.step\">{{ count }} / {{ doubled }}</button>\n</template>"
          },
          "after": {
            "label": "TSX on @pyreon/vue-compat",
            "file": "Counter.tsx",
            "code": "import { computed, ref } from 'vue' // resolves to @pyreon/vue-compat\n\nexport function Counter(props: { step: number }) {\n  const count = ref(0)\n  const doubled = computed(() => count.value * 2)\n  return (\n    <button class=\"counter\" onClick={() => (count.value += props.step)}>\n      {count.value} / {doubled.value}\n    </button>\n  )\n}"
          },
          "note": "`ref`, `computed` and `.value` are untouched; only the markup moved. Render it from a parent's JSX (`<Counter step={2} />`) so the compat runtime re-renders it."
        },
        {
          "title": "Step 2: refs become signals",
          "before": {
            "label": "TSX on @pyreon/vue-compat",
            "file": "Counter.tsx",
            "code": "import { computed, ref } from 'vue' // resolves to @pyreon/vue-compat\n\nexport function Counter(props: { step: number }) {\n  const count = ref(0)\n  const doubled = computed(() => count.value * 2)\n  return (\n    <button class=\"counter\" onClick={() => (count.value += props.step)}>\n      {count.value} / {doubled.value}\n    </button>\n  )\n}"
          },
          "after": {
            "label": "Pyreon",
            "file": "Counter.tsx",
            "code": "import { computed, signal } from '@pyreon/reactivity'\n\nexport function Counter(props: { step: number }) {\n  const count = signal(0)\n  const doubled = computed(() => count() * 2)\n  return (\n    <button class=\"counter\" onClick={() => count.update((c) => c + props.step)}>\n      {count()} / {doubled()}\n    </button>\n  )\n}"
          },
          "note": "The Pyreon side is the final form, after `compat` is switched off."
        }
      ],
      "docs": [
        {
          "label": "@pyreon/vue-compat reference",
          "href": "/docs/vue-compat"
        },
        {
          "label": "Coming from Vue",
          "href": "/docs/migrating-from-vue"
        }
      ],
      "sources": [
        {
          "claim": "API surface, scope (no SFC compiler, no script setup, no Options API, no directives), gotchas",
          "path": "packages/tools/vue-compat/README.md"
        },
        {
          "claim": "Exports",
          "path": "packages/tools/vue-compat/src/index.ts"
        },
        {
          "claim": "vue alias in compat mode",
          "path": "packages/tools/vite-plugin/src/index.ts lines 128–142 (compat option) and 430–462 (alias map)"
        },
        {
          "claim": "Step 1 TSX counter updates on click when rendered through JSX",
          "path": "/tmp/wt-site-content/.scratch/site-compare/{VueCounter.tsx,mount-vue.ts}"
        },
        {
          "claim": "Vue SFC before-sample compiles with @vue/compiler-sfc 3.5.44",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/Counter.vue"
        },
        {
          "claim": "Covered by unit, browser and Playwright e2e tests",
          "path": "packages/tools/vue-compat/src/tests/; e2e/vue-compat.spec.ts; e2e/cpa-app-vue-compat.spec.ts"
        }
      ]
    },
    {
      "id": "solid",
      "route": "/migrate/solid",
      "name": "Solid",
      "package": "@pyreon/solid-compat",
      "hook": {
        "title": "Your Solid components run on day one.",
        "lede": "`@pyreon/solid-compat` runs Solid's API on Pyreon: signals, memos, effects, stores, resources and the control-flow components. Solid and Pyreon already share the model, so the final move is mostly a change of signal shape."
      },
      "covers": [
        "Signals: `createSignal`, `createMemo`, `createEffect`, `createComputed`, `createRenderEffect`, `createRoot`, `on`, `batch`, `untrack`.",
        "`onMount`, `onCleanup`; `mergeProps`, `splitProps`, `children`; `createContext`, `useContext`; `getOwner`, `runWithOwner`.",
        "`createResource` with `loading`, `error`, `latest` and Solid's five `state` values.",
        "Stores: `createStore`, `reconcile`, `unwrap`, `produce`; `createSelector`.",
        "Control flow: `<For>`, `<Index>`, `<Show>`, `<Switch>`, `<Match>`, `<Dynamic>`, `<Portal>`, `<ErrorBoundary>`, `<Suspense>`; `mapArray`, `indexArray`.",
        "`observable`, `from`, `lazy`, `createDeferred`, `createReaction`, `catchError`, `createUniqueId`, `render`, `hydrate`."
      ],
      "doesNotCover": [
        "Fine-grained updates inside compat components: a setter re-runs the whole component body (output and lifecycle stay correct). Converted Pyreon components get per-node updates back.",
        "Mutable stores (`createMutable`, `modifyMutable`), `onError` and `isServer`: not exported, so an import fails loudly.",
        "Solid's SSR entry points (`renderToString`, `renderToStream`, `HydrationScript`, `NoHydration`, `Assets`): use Pyreon's own SSR.",
        "`dom-expressions` helpers (`template`, `insert`, `spread`, `classList`, `delegateEvents`): Pyreon's compiler replaces Solid's Babel plugin.",
        "`startTransition` and `useTransition` run synchronously; `isPending` is always `false`."
      ],
      "install": "npm install @pyreon/solid-compat @pyreon/core @pyreon/reactivity @pyreon/runtime-dom\nnpm install -D @pyreon/vite-plugin",
      "config": [
        {
          "file": "vite.config.ts",
          "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon({ compat: 'solid' })],\n})",
          "note": "Use it in place of `vite-plugin-solid`. Aliases `solid-js` and its JSX runtime."
        },
        {
          "file": "tsconfig.json",
          "code": "// tsconfig.json\n{\n  \"compilerOptions\": {\n    \"jsx\": \"preserve\",\n    \"jsxImportSource\": \"@pyreon/solid-compat\"\n  }\n}",
          "note": "As given in the package README."
        }
      ],
      "scaffold": "npm create @pyreon/zero@latest my-app -- --compat solid",
      "ports": [
        {
          "title": "Then, one component at a time",
          "before": {
            "label": "Solid (runs as-is on solid-compat)",
            "file": "Counter.tsx",
            "code": "import { createMemo, createSignal } from 'solid-js'\n\nexport function Counter(props: { step: number }) {\n  const [count, setCount] = createSignal(0)\n  const doubled = createMemo(() => count() * 2)\n  return (\n    <button class=\"counter\" onClick={() => setCount((c) => c + props.step)}>\n      {count()} / {doubled()}\n    </button>\n  )\n}"
          },
          "after": {
            "label": "Pyreon",
            "file": "Counter.tsx",
            "code": "import { computed, signal } from '@pyreon/reactivity'\n\nexport function Counter(props: { step: number }) {\n  const count = signal(0)\n  const doubled = computed(() => count() * 2)\n  return (\n    <button class=\"counter\" onClick={() => count.update((c) => c + props.step)}>\n      {count()} / {doubled()}\n    </button>\n  )\n}"
          },
          "note": "The read stays `count()`; the write moves from `setCount` to `count.set` / `count.update`. Lists change from `<For each={rows()}>` to `<For each={rows} by={(r) => r.id}>`."
        }
      ],
      "docs": [
        {
          "label": "@pyreon/solid-compat reference",
          "href": "/docs/solid-compat"
        },
        {
          "label": "Coming from Solid",
          "href": "/docs/migrating-from-solid"
        }
      ],
      "sources": [
        {
          "claim": "API surface, per-component update model, not-supported list, transitions no-op",
          "path": "packages/tools/solid-compat/README.md"
        },
        {
          "claim": "Exports",
          "path": "packages/tools/solid-compat/src/index.ts"
        },
        {
          "claim": "solid-js alias; tsconfig jsx preserve per README",
          "path": "packages/tools/vite-plugin/src/index.ts lines 128–142 (compat option) and 430–462 (alias map); packages/tools/solid-compat/README.md (Vite compat-mode section)"
        },
        {
          "claim": "Unchanged Solid counter updates on click under solid-compat",
          "path": "/tmp/wt-site-content/.scratch/site-compare/{SolidCounter.tsx,mount-solid.ts}"
        },
        {
          "claim": "Solid before-sample typechecks against solid-js 1.9.17",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/CounterSolid.tsx"
        },
        {
          "claim": "Covered by unit, browser and Playwright e2e tests",
          "path": "packages/tools/solid-compat/src/tests/; e2e/solid-compat.spec.ts; e2e/cpa-app-solid-compat.spec.ts"
        }
      ]
    },
    {
      "id": "preact",
      "route": "/migrate/preact",
      "name": "Preact",
      "package": "@pyreon/preact-compat",
      "hook": {
        "title": "Preact code, hooks and signals included.",
        "lede": "`@pyreon/preact-compat` mirrors Preact's module layout (the root, `/hooks` and `/signals`), so imports from `preact`, `preact/hooks` and `@preact/signals` resolve to it with no edits. Hooks keep Preact's value-and-re-render model; signals keep `.value`."
      },
      "covers": [
        "Core: `h` / `createElement`, `Fragment`, `render`, `hydrate`, `Component`, `PureComponent`, `createContext`, `createRef`, `cloneElement`, `toChildArray`, `isValidElement`, `createPortal`, `lazy`, `Suspense`, `ErrorBoundary`, `options`.",
        "`/hooks`: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useId`, `memo`, `forwardRef`, `useImperativeHandle`, `useDebugValue`, `useTransition`, `useDeferredValue`, `useErrorBoundary`.",
        "`/signals`: `signal`, `computed`, `effect`, `batch`, with the `.value` getter and setter.",
        "Class lifecycle: `componentDidMount`, `componentDidUpdate`, `componentWillUnmount` and `shouldComponentUpdate` fire."
      ],
      "doesNotCover": [
        "`componentDidCatch`, `getDerivedStateFromError`, `getDerivedStateFromProps`, `getSnapshotBeforeUpdate`: class-based error boundaries do not catch. Use the `ErrorBoundary` component.",
        "Nested state across a parent re-render: the parent rebuilds its subtree, so a child's `useState`, `useReducer` and `useRef` reset and `useEffect([])` runs again. `memo` does not stop it; lift the state up.",
        "`useLayoutEffect` runs with `useEffect`'s timing.",
        "The plugin aliases `preact`, `preact/hooks`, `preact/jsx-runtime` and `@preact/signals`; `preact/compat` and `@preact/signals-core` are not aliased.",
        "`version` reports `10.0.0-pyreon`.",
        "The component hooks of `@preact/signals` (`useSignal`, `useComputed`, `useSignalEffect`) are not exported, so an import of them fails."
      ],
      "install": "npm install @pyreon/preact-compat @pyreon/core @pyreon/reactivity @pyreon/runtime-dom\nnpm install -D @pyreon/vite-plugin",
      "config": [
        {
          "file": "vite.config.ts",
          "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon({ compat: 'preact' })],\n})",
          "note": "Use it in place of `@preact/preset-vite`. Aliases `preact`, `preact/hooks` and `@preact/signals`."
        },
        {
          "file": "tsconfig.json",
          "code": "// tsconfig.json\n{\n  \"compilerOptions\": {\n    \"jsx\": \"react-jsx\",\n    \"jsxImportSource\": \"@pyreon/preact-compat\"\n  }\n}",
          "note": "Types and the JSX runtime come from the compat package."
        }
      ],
      "scaffold": "npm create @pyreon/zero@latest my-app -- --compat preact",
      "ports": [
        {
          "title": "Then, one component at a time",
          "before": {
            "label": "Preact (runs as-is on preact-compat)",
            "file": "Counter.tsx",
            "code": "import { useState } from 'preact/hooks'\n\nexport function Counter({ step }: { step: number }) {\n  const [count, setCount] = useState(0)\n  const doubled = count * 2\n  return (\n    <button class=\"counter\" onClick={() => setCount(count + step)}>\n      {count} / {doubled}\n    </button>\n  )\n}"
          },
          "after": {
            "label": "Pyreon",
            "file": "Counter.tsx",
            "code": "import { computed, signal } from '@pyreon/reactivity'\n\nexport function Counter(props: { step: number }) {\n  const count = signal(0)\n  const doubled = computed(() => count() * 2)\n  return (\n    <button class=\"counter\" onClick={() => count.update((c) => c + props.step)}>\n      {count()} / {doubled()}\n    </button>\n  )\n}"
          },
          "note": "The Pyreon side is the final form, after `compat` is switched off. While the app is still in compat mode, wrap it in `nativeCompat()` and write the text as an arrow."
        }
      ],
      "docs": [
        {
          "label": "@pyreon/preact-compat reference",
          "href": "/docs/preact-compat"
        },
        {
          "label": "Coming from React (the same hook map)",
          "href": "/docs/migrating-from-react"
        }
      ],
      "sources": [
        {
          "claim": "Subpaths, API surface, key differences, gotchas",
          "path": "packages/tools/preact-compat/README.md"
        },
        {
          "claim": "Exports",
          "path": "packages/tools/preact-compat/src/{index,hooks,signals}.ts"
        },
        {
          "claim": "Aliases preact, preact/hooks, preact/jsx-runtime, @preact/signals only",
          "path": "packages/tools/vite-plugin/src/index.ts lines 128–142 (compat option) and 430–462 (alias map)"
        },
        {
          "claim": "Preact before-sample typechecks against preact 11.0.2",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/CounterPreact.tsx"
        },
        {
          "claim": "Covered by unit, browser and Playwright e2e tests",
          "path": "packages/tools/preact-compat/src/tests/; e2e/preact-compat.spec.ts; e2e/cpa-app-preact-compat.spec.ts"
        }
      ]
    },
    {
      "id": "svelte",
      "route": "/migrate/svelte",
      "name": "Svelte",
      "package": "@pyreon/svelte-compat",
      "hook": {
        "title": "Keep your stores. Move components to TSX.",
        "lede": "`@pyreon/svelte-compat` runs the Svelte APIs your code imports, `svelte/store` plus lifecycle, context and events, on Pyreon's engine. It is not a `.svelte` compiler: components become TSX, and the store modules they share keep their imports."
      },
      "covers": [
        "`svelte/store`: `writable`, `readable`, `derived`, `readonly`, `get`, with Svelte's lazy start and stop and its equality check.",
        "`svelte`: `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`, `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`, `createEventDispatcher`, `mount`, `unmount`, `flushSync`.",
        "Control-flow components re-exported for JSX: `<For>`, `<Show>`, `<Switch>`, `<Match>`, `<ErrorBoundary>`, `<Suspense>`."
      ],
      "doesNotCover": [
        "The `.svelte` compiler: single-file components, rune syntax (`$state`, `$derived`, `$effect`), `$:` statements and `$store` auto-subscription.",
        "`<svelte:component>` and `<svelte:element>`.",
        "`onDestroy` (and an `onMount` cleanup) also fires when a parent re-renders, not only on real unmount.",
        "`beforeUpdate` / `afterUpdate` run after the first render only, not on every update.",
        "`getAllContexts()` returns an empty `Map`; `createEventDispatcher` reaches the direct parent only, with no bubbling.",
        "The `create-zero` scaffold has no Svelte option; set the plugin up by hand."
      ],
      "install": "npm install @pyreon/svelte-compat @pyreon/core @pyreon/reactivity @pyreon/runtime-dom\nnpm install -D @pyreon/vite-plugin",
      "config": [
        {
          "file": "vite.config.ts",
          "code": "// vite.config.ts\nimport { defineConfig } from 'vite'\nimport pyreon from '@pyreon/vite-plugin'\n\nexport default defineConfig({\n  plugins: [pyreon({ compat: 'svelte' })],\n})",
          "note": "Aliases `svelte`, `svelte/store`, `svelte/internal` and the JSX runtime."
        },
        {
          "file": "tsconfig.json",
          "code": "// tsconfig.json\n{\n  \"compilerOptions\": {\n    \"jsx\": \"react-jsx\",\n    \"jsxImportSource\": \"@pyreon/svelte-compat\"\n  }\n}",
          "note": "Types and the JSX runtime come from the compat package."
        }
      ],
      "scaffold": null,
      "ports": [
        {
          "title": "What stays: your stores",
          "before": {
            "label": "Svelte store module",
            "file": "stores/cart.ts",
            "code": "// stores/cart.ts: unchanged. `svelte/store` resolves to @pyreon/svelte-compat/store\nimport { derived, writable } from 'svelte/store'\n\nexport const items = writable<string[]>([])\nexport const count = derived(items, ($items: string[]) => $items.length)"
          },
          "after": {
            "label": "Same file on svelte-compat",
            "file": "stores/cart.ts",
            "code": "// stores/cart.ts: unchanged. `svelte/store` resolves to @pyreon/svelte-compat/store\nimport { derived, writable } from 'svelte/store'\n\nexport const items = writable<string[]>([])\nexport const count = derived(items, ($items: string[]) => $items.length)"
          },
          "note": "No edits: the alias does the work, and the store contract (`subscribe`, `set`, `update`) behaves like Svelte's."
        },
        {
          "title": "What moves: components",
          "before": {
            "label": "Svelte 5",
            "file": "Counter.svelte",
            "code": "<script lang=\"ts\">\n  let { step }: { step: number } = $props()\n  let count = $state(0)\n  const doubled = $derived(count * 2)\n</script>\n\n<button class=\"counter\" onclick={() => (count += step)}>{count} / {doubled}</button>"
          },
          "after": {
            "label": "Pyreon",
            "file": "Counter.tsx",
            "code": "import { computed, signal } from '@pyreon/reactivity'\n\nexport function Counter(props: { step: number }) {\n  const count = signal(0)\n  const doubled = computed(() => count() * 2)\n  return (\n    <button class=\"counter\" onClick={() => count.update((c) => c + props.step)}>\n      {count()} / {doubled()}\n    </button>\n  )\n}"
          },
          "note": "Prefer writing `count++`? Plain Mode (`'use plain'`) keeps that style and compiles it to signals."
        }
      ],
      "docs": [
        {
          "label": "@pyreon/svelte-compat reference",
          "href": "/docs/svelte-compat"
        },
        {
          "label": "Coming from Svelte",
          "href": "/docs/migrating-from-svelte"
        },
        {
          "label": "Plain Mode",
          "href": "/docs/plain-mode"
        }
      ],
      "sources": [
        {
          "claim": "Scope, store contract, differences and gotchas",
          "path": "packages/tools/svelte-compat/README.md"
        },
        {
          "claim": "Exports",
          "path": "packages/tools/svelte-compat/src/{index,store}.ts"
        },
        {
          "claim": "svelte, svelte/store, svelte/internal aliases",
          "path": "packages/tools/vite-plugin/src/index.ts lines 128–142 (compat option) and 430–462 (alias map)"
        },
        {
          "claim": "create-zero --compat has no svelte value",
          "path": "packages/zero/create-zero/src/args.ts line 60"
        },
        {
          "claim": "writable/derived subscribe works (script check)",
          "path": "/tmp/wt-site-content/.scratch/site-compare/vueref.ts"
        },
        {
          "claim": "Svelte before-sample compiles with svelte 5.57.3, no warnings",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/Counter.svelte"
        },
        {
          "claim": "Covered by unit, browser and Playwright e2e tests",
          "path": "packages/tools/svelte-compat/src/tests/; e2e/svelte-compat.spec.ts"
        }
      ]
    }
  ],
  "guides": [
    {
      "id": "angular",
      "name": "Angular",
      "href": "/docs/migrating-from-angular",
      "text": "Angular's signals (v16+) are almost the same API: `signal`, `computed`, `effect`, `.set`, `.update`. The guide maps class components, templates and dependency injection to function components, JSX and context.",
      "why": "There is no Angular compat layer; this is a rewrite with a familiar reactive core."
    },
    {
      "id": "react-native",
      "name": "React Native and Expo",
      "href": "/docs/migrating-from-react-native",
      "text": "A concept map from `View`, `Text`, `Pressable`, `TextInput` and `FlatList` to Pyreon's primitives, Expo Router to `@pyreon/router`, and the `expo-*` modules to Pyreon hooks, plus what does not carry over.",
      "why": "No compat layer: screens are rebuilt with `@pyreon/primitives`. The native targets are experimental."
    }
  ],
  "template": {
    "product": "The Migrate product",
    "switcher": "Migrate from",
    "landing": {
      "meta": {
        "title": "{title} · Pyreon"
      },
      "steps": {
        "label": "five steps",
        "title": "From React to Pyreon, without a rewrite.",
        "caption": "The five steps as a loop: an illustration, not a recording.",
        "scroll": "The five migration steps"
      },
      "tools": {
        "label": "tools",
        "how": "how",
        "limits": "limits"
      },
      "layers": {
        "label": "compat layers",
        "eyebrow": "from {name}",
        "name": "{name} →"
      },
      "guides": {
        "label": "guides"
      }
    },
    "layer": {
      "meta": {
        "title": "Migrate from {name}: {title} · Pyreon"
      },
      "eyebrow": "Migrate from {name} · {package}",
      "beforeAfter": {
        "label": "before and after",
        "title": "The same {name} code, on Pyreon.",
        "caption": "An illustration of the code on each side, not a recording.",
        "scroll": "{name} to Pyreon, before and after"
      },
      "coverage": {
        "label": "coverage",
        "title": "What {package} covers, and what it does not.",
        "covers": "covers",
        "doesNotCover": "does not cover"
      },
      "setup": {
        "label": "setup",
        "title": "Install it, point the config at it.",
        "scaffold": "or start from a scaffold"
      },
      "ports": {
        "label": "port it"
      },
      "docs": {
        "label": "read more",
        "title": "The guides behind this page."
      }
    }
  }
} satisfies MigrateSite
