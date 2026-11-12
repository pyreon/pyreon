// Written by scripts/sync-site-content.ts from content/_compare.json. Do not edit: re-run the sync.
// Typecheck only (never imported): fails when _compare.json does not match CompareSite.
import type { CompareSite } from '../types-site'

export const checked = {
  "record": "BENCHMARKS.md, 2026-11-05 (copy: 00-brief/BENCHMARKS-2026-11-05.md)",
  "caveat": "Synthetic, author-run, Apple M3 Max, real Chromium unless noted. Reproduce: pyreon.dev/docs/benchmarks",
  "order": [
    "react",
    "next",
    "solid",
    "vue",
    "svelte",
    "react-native"
  ],
  "pages": [
    {
      "id": "react",
      "route": "/compare/react",
      "rival": "React",
      "rivalMeasured": "react / react-dom 19.3.1",
      "hook": {
        "eyebrow": "Pyreon vs React",
        "title": "React ships 4× more JavaScript for the same app.",
        "lede": "Keep JSX, function components and TypeScript. Lose the re-render: a Pyreon component runs once, and a signal updates only the DOM node that reads it, so there is nothing to memoise and no dependency array to get wrong."
      },
      "proof": [
        {
          "stat": "4×",
          "label": "less JavaScript: 17.2 KB against React's 69.6 KB for the same keyed-table app (gzip)",
          "condition": "final pass, sizes are deterministic",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
        },
        {
          "stat": "2.6×",
          "label": "faster to create 10,000 rows: 72.6 ms against 192.0 ms",
          "condition": "real Chromium, run 1 table of a two-run record; synthetic, author-run",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 90"
        },
        {
          "stat": "6.5×",
          "label": "faster server rendering at 1,000 rows: 109.9 µs against 714.4 µs per render",
          "condition": "compiled SSR, one run (overnight)",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §5, line 243"
        }
      ],
      "table": {
        "title": "Pyreon and React, line by line.",
        "note": "Numbers from the 5 Nov 2026 record against React 19.3.1. Where React is ahead, the row says so. Synthetic, author-run, Apple M3 Max, real Chromium unless noted. Reproduce: pyreon.dev/docs/benchmarks",
        "rows": [
          {
            "topic": "Bundle, same keyed-table app (gzip)",
            "pyreon": "17.2 KB",
            "rival": "69.6 KB",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
          },
          {
            "topic": "Create 10,000 rows",
            "pyreon": "72.6 ms",
            "rival": "192.0 ms (2.6× slower)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 90 (run 1)"
          },
          {
            "topic": "Swap two rows in 1,000",
            "pyreon": "805 µs",
            "rival": "6.06 ms",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 87 (run 1)"
          },
          {
            "topic": "Remove a row",
            "pyreon": "5.70 ms",
            "rival": "5.78 ms; confidence intervals overlap in both runs",
            "verdict": "tie",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 88 and 101"
          },
          {
            "topic": "Mount a deep tree (2,047 components)",
            "pyreon": "3.59 / 3.58 ms",
            "rival": "3.71 / 3.66 ms; a tie in both runs",
            "verdict": "tie",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 119"
          },
          {
            "topic": "TodoMVC shape: toggle 1,000 / clear 1,000",
            "pyreon": "4.60 ms / 320 µs",
            "rival": "11.41 ms / 1.00 ms (2.48× / 3.14×; add-100 varies 1.14–1.99× day to day; one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §6, lines 264–268 (one run)"
          },
          {
            "topic": "Server rendering, 10 / 100 / 1,000 rows",
            "pyreon": "1.80 / 11.64 / 109.9 µs",
            "rival": "10.30 / 76.52 / 714.4 µs (5.7–6.6× slower, one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–243 (one run)"
          },
          {
            "topic": "Hydration: 1,000-row table / 320-component page",
            "pyreon": "6.07 ms / 4.02 ms",
            "rival": "6.52 ms / 4.15 ms; both adopt every server node (page: one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §4, lines 224–231 (page: one run)"
          },
          {
            "topic": "Retained heap after the row suite",
            "pyreon": "3.08 MB",
            "rival": "3.50 MB (one value per run, same in both runs)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 108"
          },
          {
            "topic": "Update model",
            "pyreon": "The component body runs once; a signal change re-runs only the bindings that read it.",
            "rival": "The component function re-runs on every state change; `useMemo`, `useCallback` and `memo` limit the cost.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-react.md (\"The one shift\")"
          },
          {
            "topic": "Concurrent rendering",
            "pyreon": "No concurrent scheduler: updates are synchronous and touch only the changed nodes.",
            "rival": "Transitions and deferred values let React interrupt and prioritise rendering.",
            "verdict": "rival",
            "source": "packages/tools/react-compat/README.md (\"Concurrent mode\" row)"
          },
          {
            "topic": "Library ecosystem",
            "pyreon": "77 first-party packages (router, forms, query, charts, flow, table, i18n…); React libraries that use only public hooks can run through `@pyreon/react-compat`.",
            "rival": "A far larger third-party catalog: component kits, React Flow, react-aria and thousands more, all running as-is.",
            "verdict": "rival",
            "source": "AGENTS.md (77 packages); packages/tools/react-compat/README.md (third-party section)"
          },
          {
            "topic": "Production track record",
            "pyreon": "Pre-1.0. No adoption claims.",
            "rival": "Over a decade in production and the largest hiring pool in front-end.",
            "verdict": "rival",
            "source": "00-brief/facts.md (status labels, things not to claim)"
          },
          {
            "topic": "Mobile from the same code",
            "pyreon": "The same `.tsx` compiles to SwiftUI and Jetpack Compose with PMTC (experimental).",
            "rival": "React Native shares the language and the model; it is production-grade.",
            "verdict": "different",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          }
        ]
      },
      "code": {
        "title": "The same search box, twice.",
        "caption": "Both filter a list as you type. The React version re-runs the whole function on every keystroke and memoises to stay fast. The Pyreon version runs once; the input, the count and the list each update on their own.",
        "rival": {
          "label": "React 19",
          "file": "Search.tsx",
          "code": "import { useMemo, useState } from 'react'\n\ntype Item = { id: number; name: string }\n\nexport function Search({ items }: { items: Item[] }) {\n  const [query, setQuery] = useState('')\n  const visible = useMemo(\n    () => items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())),\n    [items, query],\n  )\n\n  return (\n    <div>\n      <input value={query} onChange={(e) => setQuery(e.target.value)} />\n      <p>{visible.length} matches</p>\n      <ul>\n        {visible.map((i) => (\n          <li key={i.id}>{i.name}</li>\n        ))}\n      </ul>\n    </div>\n  )\n}"
        },
        "pyreon": {
          "label": "Pyreon",
          "file": "Search.tsx",
          "code": "import { For } from '@pyreon/core'\nimport { computed, signal } from '@pyreon/reactivity'\n\ntype Item = { id: number; name: string }\n\nexport function Search(props: { items: Item[] }) {\n  const query = signal('')\n  const visible = computed(() =>\n    props.items.filter((i) => i.name.toLowerCase().includes(query().toLowerCase())),\n  )\n\n  return (\n    <div>\n      <input value={query()} onInput={(e) => query.set(e.currentTarget.value)} />\n      <p>{visible().length} matches</p>\n      <ul>\n        <For each={visible} by={(i) => i.id}>\n          {(i) => <li>{i.name}</li>}\n        </For>\n      </ul>\n    </div>\n  )\n}"
        },
        "checked": "React side: typechecked with `@types/react` 19.3 under `tsc --strict`. Pyreon side: typechecked against the repo's `tsconfig` (0 errors), compiled with the real JSX compiler (`transformJSX`) and mounted in happy-dom; typing into the input filters the list."
      },
      "deletes": {
        "title": "What you stop writing.",
        "items": [
          {
            "what": "`useMemo(fn, deps)`",
            "instead": "`computed(fn)`: it tracks what it reads, so there is no dependency list."
          },
          {
            "what": "`useCallback`",
            "instead": "A plain function. The component runs once, so the closure is created once."
          },
          {
            "what": "`React.memo`",
            "instead": "Nothing. A parent update never re-runs a child component."
          },
          {
            "what": "Dependency arrays",
            "instead": "None, anywhere. `effect` and `computed` subscribe to the signals they read."
          }
        ]
      },
      "pickTheOther": {
        "title": "When to pick React",
        "items": [
          "Your app leans on React-only libraries (a component kit, React Flow, react-aria) and swapping them is not on the plan.",
          "You need concurrent rendering: transitions that interrupt work, deferred values.",
          "Hiring and a long production record weigh more for you than bundle size or update cost.",
          "You share code with a React Native app that ships today."
        ]
      },
      "migrate": {
        "title": "Bring your React app with you.",
        "text": "Point `react` at `@pyreon/react-compat`, keep shipping, and convert one component at a time.",
        "href": "/migrate/react",
        "label": "Migrate from React"
      },
      "cta": {
        "title": "Write it once. Watch it run once.",
        "command": "npm create @pyreon/zero@latest",
        "secondary": {
          "label": "Every result, including where we lose",
          "href": "/docs/benchmarks"
        }
      },
      "sources": [
        {
          "claim": "Bundle 17.2 KB vs React 69.6 KB, same keyed-table app, gzip -9",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
        },
        {
          "claim": "Create 10,000 rows 72.64 vs 192.01 ms; swap 805 µs vs 6.06 ms; remove 5.70 vs 5.78 ms (run 1 table)",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 83–91"
        },
        {
          "claim": "Remove row is a tie including React",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, line 101"
        },
        {
          "claim": "Deep-tree mount: React ties Pyreon in both runs",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §2, line 119; §13, line 457"
        },
        {
          "claim": "TodoMVC toggle 2.48×, clear 3.14×, add-100 quoted as 1.14–1.99×",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §6, lines 264–268"
        },
        {
          "claim": "Compiled SSR 1.80/11.64/109.9 vs React 10.30/76.52/714.4 µs, one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–243"
        },
        {
          "claim": "Hydration 1,000 rows React 6.52/6.53 vs Pyreon 6.07/6.04 ms; app page 4.02 vs 4.15 ms, one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §4, lines 224–231"
        },
        {
          "claim": "Retained heap Pyreon 3.08 MB vs React 3.50 MB, identical in both runs",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, line 108"
        },
        {
          "claim": "useMemo→computed, useCallback→delete, no dependency arrays",
          "path": "docs/src/content/docs/migrating-from-react.md (hook-by-hook map)"
        },
        {
          "claim": "Pyreon has no concurrent mode; transitions are synchronous",
          "path": "packages/tools/react-compat/README.md (Key differences)"
        },
        {
          "claim": "Libraries using React internals (zustand/react useStore, @xyflow/react, heavier react-aria hooks) do not run on react-compat",
          "path": "packages/tools/react-compat/README.md (Third-party React hook library compatibility)"
        },
        {
          "claim": "Pyreon Search sample typechecks, compiles and filters in happy-dom",
          "path": "/tmp/wt-site-content/.scratch/site-compare/{tc/Search.tsx,mount-search.ts} (run 11 Nov 2026)"
        },
        {
          "claim": "React Search sample typechecks under tsc --strict with @types/react 19.3.0",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/SearchReact.tsx"
        }
      ]
    },
    {
      "id": "next",
      "route": "/compare/next",
      "rival": "Next.js",
      "rivalMeasured": null,
      "hook": {
        "eyebrow": "Pyreon Zero vs Next.js",
        "title": "File routes, SSR, SSG and ISR. On components that run once.",
        "lede": "`@pyreon/zero` lets every route pick its render mode with a one-line export or a glob rule, and deploys to Node, Bun, Deno, Vercel, Netlify, Cloudflare or static hosting. Under it is Pyreon: a page component runs once, and only the nodes that read a changed signal update."
      },
      "proof": [
        {
          "stat": "4",
          "label": "render modes, chosen per route: `ssr`, `ssg`, `isr`, `spa`, by a route export or a `routeRules` glob",
          "condition": "capability",
          "source": "docs/src/content/docs/zero.md (Route Module Exports; Per-route render modes)"
        },
        {
          "stat": "7",
          "label": "deploy adapters: node, bun, deno, static, vercel, cloudflare, netlify, auto-detected on the three hosted platforms",
          "condition": "capability",
          "source": "docs/src/content/docs/zero.md line 131"
        },
        {
          "stat": "9 stacks",
          "label": "on one harness and the same app, Zero and Next.js 16 App Router among them: SSR throughput, TTFB, first-load JS, hydration. No result is published yet, so we claim none.",
          "condition": "suite exists; no published result",
          "source": "00-brief/BENCHMARKS-2026-11-05.md line 517; examples/stacks-bench/README.md"
        }
      ],
      "table": {
        "title": "Zero and Next.js, line by line.",
        "note": "Next.js is a meta-framework, so it is compared with `@pyreon/zero`, Pyreon's. There is no published head-to-head between the two yet; this table compares what each one does. For framework numbers (Pyreon against the React that Next runs on), see /compare/react.",
        "rows": [
          {
            "topic": "Render mode per route",
            "pyreon": "`export const renderMode = 'ssr' | 'ssg' | 'isr' | 'spa'`, `routeRules` globs, and `mode: 'auto'` (experimental), which infers each route's mode and prints the result at build.",
            "rival": "Static, dynamic and ISR per route through route segment config and the data APIs a page uses.",
            "verdict": "tie",
            "source": "docs/src/content/docs/zero.md (lines 381, 511–536)"
          },
          {
            "topic": "Server-only data",
            "pyreon": "A `.server.ts` sibling exports `serverLoader`; it never enters the client bundle, and a client navigation fetches the whole route chain in one request.",
            "rival": "React Server Components and server functions.",
            "verdict": "different",
            "source": "docs/src/content/docs/zero.md (Server Loaders, lines 630–658)"
          },
          {
            "topic": "Server actions",
            "pyreon": "A route's `action` export with `defineAction`, submitted by `<Form>` and read with `useSubmission`.",
            "rival": "Server Actions.",
            "verdict": "tie",
            "source": "docs/src/content/docs/zero.md line 1051"
          },
          {
            "topic": "Streaming SSR",
            "pyreon": "Opt-in: `ssr: { mode: 'stream' }`. Buffered by default.",
            "rival": "Streams by default with Suspense.",
            "verdict": "tie",
            "source": "docs/src/content/docs/zero.md line 151"
          },
          {
            "topic": "Hosting",
            "pyreon": "Seven adapters; on Vercel, Netlify and Cloudflare builds the adapter is picked from the environment.",
            "rival": "`next start` on Node, static export, and first-class on Vercel; other hosts through their own integrations.",
            "verdict": "different",
            "source": "docs/src/content/docs/zero.md line 131"
          },
          {
            "topic": "Component model",
            "pyreon": "Pyreon: components run once, signals update single nodes.",
            "rival": "React: components re-render; memoisation controls the cost.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-react.md"
          },
          {
            "topic": "Performance",
            "pyreon": "Not compared yet. `examples/stacks-bench` measures Zero, Next.js 16 App Router and seven other stacks on the same app; run it yourself.",
            "rival": "Same: no published result.",
            "verdict": "different",
            "source": "00-brief/BENCHMARKS-2026-11-05.md line 517"
          },
          {
            "topic": "Native apps from the same components",
            "pyreon": "PMTC compiles the same `.tsx` to SwiftUI and Jetpack Compose (experimental).",
            "rival": "Web only; a React Native app is a separate codebase.",
            "verdict": "pyreon",
            "source": "docs/src/content/docs/multiplatform.md; 00-brief/facts.md (status labels)"
          },
          {
            "topic": "Ecosystem and maturity",
            "pyreon": "Pre-1.0.",
            "rival": "Years in production, a large plugin and hosting ecosystem, and Vercel behind it.",
            "verdict": "rival",
            "source": "00-brief/facts.md (things not to claim)"
          }
        ]
      },
      "code": {
        "title": "One server-rendered page, cached and revalidated.",
        "caption": "A user page that loads on the server and is cached with stale-while-revalidate. Next.js does it in a server component; Zero splits the server-only loader into a sibling file that the client bundle never imports.",
        "rival": {
          "label": "Next.js App Router",
          "file": "app/users/[id]/page.tsx",
          "code": "// app/users/[id]/page.tsx\nimport { getUser } from '@/lib/users'\n\nexport const revalidate = 60\n\nexport default async function UserPage({\n  params,\n}: {\n  params: Promise<{ id: string }>\n}) {\n  const { id } = await params\n  const user = await getUser(id)\n  return <h1>{user.name}</h1>\n}"
        },
        "pyreon": {
          "label": "Pyreon Zero",
          "file": "src/routes/users/[id].tsx + [id].server.ts",
          "code": "// src/routes/users/[id].server.ts (server only, never in the client bundle)\nimport type { LoaderContext } from '@pyreon/router'\nimport { getUser } from '../../lib/users'\n\nexport async function serverLoader({ params }: LoaderContext) {\n  return getUser(params.id!)\n}\n\n// src/routes/users/[id].tsx\nimport { useLoaderData } from '@pyreon/router'\n\nexport const renderMode = 'isr' // stale-while-revalidate, 60 s by default\n\nexport default function UserPage() {\n  const user = useLoaderData<{ name: string }>()\n  return <h1>{user.name}</h1>\n}"
        },
        "checked": "Zero side: the page and an equivalent loader typecheck against the repo; `serverLoader`, `renderMode = 'isr'` (60 s default) and `useLoaderData<T>()` are as documented in zero.md and `packages/core/router/src/loader.ts`. Next side: App Router conventions (`params` is a Promise since Next 15); not compiled here."
      },
      "deletes": {
        "title": "What you stop writing.",
        "items": [
          {
            "what": "`useMemo`, `useCallback`, dependency arrays",
            "instead": "Nothing: pages are Pyreon components and run once."
          },
          {
            "what": "`'use client'` boundaries",
            "instead": "There are no server components to fence off. Server-only code lives in a `.server.ts` file that the client bundle never imports."
          }
        ]
      },
      "pickTheOther": {
        "title": "When to pick Next.js",
        "items": [
          "You want React Server Components and the React library catalog behind them.",
          "You deploy on Vercel and use its platform features end to end.",
          "Your team ships Next.js today and re-rendering is not what slows the app down.",
          "You need a meta-framework with years of production use behind it."
        ]
      },
      "migrate": {
        "title": "A Next.js app is a React app.",
        "text": "Start with `@pyreon/react-compat` to run your components on Pyreon, then move routes into Zero's file router (`src/routes`).",
        "href": "/migrate/react",
        "label": "Migrate from React"
      },
      "cta": {
        "title": "Scaffold a Zero app and pick a mode per route.",
        "command": "npm create @pyreon/zero@latest",
        "secondary": {
          "label": "Run the stacks bench yourself",
          "href": "https://github.com/pyreon/pyreon/tree/main/examples/stacks-bench"
        }
      },
      "sources": [
        {
          "claim": "Render modes ssr/ssg/isr/spa per route, routeRules globs, precedence",
          "path": "docs/src/content/docs/zero.md lines 130, 381, 511–536"
        },
        {
          "claim": "mode: 'auto' is EXPERIMENTAL and prints the inferred table",
          "path": "docs/src/content/docs/zero.md line 522; 00-brief/facts.md status labels"
        },
        {
          "claim": "Adapters node, bun, deno, static, vercel, cloudflare, netlify; auto-detected from VERCEL / NETLIFY / CF_PAGES",
          "path": "docs/src/content/docs/zero.md line 131"
        },
        {
          "claim": "Isomorphic loader vs .server.ts serverLoader; single-fetch on navigation; excluded from client bundle",
          "path": "docs/src/content/docs/zero.md lines 630–658"
        },
        {
          "claim": "renderMode 'isr' uses the shared SWR cache, default revalidate 60",
          "path": "docs/src/content/docs/zero.md line 515"
        },
        {
          "claim": "Server actions via defineAction / Form / useSubmission",
          "path": "docs/src/content/docs/zero.md lines 1051–1060"
        },
        {
          "claim": "Streaming is opt-in ssr: { mode: 'stream' }",
          "path": "docs/src/content/docs/zero.md line 151"
        },
        {
          "claim": "stacks-bench exists (zero vs Next.js 16 App Router and 7 others), no result published",
          "path": "00-brief/BENCHMARKS-2026-11-05.md line 517; examples/stacks-bench/README.md line 9"
        },
        {
          "claim": "useLoaderData<T>()",
          "path": "packages/core/router/src/loader.ts line 27"
        }
      ]
    },
    {
      "id": "solid",
      "route": "/compare/solid",
      "rival": "Solid",
      "rivalMeasured": "solid-js 1.9.17 (and 2.0.0-rc.15 on the row board)",
      "hook": {
        "eyebrow": "Pyreon vs Solid",
        "title": "Same signals as Solid. `renderToString` up to 4.7× faster.",
        "lede": "If you know Solid, you know Pyreon: compiled JSX, signals, components that run once. Pyreon adds the rest of the stack in one box (router, forms, query, the Zero meta-framework) and compiles the same components to SwiftUI and Jetpack Compose (experimental)."
      },
      "proof": [
        {
          "stat": "4.68×",
          "label": "faster `renderToString` on a card component: 8.95M against 1.91M renders a second, byte-identical HTML enforced",
          "condition": "one run, bun",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §5, line 251"
        },
        {
          "stat": "1.64–1.74×",
          "label": "faster on the other three server scenarios: a 50-row list, a 1,000-row list and a layout with component children",
          "condition": "one run, bun",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 252–254"
        },
        {
          "stat": "3.5×",
          "label": "faster clearing 1,000 rows: 130 µs against 460 µs",
          "condition": "real Chromium, run 1 table of a two-run record",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 89"
        }
      ],
      "table": {
        "title": "Pyreon and Solid, line by line.",
        "note": "Solid is the closest relative Pyreon has, and it wins four of the measured rows below. Synthetic, author-run, Apple M3 Max, real Chromium unless noted. Reproduce: pyreon.dev/docs/benchmarks",
        "rows": [
          {
            "topic": "`renderToString`, 4 scenarios",
            "pyreon": "1.64–4.68× faster",
            "rival": "Slower in all four; HTML is byte-identical (one run, bun)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 251–254 (one run)"
          },
          {
            "topic": "Clear 1,000 rows",
            "pyreon": "130 µs",
            "rival": "460 µs",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 89 (run 1)"
          },
          {
            "topic": "Create 10,000 rows",
            "pyreon": "72.64 ms",
            "rival": "78.75 ms",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 90 (run 1)"
          },
          {
            "topic": "12-field form, four timed operations",
            "pyreon": "Fastest on all four (keystroke 60 µs)",
            "rival": "Solid modular-forms: keystroke 100 µs (one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §6, lines 274–277 (one run)"
          },
          {
            "topic": "Effect list: update 500",
            "pyreon": "835 / 797 µs",
            "rival": "870 / 880 µs; a tie in run 1, Pyreon 1.10× in run 2, so not claimed",
            "verdict": "tie",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 121"
          },
          {
            "topic": "Mount a deep tree (2,047 components)",
            "pyreon": "3.59 / 3.58 ms",
            "rival": "3.06 / 3.10 ms: Solid 1.15–1.18× faster in both runs",
            "verdict": "rival",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 119"
          },
          {
            "topic": "Bundle, same keyed-table app (gzip)",
            "pyreon": "17.2 KB",
            "rival": "7.5 KB: the smallest framework in the record",
            "verdict": "rival",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
          },
          {
            "topic": "Effect list: dispose 500",
            "pyreon": "50 / 45 µs",
            "rival": "45 / 40 µs: Solid 1.11–1.13× faster (one 5 µs clock quantum)",
            "verdict": "rival",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 122"
          },
          {
            "topic": "Form memory",
            "pyreon": "2.42 MB retained",
            "rival": "2.33 MB retained (Solid modular-forms is lighter)",
            "verdict": "rival",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §6, line 279"
          },
          {
            "topic": "Signal shape",
            "pyreon": "One callable: `count()` reads, `count.set()` and `count.update()` write.",
            "rival": "A `[count, setCount]` tuple.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-solid.md"
          },
          {
            "topic": "List keys",
            "pyreon": "`<For each={rows} by={(r) => r.id}>`: an explicit key function.",
            "rival": "`<For>` keys by item identity; `<Index>` by position.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-solid.md"
          },
          {
            "topic": "Full stack in one install",
            "pyreon": "Router, query, forms, store, i18n, charts and the Zero meta-framework, all signal-native.",
            "rival": "SolidStart plus community libraries.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-solid.md (zero vs SolidStart)"
          },
          {
            "topic": "Native apps",
            "pyreon": "PMTC compiles the same components to SwiftUI and Compose (experimental).",
            "rival": "No first-party native target.",
            "verdict": "pyreon",
            "source": "docs/src/content/docs/multiplatform.md"
          },
          {
            "topic": "Maturity",
            "pyreon": "Pre-1.0.",
            "rival": "A stable 1.x with years of production use.",
            "verdict": "rival",
            "source": "00-brief/facts.md (status labels)"
          }
        ]
      },
      "code": {
        "title": "The same search box, twice.",
        "caption": "Read the two side by side: they are almost the same program. The differences are the signal shape and the `by` key on `<For>`.",
        "rival": {
          "label": "Solid 1.9",
          "file": "Search.tsx",
          "code": "import { createMemo, createSignal, For } from 'solid-js'\n\ntype Item = { id: number; name: string }\n\nexport function Search(props: { items: Item[] }) {\n  const [query, setQuery] = createSignal('')\n  const visible = createMemo(() =>\n    props.items.filter((i) => i.name.toLowerCase().includes(query().toLowerCase())),\n  )\n\n  return (\n    <div>\n      <input value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />\n      <p>{visible().length} matches</p>\n      <ul>\n        <For each={visible()}>{(i) => <li>{i.name}</li>}</For>\n      </ul>\n    </div>\n  )\n}"
        },
        "pyreon": {
          "label": "Pyreon",
          "file": "Search.tsx",
          "code": "import { For } from '@pyreon/core'\nimport { computed, signal } from '@pyreon/reactivity'\n\ntype Item = { id: number; name: string }\n\nexport function Search(props: { items: Item[] }) {\n  const query = signal('')\n  const visible = computed(() =>\n    props.items.filter((i) => i.name.toLowerCase().includes(query().toLowerCase())),\n  )\n\n  return (\n    <div>\n      <input value={query()} onInput={(e) => query.set(e.currentTarget.value)} />\n      <p>{visible().length} matches</p>\n      <ul>\n        <For each={visible} by={(i) => i.id}>\n          {(i) => <li>{i.name}</li>}\n        </For>\n      </ul>\n    </div>\n  )\n}"
        },
        "checked": "Solid side: typechecked against solid-js 1.9.17 under `tsc --strict`. Pyreon side: typechecked against the repo's `tsconfig` (0 errors), compiled with the real JSX compiler (`transformJSX`) and mounted in happy-dom; typing into the input filters the list."
      },
      "deletes": null,
      "pickTheOther": {
        "title": "When to pick Solid",
        "items": [
          "Bundle size is the deciding number: the same app is 7.5 KB in Solid and 17.2 KB in Pyreon.",
          "Your pages mount deep component trees and that cost dominates: Solid is 1.15–1.18× faster there.",
          "You want a stable 1.x API with a long production record."
        ]
      },
      "migrate": {
        "title": "Bring your Solid code with you.",
        "text": "`@pyreon/solid-compat` runs `createSignal`, stores, resources and the control-flow components. Convert to Pyreon's own API file by file.",
        "href": "/migrate/solid",
        "label": "Migrate from Solid"
      },
      "cta": {
        "title": "Same model, more in the box.",
        "command": "npm create @pyreon/zero@latest",
        "secondary": {
          "label": "Every result, including where we lose",
          "href": "/docs/benchmarks"
        }
      },
      "sources": [
        {
          "claim": "renderToString: card 8.95M vs 1.91M (4.68×), list-50 1.64×, list-1000 1.72×, layout 1.74×; byte-identical output enforced; one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 247–254"
        },
        {
          "claim": "Clear rows 130 vs Solid 460 µs; create 10,000 72.64 vs 78.75 ms (run 1 table)",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 89–90"
        },
        {
          "claim": "Deep tree loss 1.15–1.18×; dispose 500 loss 1.11–1.13×; effect update split",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §2, lines 119–122"
        },
        {
          "claim": "Bundle Solid 7.5 KB vs Pyreon 17.2 KB",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
        },
        {
          "claim": "form-bench: Pyreon fastest on all four ops; modular-forms heap 2.33 vs 2.42 MB",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §6, lines 274–279"
        },
        {
          "claim": "Signal tuple vs callable; For keyed by `by`; Index only in solid-compat",
          "path": "docs/src/content/docs/migrating-from-solid.md"
        },
        {
          "claim": "Solid Search sample typechecks (solid-js 1.9.17)",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/SearchSolid.tsx"
        }
      ]
    },
    {
      "id": "vue",
      "route": "/compare/vue",
      "rival": "Vue",
      "rivalMeasured": "vue 3.5.44 and Vue 3.6 Vapor 3.6.0-rc.11",
      "hook": {
        "eyebrow": "Pyreon vs Vue",
        "title": "Vue's reactivity without `.value`. In 1.6× less JavaScript.",
        "lede": "Pyreon signals are refs you call: `count()` reads, `count.set()` writes. Components are plain TSX, the same keyed-table app ships 17.2 KB against Vue's 27.4 KB, and compiled SSR came out ahead of Vue 3 at every size we measured."
      },
      "proof": [
        {
          "stat": "1.6×",
          "label": "less JavaScript: 17.2 KB against Vue's 27.4 KB for the same keyed-table app (gzip)",
          "condition": "final pass, sizes are deterministic",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
        },
        {
          "stat": "1.68×",
          "label": "faster compiled SSR at 10 rows (1.80 against 3.03 µs); 1.35× at 100 rows, 1.14× at 1,000",
          "condition": "one run; Vue's async renderToString awaited",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–245"
        },
        {
          "stat": "1.4×",
          "label": "faster when a memoised value blocks an update (memo wall): 11 µs against 16 µs",
          "condition": "real Chromium, both runs",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 123"
        }
      ],
      "table": {
        "title": "Pyreon and Vue, line by line.",
        "note": "Two Vues are in the record: Vue 3, the release you ship today, and Vue 3.6 Vapor, a release candidate that ties Pyreon on most raw DOM operations. Synthetic, author-run, Apple M3 Max, real Chromium unless noted. Reproduce: pyreon.dev/docs/benchmarks",
        "rows": [
          {
            "topic": "Bundle, same keyed-table app (gzip)",
            "pyreon": "17.2 KB",
            "rival": "27.4 KB",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
          },
          {
            "topic": "Compiled SSR, 10 / 100 / 1,000 rows",
            "pyreon": "1.80 / 11.64 / 109.9 µs",
            "rival": "3.03 / 15.66 / 124.9 µs (one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–243 (one run)"
          },
          {
            "topic": "Memo wall: blocked update",
            "pyreon": "11 / 11 µs",
            "rival": "16 / 16 µs (Vue was the fastest rival)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 123 (both runs)"
          },
          {
            "topic": "Hydration, 320-component page",
            "pyreon": "4.02 ms",
            "rival": "4.47 ms; both adopt all 2,206 server nodes (one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §4, line 231 (one run)"
          },
          {
            "topic": "Row board vs Vue 3: partial update / clear rows",
            "pyreon": "705 µs / 130 µs",
            "rival": "1.04 ms / 255 µs",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 85 and 89 (run 1)"
          },
          {
            "topic": "12-field form, keystroke with validation",
            "pyreon": "460 µs",
            "rival": "2,260 µs (vee-validate, one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §6, line 276 (one run)"
          },
          {
            "topic": "Row board vs Vue 3.6 Vapor (RC)",
            "pyreon": "Clear rows 1.11–1.12× faster.",
            "rival": "Create 1,000, replace, partial update, swap and remove: ties in both runs.",
            "verdict": "tie",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 99–101"
          },
          {
            "topic": "Hydration, 1,000-row keyed table",
            "pyreon": "6.07 / 6.04 ms total; framework walk tied",
            "rival": "6.02 / 5.99 ms: Vue has the faster median in both runs, 1.01× in run 2",
            "verdict": "rival",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §4, lines 224–229"
          },
          {
            "topic": "Authoring",
            "pyreon": "TSX functions; styling through styler or plain CSS.",
            "rival": "Single-file components: template, script and scoped style together.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-vue.md"
          },
          {
            "topic": "Native apps",
            "pyreon": "PMTC compiles the same components to SwiftUI and Compose (experimental).",
            "rival": "No first-party native target.",
            "verdict": "pyreon",
            "source": "docs/src/content/docs/multiplatform.md"
          },
          {
            "topic": "Ecosystem and maturity",
            "pyreon": "Pre-1.0.",
            "rival": "Nuxt, Pinia, Vue Router and years in production.",
            "verdict": "rival",
            "source": "00-brief/facts.md (status labels)"
          }
        ]
      },
      "code": {
        "title": "The same search box, twice.",
        "caption": "Vue's `v-model` is shorter than the Pyreon input line, fair's fair. What changes is `.value`, and that the template becomes TSX your editor and `tsc` already understand.",
        "rival": {
          "label": "Vue 3 single-file component",
          "file": "Search.vue",
          "code": "<script setup lang=\"ts\">\nimport { computed, ref } from 'vue'\n\ntype Item = { id: number; name: string }\nconst props = defineProps<{ items: Item[] }>()\n\nconst query = ref('')\nconst visible = computed(() =>\n  props.items.filter((i) => i.name.toLowerCase().includes(query.value.toLowerCase())),\n)\n</script>\n\n<template>\n  <div>\n    <input v-model=\"query\" />\n    <p>{{ visible.length }} matches</p>\n    <ul>\n      <li v-for=\"i in visible\" :key=\"i.id\">{{ i.name }}</li>\n    </ul>\n  </div>\n</template>"
        },
        "pyreon": {
          "label": "Pyreon",
          "file": "Search.tsx",
          "code": "import { For } from '@pyreon/core'\nimport { computed, signal } from '@pyreon/reactivity'\n\ntype Item = { id: number; name: string }\n\nexport function Search(props: { items: Item[] }) {\n  const query = signal('')\n  const visible = computed(() =>\n    props.items.filter((i) => i.name.toLowerCase().includes(query().toLowerCase())),\n  )\n\n  return (\n    <div>\n      <input value={query()} onInput={(e) => query.set(e.currentTarget.value)} />\n      <p>{visible().length} matches</p>\n      <ul>\n        <For each={visible} by={(i) => i.id}>\n          {(i) => <li>{i.name}</li>}\n        </For>\n      </ul>\n    </div>\n  )\n}"
        },
        "checked": "Vue side: parsed and compiled with `@vue/compiler-sfc` 3.5.44 (script and template, 0 errors). Pyreon side: typechecked against the repo's `tsconfig` (0 errors), compiled with the real JSX compiler (`transformJSX`) and mounted in happy-dom; typing into the input filters the list."
      },
      "deletes": {
        "title": "What you stop writing.",
        "items": [
          {
            "what": "`.value` on every ref read and write",
            "instead": "`count()` to read, `count.set(v)` or `count.update(fn)` to write."
          },
          {
            "what": "A template language beside TypeScript (`v-if`, `v-for`, `v-model`, `:prop`, `@event`)",
            "instead": "TSX: `<Show>`, `<For by>`, `value` plus `onInput`, ordinary props and handlers."
          }
        ]
      },
      "pickTheOther": {
        "title": "When to pick Vue",
        "items": [
          "You like single-file components with templates and scoped styles.",
          "You depend on Nuxt modules or the wider Vue ecosystem.",
          "Raw DOM speed is your only criterion: Vue 3.6 Vapor (RC) ties Pyreon on most row-board operations.",
          "You hydrate very large keyed tables: Vue was marginally faster there (1.01×, one of two runs)."
        ]
      },
      "migrate": {
        "title": "Keep your composables while you move.",
        "text": "`@pyreon/vue-compat` runs `ref`, `reactive`, `computed`, `watch`, lifecycle hooks and `provide`/`inject` on Pyreon. Templates move to TSX.",
        "href": "/migrate/vue",
        "label": "Migrate from Vue"
      },
      "cta": {
        "title": "Call your refs. Ship less.",
        "command": "npm create @pyreon/zero@latest",
        "secondary": {
          "label": "Every result, including where we lose",
          "href": "/docs/benchmarks"
        }
      },
      "sources": [
        {
          "claim": "Bundle Vue 27.4 KB vs Pyreon 17.2 KB (1.59× → 1.6×)",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
        },
        {
          "claim": "Compiled SSR vs Vue 3: 1.68× / 1.35× / 1.14×, one run, Vue awaited",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–245"
        },
        {
          "claim": "Memo wall blocked 11 vs Vue 16 µs, win 1.39–1.40× both runs",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §2, line 123"
        },
        {
          "claim": "App page hydration 4.02 vs Vue 4.47 ms, one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §4, line 231"
        },
        {
          "claim": "Hydration 1,000 rows: Vue faster median both runs, 1.01× in run 2; walk tie",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §4, lines 224–229"
        },
        {
          "claim": "Vue 3 partial update 1.04 ms, clear 255 µs vs Pyreon 705 / 130 µs (run 1)",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 85, 89"
        },
        {
          "claim": "Vapor RC ties create 1,000 / replace / partial / swap / remove; Pyreon clear 1.11–1.12×",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 99–101"
        },
        {
          "claim": "vee-validate keystroke (change mode) 2,260 vs 460 µs, one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §6, line 276"
        },
        {
          "claim": "Vue Search SFC compiles with @vue/compiler-sfc 3.5.44",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/{Search.vue,check.mjs}"
        }
      ]
    },
    {
      "id": "svelte",
      "route": "/compare/svelte",
      "rival": "Svelte",
      "rivalMeasured": "svelte 5.57.3",
      "hook": {
        "eyebrow": "Pyreon vs Svelte",
        "title": "2,047 components. Mounted 3× faster than Svelte 5.",
        "lede": "Svelte compiles components into direct DOM updates. So does Pyreon, from plain TSX instead of a `.svelte` file, and its server rendering came out ahead of Svelte 5 at 10, 100 and 1,000 rows. Miss writing `count++`? Plain Mode lets you."
      },
      "proof": [
        {
          "stat": "3.0×",
          "label": "faster to mount a 2,047-component tree: 3.59 ms against 10.80 ms",
          "condition": "real Chromium, run 1 table of a two-run record",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 119"
        },
        {
          "stat": "1.55×",
          "label": "faster compiled SSR at 100 rows (11.64 against 18.08 µs); 1.21× at 10 rows, 1.46× at 1,000",
          "condition": "one run",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–243"
        },
        {
          "stat": "1.9×",
          "label": "faster swapping two rows in 1,000: 805 µs against 1.50 ms",
          "condition": "real Chromium, run 1 table",
          "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 87"
        }
      ],
      "table": {
        "title": "Pyreon and Svelte, line by line.",
        "note": "Synthetic, author-run, Apple M3 Max, real Chromium unless noted. Reproduce: pyreon.dev/docs/benchmarks",
        "rows": [
          {
            "topic": "Mount a deep tree (2,047 components)",
            "pyreon": "3.59 ms",
            "rival": "10.80 ms",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 119 (run 1)"
          },
          {
            "topic": "Compiled SSR, 10 / 100 / 1,000 rows",
            "pyreon": "1.80 / 11.64 / 109.9 µs",
            "rival": "2.18 / 18.08 / 160.5 µs (one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–243 (one run)"
          },
          {
            "topic": "Create 10,000 rows",
            "pyreon": "72.64 ms",
            "rival": "87.51 ms",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 90 (run 1)"
          },
          {
            "topic": "Swap two rows in 1,000",
            "pyreon": "805 µs",
            "rival": "1.50 ms",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §1, line 87 (run 1)"
          },
          {
            "topic": "Memo wall: passthrough",
            "pyreon": "450 / 451 µs",
            "rival": "487 / 487 µs (Svelte was the fastest rival); Pyreon 1.08× in both runs",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 124"
          },
          {
            "topic": "12-field form, keystroke (blur mode)",
            "pyreon": "60 µs",
            "rival": "700 µs (Felte, one run)",
            "verdict": "pyreon",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §6, line 275 (one run)"
          },
          {
            "topic": "dbmon tick (every value changes)",
            "pyreon": "1.71 / 1.70 ms",
            "rival": "1.75 / 1.71 ms: a three-way tie with Octane",
            "verdict": "tie",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §2, line 118"
          },
          {
            "topic": "Bundle, same keyed-table app (gzip)",
            "pyreon": "17.2 KB",
            "rival": "16.1 KB: Svelte is 1.1 KB smaller",
            "verdict": "rival",
            "source": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
          },
          {
            "topic": "Authoring",
            "pyreon": "`.tsx` functions. Plain Mode (`'use plain'`) lets you write `let count = state(0)` and `count++`.",
            "rival": "`.svelte` files with runes, template blocks and scoped CSS.",
            "verdict": "different",
            "source": "docs/src/content/docs/migrating-from-svelte.md; docs/src/content/docs/plain-mode.md"
          },
          {
            "topic": "Native apps",
            "pyreon": "PMTC compiles the same components to SwiftUI and Compose (experimental).",
            "rival": "No first-party native target.",
            "verdict": "pyreon",
            "source": "docs/src/content/docs/multiplatform.md"
          },
          {
            "topic": "Ecosystem and maturity",
            "pyreon": "Pre-1.0.",
            "rival": "Svelte 5 is a stable major with SvelteKit and years in production.",
            "verdict": "rival",
            "source": "00-brief/facts.md (status labels)"
          }
        ]
      },
      "code": {
        "title": "The same search box, twice.",
        "caption": "Svelte's `bind:value` and direct assignment are terse; Pyreon spells the write out. In exchange the component is a TypeScript function, not a second file format.",
        "rival": {
          "label": "Svelte 5 (runes)",
          "file": "Search.svelte",
          "code": "<script lang=\"ts\">\n  type Item = { id: number; name: string }\n  let { items }: { items: Item[] } = $props()\n\n  let query = $state('')\n  const visible = $derived(\n    items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())),\n  )\n</script>\n\n<div>\n  <input bind:value={query} />\n  <p>{visible.length} matches</p>\n  <ul>\n    {#each visible as i (i.id)}\n      <li>{i.name}</li>\n    {/each}\n  </ul>\n</div>"
        },
        "pyreon": {
          "label": "Pyreon",
          "file": "Search.tsx",
          "code": "import { For } from '@pyreon/core'\nimport { computed, signal } from '@pyreon/reactivity'\n\ntype Item = { id: number; name: string }\n\nexport function Search(props: { items: Item[] }) {\n  const query = signal('')\n  const visible = computed(() =>\n    props.items.filter((i) => i.name.toLowerCase().includes(query().toLowerCase())),\n  )\n\n  return (\n    <div>\n      <input value={query()} onInput={(e) => query.set(e.currentTarget.value)} />\n      <p>{visible().length} matches</p>\n      <ul>\n        <For each={visible} by={(i) => i.id}>\n          {(i) => <li>{i.name}</li>}\n        </For>\n      </ul>\n    </div>\n  )\n}"
        },
        "checked": "Svelte side: compiled with the Svelte 5.57.3 compiler, 0 warnings. Pyreon side: typechecked against the repo's `tsconfig` (0 errors), compiled with the real JSX compiler (`transformJSX`) and mounted in happy-dom; typing into the input filters the list."
      },
      "deletes": {
        "title": "What you stop writing.",
        "items": [
          {
            "what": "The `.svelte` file format",
            "instead": "Plain `.tsx`: TypeScript, your linter and your editor read it with no extra language tooling."
          },
          {
            "what": "Template blocks (`{#if}`, `{#each}`, `bind:value`)",
            "instead": "`<Show>`, `<For each by>`, `value` plus `onInput`."
          }
        ]
      },
      "pickTheOther": {
        "title": "When to pick Svelte",
        "items": [
          "The smallest output matters more than mount or update cost: the same app is 16.1 KB in Svelte and 17.2 KB in Pyreon.",
          "You like single-file components with template blocks and scoped CSS.",
          "You want SvelteKit and a stable major version with a long production record."
        ]
      },
      "migrate": {
        "title": "Keep your stores while you move.",
        "text": "`@pyreon/svelte-compat` runs `svelte/store`, lifecycle and context on Pyreon. Components move to TSX.",
        "href": "/migrate/svelte",
        "label": "Migrate from Svelte"
      },
      "cta": {
        "title": "Compiled speed, in plain TypeScript.",
        "command": "npm create @pyreon/zero@latest",
        "secondary": {
          "label": "Every result, including where we lose",
          "href": "/docs/benchmarks"
        }
      },
      "sources": [
        {
          "claim": "Deep tree Svelte 10.80 ms vs Pyreon 3.59 ms (run 1)",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §2, line 119"
        },
        {
          "claim": "Compiled SSR vs Svelte 5: 2.18 / 18.08 / 160.5 vs 1.80 / 11.64 / 109.9 µs, one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §5, lines 241–243"
        },
        {
          "claim": "Create 10,000 87.51 ms, swap 1.50 ms for Svelte (run 1)",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §1, lines 87, 90"
        },
        {
          "claim": "Memo passthrough 450/451 vs Svelte 487/487 µs, 1.08× both runs",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §2, line 124"
        },
        {
          "claim": "dbmon three-way tie including Svelte",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §2, line 118"
        },
        {
          "claim": "Bundle Svelte 16.1 KB vs Pyreon 17.2 KB",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §7, line 285"
        },
        {
          "claim": "Felte keystroke blur 700 vs 60 µs, one run",
          "path": "00-brief/BENCHMARKS-2026-11-05.md §6, line 275"
        },
        {
          "claim": "Plain Mode: 'use plain', state(), count++",
          "path": "docs/src/content/docs/plain-mode.md; docs/src/content/docs/migrating-from-svelte.md"
        },
        {
          "claim": "Svelte Search compiles with svelte 5.57.3, no warnings",
          "path": "/tmp/wt-site-content/.scratch/site-compare/rivals/{Search.svelte,check.mjs}"
        }
      ]
    },
    {
      "id": "react-native",
      "route": "/compare/react-native",
      "rival": "React Native and Expo",
      "rivalMeasured": null,
      "hook": {
        "eyebrow": "Pyreon Native vs React Native",
        "title": "One .tsx. A website, an iPhone app and an Android app.",
        "lede": "Pyreon compiles your components to SwiftUI and Jetpack Compose views, so no JavaScript engine runs your UI on the device, and the same source server-renders on the web. The native targets are experimental; the web side is the mature part."
      },
      "proof": [
        {
          "stat": "22",
          "label": "canonical primitives (`Stack`, `Text`, `Field`, `Select`, `Scroll`…) that compile to SwiftUI and Compose views and render DOM on the web",
          "condition": "capability",
          "source": "docs/src/content/docs/primitives.md line 34"
        },
        {
          "stat": "No JS engine",
          "label": "under your UI on the device: the generated app is SwiftUI or Compose code (a WebView appears only where you host one)",
          "condition": "capability",
          "source": "docs/src/content/docs/compare-app-frameworks.md (comparison table)"
        },
        {
          "stat": "2",
          "label": "required device lanes in CI: XCUITest on an iOS Simulator and Compose instrumented tests on an Android emulator",
          "condition": "run when native paths change",
          "source": ".github/workflows/native-device.yml; .agents/guides/ci/README.md"
        }
      ],
      "table": {
        "title": "Pyreon Native and React Native, line by line.",
        "note": "Pyreon's native targets are experimental; React Native and Expo run production apps at scale. This table follows the repo's own comparison page and is honest about where Expo is ahead.",
        "rows": [
          {
            "topic": "UI on the device",
            "pyreon": "Generated SwiftUI and Compose: the platform's own widgets.",
            "rival": "Platform widgets through React Native's renderer; Expo UI adds SwiftUI and Compose components.",
            "verdict": "different",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "Runtime under the UI",
            "pyreon": "None: the app is a native binary.",
            "rival": "The Hermes JavaScript engine.",
            "verdict": "different",
            "source": "docs/src/content/docs/compare-app-frameworks.md (we publish no speed or size number for this)"
          },
          {
            "topic": "Web from the same source",
            "pyreon": "First-class: SSR, SSG, ISR, islands, SPA.",
            "rival": "react-native-web and Expo Router web; SSR is newer and still maturing.",
            "verdict": "pyreon",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "State model",
            "pyreon": "Signals lower to `@State` / `@Observable` in SwiftUI and `mutableStateOf` in Compose.",
            "rival": "React's re-render model.",
            "verdict": "different",
            "source": "00-brief/facts.md (native mappings); docs/src/content/docs/multiplatform.md"
          },
          {
            "topic": "Code outside the native subset",
            "pyreon": "A narrow, declarative subset compiles; the rest gets a named warning almost always.",
            "rival": "Runs the whole language everywhere.",
            "verdict": "rival",
            "source": "docs/src/content/docs/multiplatform.md; docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "Over-the-air updates",
            "pyreon": "Not possible for native logic: it is compiled.",
            "rival": "EAS Update ships JavaScript fixes between store reviews.",
            "verdict": "rival",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "Third-party native SDKs",
            "pyreon": "First-party hooks for common cases plus a `useNativeModule` bridge you write.",
            "rival": "The largest catalog (Expo SDK plus community).",
            "verdict": "rival",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "Hot reload on device",
            "pyreon": "Web: yes. Native: a rebuild per change, about 3 s warm with `pyreon-native dev`.",
            "rival": "Fast Refresh.",
            "verdict": "rival",
            "source": "docs/src/content/docs/compare-app-frameworks.md; docs/src/content/docs/native-dev-loop.md"
          },
          {
            "topic": "Build and submit service",
            "pyreon": "Local `xcodebuild` and `gradle`.",
            "rival": "EAS Build, Submit and Workflows.",
            "verdict": "rival",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "Animation",
            "pyreon": "Platform animation through `<Transition>`.",
            "rival": "Reanimated and Skia.",
            "verdict": "rival",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          },
          {
            "topic": "Maturity",
            "pyreon": "Experimental.",
            "rival": "Production.",
            "verdict": "rival",
            "source": "docs/src/content/docs/compare-app-frameworks.md"
          }
        ]
      },
      "code": {
        "title": "The same todo screen, twice.",
        "caption": "On the right, `<Stack>` becomes a `VStack` and a `Column`, `<Field>` a `TextField`, and `<Scroll>` around `<For>` a lazy list on both platforms. The same file renders DOM on the web.",
        "rival": {
          "label": "React Native",
          "file": "Todos.tsx",
          "code": "import { useState } from 'react'\nimport { Button, FlatList, Text, TextInput, View } from 'react-native'\n\ntype Todo = { id: number; text: string }\n\nexport function Todos() {\n  const [draft, setDraft] = useState('')\n  const [todos, setTodos] = useState<Todo[]>([])\n\n  const add = () => {\n    if (draft === '') return\n    setTodos([...todos, { id: todos.length + 1, text: draft }])\n    setDraft('')\n  }\n\n  return (\n    <View style={{ gap: 8, padding: 16 }}>\n      <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} placeholder=\"New todo\" />\n      <Button title=\"Add\" onPress={add} />\n      <FlatList\n        data={todos}\n        keyExtractor={(t) => String(t.id)}\n        renderItem={({ item }) => <Text>{item.text}</Text>}\n      />\n    </View>\n  )\n}"
        },
        "pyreon": {
          "label": "Pyreon (web, iOS, Android)",
          "file": "Todos.tsx",
          "code": "import { For } from '@pyreon/core'\nimport { Button, Field, Scroll, Stack, Text } from '@pyreon/primitives'\nimport { signal } from '@pyreon/reactivity'\n\ntype Todo = { id: number; text: string }\n\nexport function Todos() {\n  const draft = signal('')\n  const todos = signal<Todo[]>([])\n\n  const add = () => {\n    if (draft() === '') return\n    todos.set([...todos(), { id: todos().length + 1, text: draft() }])\n    draft.set('')\n  }\n\n  return (\n    <Stack gap=\"sm\" padding={4}>\n      <Field value={draft()} onChangeText={(t) => draft.set(t)} onSubmit={add} placeholder=\"New todo\" />\n      <Button onPress={add}>Add</Button>\n      <Scroll>\n        <For each={todos} by={(t) => t.id}>\n          {(t) => <Text>{t.text}</Text>}\n        </For>\n      </Scroll>\n    </Stack>\n  )\n}"
        },
        "checked": "Pyreon side: typechecked against the repo; lowered by the native compiler with the first-party plugins to SwiftUI (`VStack`, `TextField`, `ScrollView { LazyVStack }`) and Compose (`Column`, `TextField`, `LazyColumn`) with zero warnings; the Swift output passed the repo's SwiftUI typecheck. React Native side: written against the React Native core components; not compiled here."
      },
      "deletes": {
        "title": "What you stop writing.",
        "items": [
          {
            "what": "`useState` pairs, `useMemo`, `useCallback`, dependency arrays",
            "instead": "Signals and `computed`; the screen component runs once."
          },
          {
            "what": "`StyleSheet` pixel values",
            "instead": "Theme tokens: `padding={4}`, `gap=\"sm\"`."
          },
          {
            "what": "`keyExtractor` plus `renderItem`",
            "instead": "`<For each by>` inside `<Scroll>`, which becomes a lazy list on iOS and Android."
          }
        ]
      },
      "pickTheOther": {
        "title": "When to pick React Native or Expo",
        "items": [
          "You ship logic fixes over the air between store reviews: that is EAS Update, and compiled native code cannot do it.",
          "You depend on many third-party native SDKs and have no time to write bridges.",
          "Your app is graphics-heavy or animation-led (Reanimated, Skia).",
          "You must ship a production store app next quarter: Pyreon's native targets are experimental."
        ]
      },
      "migrate": {
        "title": "Coming from React Native and Expo?",
        "text": "There is no compat layer for React Native. The guide maps `View`, `Text`, `Pressable`, Expo Router and the `expo-*` modules to Pyreon, and lists what does not carry over.",
        "href": "/docs/migrating-from-react-native",
        "label": "Read the React Native guide"
      },
      "cta": {
        "title": "One codebase, three platforms. Try it.",
        "command": "npm create @pyreon/multiplatform@latest",
        "secondary": {
          "label": "The full comparison with Expo, Flutter, KMP and Capacitor",
          "href": "/docs/compare-app-frameworks"
        }
      },
      "sources": [
        {
          "claim": "Native targets experimental; web is the mature part",
          "path": "docs/src/content/docs/compare-app-frameworks.md (Read this first); 00-brief/facts.md status labels"
        },
        {
          "claim": "Comparison rows (UI, runtime, web, OTA, SDKs, hot reload ~3 s warm, EAS, animation, maturity)",
          "path": "docs/src/content/docs/compare-app-frameworks.md (Comparison table, Where Pyreon is behind)"
        },
        {
          "claim": "22 canonical primitives",
          "path": "docs/src/content/docs/primitives.md line 34; packages/native/compiler/src/canonical-primitives.ts"
        },
        {
          "claim": "Named warning 'almost always' outside the subset",
          "path": "docs/src/content/docs/multiplatform.md; 00-brief/facts.md"
        },
        {
          "claim": "Required native CI lanes (XCUITest, Compose instrumented tests)",
          "path": ".github/workflows/native-device.yml; 00-brief/facts.md line 213"
        },
        {
          "claim": "Signals → @State/@Observable and mutableStateOf",
          "path": "00-brief/facts.md (native mappings); docs/src/content/docs/multiplatform.md"
        },
        {
          "claim": "Tokens-first styling replaces StyleSheet pixel numbers; Scroll + For lowers to lazy lists",
          "path": "docs/src/content/docs/migrating-from-react-native.md; docs/src/content/docs/primitives.md (Scroll)"
        },
        {
          "claim": "Todos sample lowers to SwiftUI + Compose with zero warnings; Swift typecheck ok",
          "path": "/tmp/wt-site-content/.scratch/site-compare/{Todos.tsx,native2.ts} (run 11 Nov 2026)"
        }
      ]
    }
  ],
  "template": {
    "meta": {
      "title": "Pyreon vs {rival}: {title} · Pyreon"
    },
    "index": {
      "title": "Compare Pyreon",
      "label": "Pyreon vs {rival} →"
    },
    "switcher": "Compare with",
    "proofLink": {
      "label": "Every result, including where we lose →",
      "href": "/benchmarks"
    },
    "table": {
      "label": "side by side",
      "measured": "Measured against {versions}",
      "method": {
        "label": "Method and every result →",
        "href": "/benchmarks"
      }
    },
    "chart": {
      "measured": {
        "label": "measured",
        "title": "The measured rows, drawn.",
        "scroll": "Pyreon vs {rival}, measured"
      },
      "diagram": {
        "label": "how it works",
        "title": "The two stacks, drawn.",
        "scroll": "Pyreon vs {rival}, diagram",
        "caveat": "Diagram, not a measurement."
      },
      "link": {
        "label": "How we measure →",
        "href": "/benchmarks"
      }
    },
    "code": {
      "label": "same component"
    },
    "deletes": {
      "label": "the code you delete",
      "before": "Stop writing",
      "after": "Instead",
      "item": "stop writing"
    },
    "migrate": {
      "eyebrow": "migration"
    }
  }
} satisfies CompareSite
