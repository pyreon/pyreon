// Written by scripts/sync-site-content.ts from _project.json. Do not edit: re-run the sync.
// Typecheck only (never imported): fails when _project.json does not match ProjectFile.
import type { ProjectFile } from './types-site'

export const checked = {
 "status": {
  "id": "status",
  "route": "/status",
  "title": "Status",
  "lede": "Pyreon is pre-1.0. This page says what that means: how versions change, which parts are mature, which are experimental, and which directions are under consideration. Nothing here is a dated commitment.",
  "sections": [
   {
    "kind": "list",
    "title": "Versioning",
    "items": [
     {
      "title": "Pre-1.0, one version for everything",
      "text": "Every published `@pyreon/*` package is released as one fixed version group, so every release gives all of them the same version number. The current version is in any package's `package.json` and on npm."
     },
     {
      "title": "Breaking changes are minor bumps",
      "text": "While the version is `0.x`, a breaking change ships as a `minor` release. Patch releases do not intentionally break APIs. Every consumer-affecting change in a published package carries a changeset, and CI refuses a changeset that declares a major bump."
     },
     {
      "title": "Release notes",
      "text": "Each package's `CHANGELOG.md`, also served by the MCP `get_changelog` tool, so an AI assistant can read what changed between your version and the latest."
     },
     {
      "title": "Version skew",
      "text": "`pyreon info` reports the installed `@pyreon/*` versions and flags skew; `pyreon upgrade` aligns them."
     }
    ]
   },
   {
    "kind": "table",
    "title": "What is mature and what is experimental",
    "columns": [
     "Area",
     "State"
    ],
    "rows": [
     [
      "Reactivity, core, runtime-dom, router, head, server, vite-plugin",
      "Core web framework; the surface most apps use. Pre-1.0 versioning rules apply."
     ],
     [
      "`@pyreon/zero` (SSR, SSG, ISR, SPA, islands)",
      "Web meta-framework with build-time mode verification (`verify-modes`) and real-browser end-to-end suites in CI."
     ],
     [
      "Fundamentals (`store`, `form`, `query`, `table`, `i18n`, `validation`, …)",
      "Libraries for the web; several also have native runtimes."
     ],
     [
      "Native targets (iOS / Android via PMTC)",
      "{dot:warn}Experimental."
     ]
    ]
   },
   {
    "kind": "story",
    "title": "What \"device-proven\" means",
    "text": [
     "The native targets are measured, not described. The multi-platform docs carry a weighted capability matrix: each category is credited only for behaviour asserted on a real iOS Simulator or Android emulator (a user-visible effect checked by an XCUITest or Compose test), not for code that merely compiles. A CI gate recomputes the headline figure from the table, so it cannot drift from the evidence.",
     "Use the matrix to decide. If the capabilities your app needs are credited at the device level, they are exercised in CI; if not, treat them as unproven. The matrix also shows the weakest rows, such as payments, crash reporting, store release and push."
    ]
   },
   {
    "kind": "links",
    "title": "Check the evidence",
    "items": [
     {
      "label": "Capability matrix",
      "href": "/docs/multiplatform",
      "text": "The weighted, device-level matrix at the bottom of the multi-platform page."
     },
     {
      "label": "Library status",
      "href": "/docs/multiplatform-libraries",
      "text": "Which libraries have native runtimes."
     },
     {
      "label": "Pyreon vs Expo, React Native, Flutter",
      "href": "/docs/compare-app-frameworks",
      "text": "The comparison, including where Pyreon is behind."
     }
    ]
   },
   {
    "kind": "list",
    "title": "Promises you can rely on",
    "items": [
     {
      "title": "Named failures over silent ones",
      "text": "Code outside the native subset almost always gets a named compiler warning instead of a silent miscompile, and CI gates exist to close the rest."
     },
     {
      "title": "Comparisons in one place",
      "text": "Claims about other frameworks live on one page, including where Pyreon is behind."
     },
     {
      "title": "Generated docs are checked",
      "text": "API references, `llms.txt` and the MCP reference are generated from package manifests and verified in CI, so they do not silently describe an older API."
     }
    ]
   },
   {
    "kind": "list",
    "title": "On the way to 1.0: directions under consideration",
    "text": "There is no dated 1.0 plan. These directions are not scheduled and may change; they are the biggest gaps the comparison page identifies against the leading app ecosystems.",
    "items": [
     {
      "title": "Native errors and store submission",
      "text": "Native errors mapped back to the `.tsx` source, and a documented sign-and-submit path for TestFlight and Play. The rebuild-and-relaunch loop already ships as `pyreon-native dev`."
     },
     {
      "title": "A stronger third-party native story",
      "text": "More first-party service bindings (payments, push providers, analytics) and a documented way for packages to ship their own `native/` sources, building on `useNativeModule`."
     },
     {
      "title": "Updates between store releases",
      "text": "A documented answer using data-driven remote configuration and WebView islands, stated alongside what cannot be done within store rules."
     },
     {
      "title": "AI-agent readiness for native projects",
      "text": "The multi-platform scaffold already writes `AGENTS.md`, `CLAUDE.md` and `.mcp.json`; the editor-specific rules the web scaffold can generate are not included yet."
     },
     {
      "title": "End-to-end test recipes",
      "text": "Recipes for generated apps and a CI template for building them."
     }
    ]
   },
   {
    "kind": "note",
    "text": "Progress on the native side shows in the matrix; everything else shows in the changelogs. If a gap on this list blocks you, say so in a GitHub issue. It is the most useful input we can get.",
    "href": "https://github.com/pyreon/pyreon/issues"
   }
  ],
  "end": {
   "title": "Pre-1.0, and specific about it.",
   "cta": {
    "label": "Read the stability page",
    "href": "/docs/stability-and-direction"
   }
  },
  "sources": [
   {
    "claim": "Fixed version group; breaking = minor in 0.x; CI refuses major; CHANGELOG.md + get_changelog; pyreon info / upgrade",
    "path": "docs/src/content/docs/stability-and-direction.md \"Versioning\""
   },
   {
    "claim": "Mature vs experimental table",
    "path": "docs/src/content/docs/stability-and-direction.md \"What is mature and what is experimental\""
   },
   {
    "claim": "Device-proven definition, weighted matrix, CI gate, weakest rows",
    "path": "docs/src/content/docs/stability-and-direction.md \"What device-proven means\""
   },
   {
    "claim": "Compatibility promises",
    "path": "docs/src/content/docs/stability-and-direction.md \"Compatibility promises you can rely on\""
   },
   {
    "claim": "Five directions, not scheduled",
    "path": "docs/src/content/docs/stability-and-direction.md \"Directions under consideration\""
   },
   {
    "claim": "Matrix lives on the multi-platform page (percentage deliberately not quoted)",
    "path": "docs/src/content/docs/multiplatform.md \"Production capability matrix (weighted, rung-labeled)\""
   }
  ]
 },
 "releases": {
  "id": "releases",
  "route": "/releases",
  "title": "Releases",
  "lede": "Every merged change that affects users carries a changeset. Releases are cut from `main` by a workflow, and every `@pyreon/*` package ships at the same version.",
  "sections": [
   {
    "kind": "steps",
    "title": "How a release happens",
    "items": [
     {
      "title": "A change lands with a changeset",
      "text": "Each pull request that changes a published package adds a changeset (`bun changeset`) describing the change for users. While Pyreon is `0.x`, a changeset is `minor` or `patch`, never `major`; a breaking change is written as `minor` and called out in the prose."
     },
     {
      "title": "Changesets collects them",
      "text": "On every push to `main`, the release workflow gathers the unreleased changesets into one \"Version Packages\" pull request, with the version bumps and changelog entries."
     },
     {
      "title": "Merging it publishes",
      "text": "When that pull request merges, every package is published to npm with provenance, at one shared version, and GitHub releases are created."
     },
     {
      "title": "You align with one command",
      "text": "`pyreon upgrade` aligns your `@pyreon/*` versions and runs the codemods for each release it crosses. It is a dry run until you pass `--write`."
     }
    ]
   },
   {
    "kind": "links",
    "title": "Where the changelog lives",
    "items": [
     {
      "label": "Per-package CHANGELOG.md",
      "href": "https://github.com/pyreon/pyreon/tree/main/packages",
      "text": "Each package keeps its own `CHANGELOG.md`, with every entry linked to its pull request."
     },
     {
      "label": "GitHub releases",
      "href": "https://github.com/pyreon/pyreon/releases",
      "text": "A release for each published package."
     },
     {
      "label": "MCP `get_changelog`",
      "href": "/docs/mcp",
      "text": "Lets your AI assistant read what changed between your version and the latest."
     },
     {
      "label": "Blog",
      "href": "/blog",
      "text": "The stories behind the bigger changes. RSS at `/blog/rss.xml`."
     }
    ]
   },
   {
    "kind": "list",
    "title": "New on main, shipping in the next release",
    "text": "Merged and unreleased. Each item is on `main` today and goes out with the next release.",
    "items": [
     {
      "title": "More TypeScript compiles to iOS and Android",
      "text": "`effect()` in a component body, timers, `Date`, TypeScript enums, module-scope signals, `throw` / `try` / `catch`, `JSON.parse` and a `@pyreon/validate` schema's `.parse(x)` now lower to SwiftUI and Compose. The native targets remain experimental.",
      "status": "next release"
     },
     {
      "title": "`<Select>` and date/time `<Field>`",
      "text": "`<Select>` uses each platform's own picker; `<Field kind=\"date\" | \"time\" | \"datetime\">` with `min` / `max` opens the native date and time pickers.",
      "status": "next release"
     },
     {
      "title": "More hooks on native",
      "text": "`useDocumentVisibility`, `usePrevious`, `useUpdateEffect`, `useReducedMotion`, `useKeyboard`, `useInfiniteQuery`, `useLatest` and a colour-scheme `useMediaQuery`.",
      "status": "next release"
     },
     {
      "title": "`queryOptions` in `@pyreon/query`",
      "text": "`queryOptions`, `infiniteQueryOptions` and `mutationOptions`: declare a query once, reuse it in hooks and the client, and `client.getQueryData(opts.queryKey)` is typed without a generic.",
      "status": "next release"
     },
     {
      "title": "Head tags no longer duplicate on hydration",
      "text": "A server-rendered page keeps exactly one copy of each `<meta>`, `<link>` and JSON-LD tag.",
      "status": "next release"
     },
     {
      "title": "`mode: 'auto'` prerenders inferred-SSG routes",
      "text": "In a build that also has SSR routes, pages inferred as SSG are now prerendered. `mode: 'auto'` stays experimental.",
      "status": "next release"
     },
     {
      "title": "Hydration-stable `createUniqueId()`",
      "text": "Ids in server HTML now match the hydrated component's (a per-request counter on the server, one namespace per island).",
      "status": "next release"
     },
     {
      "title": "`@pyreon/validate/mini`",
      "text": "Ships without the runtime JIT: a 4-field object schema is 5.2 KB gzip through `mini` against 13.8 KB through the main entry (author-measured). `enableJit()` from `@pyreon/validate/jit` restores the JIT.",
      "status": "next release"
     },
     {
      "title": "Scheduled content in `@pyreon/zero-content`",
      "text": "`publishDate: 'date'` plus `unpublished: 'omit'` keeps future-dated entries out of a production build until their date; `PYREON_CONTENT_NOW=<date>` previews the site as it will look then.",
      "status": "next release"
     },
     {
      "title": "Security fixes",
      "text": "`@pyreon/zero` takes the request origin from `Host` for its server-action origin check, and no longer serves build internals; `@pyreon/mcp` and `@pyreon/lathe` validate tool arguments before they reach `git` or the filesystem; native `<WebView>` scopes its bridge to the loaded page's origin.",
      "status": "next release"
     }
    ]
   },
   {
    "kind": "note",
    "text": "Breaking change in the next release: `@pyreon/store`'s `subscribe` callback now receives the state as `mutation.state`, and the old second `state` argument is gone. Update `subscribe((mutation, state) => …)` to read `mutation.state`.",
    "href": "/docs/store"
   }
  ],
  "end": {
   "title": "Every change has a changeset. Every changeset has a line in a changelog.",
   "cta": {
    "label": "Browse releases on GitHub",
    "href": "https://github.com/pyreon/pyreon/releases"
   }
  },
  "sources": [
   {
    "claim": "Changesets flow: Version Packages PR, publish with provenance on merge, GitHub release",
    "path": "CONTRIBUTING.md \"Releases\" / \"Release workflow\"; .github/workflows/release.yml"
   },
   {
    "claim": "No major changesets in 0.x; CI guard and release-time cap",
    "path": "CONTRIBUTING.md \"0.x version policy\"; scripts/check-no-major-changesets.ts"
   },
   {
    "claim": "One fixed version group",
    "path": ".changeset/config.json \"fixed\"; docs/src/content/docs/stability-and-direction.md"
   },
   {
    "claim": "Per-package CHANGELOG.md with PR links",
    "path": "packages/core/core/CHANGELOG.md (example)"
   },
   {
    "claim": "GitHub releases per package exist",
    "path": "gh release list -R pyreon/pyreon (checked 11 Nov)"
   },
   {
    "claim": "pyreon upgrade aligns, codemods only with --write",
    "path": "00-brief/facts.md; docs/src/content/docs/cli.md"
   },
   {
    "claim": "Unreleased highlights (#4134, #4136, #4154, #4146, #4155, #4100–#4102, #4056, #4057, hooks, #4188, #4161, #4138, #4160, #4193, zero-content scheduling, #4209, #4211, #4215, #4222)",
    "path": "00-brief/facts.md \"What shipped since 5 Nov\" (checked against origin/main 2655fa3b4)"
   },
   {
    "claim": "validate/mini 5.2 vs 13.8 KB is author-measured",
    "path": "docs/src/content/docs/validate.md"
   },
   {
    "claim": "store subscribe breaking change",
    "path": "docs/src/content/docs/store.md"
   }
  ]
 },
 "community": {
  "id": "community",
  "route": "/community",
  "title": "Community",
  "lede": "Pyreon is built in the open under the MIT license. Here is where to talk, how to contribute, and where to watch it grow.",
  "sections": [
   {
    "kind": "links",
    "title": "Where to find us",
    "items": [
     {
      "label": "Discord",
      "href": "https://pyreon.dev/discord",
      "text": "Questions, show-and-tell, and talking to the people who build it."
     },
     {
      "label": "GitHub",
      "href": "https://github.com/pyreon/pyreon",
      "text": "The code, the issues and every pull request. A star helps other people find it."
     },
     {
      "label": "Newsletter",
      "href": "https://pyreon.dev/newsletter",
      "text": "What shipped, what we measured, what is next. In your inbox."
     },
     {
      "label": "Blog",
      "href": "/blog",
      "text": "Long-form posts on how Pyreon works. Full-content RSS at `/blog/rss.xml`."
     },
     {
      "label": "Live stats",
      "href": "https://pyreon.dev/open",
      "text": "Stars, downloads, releases and contributors, refreshed daily."
     }
    ]
   },
   {
    "kind": "steps",
    "title": "Your first contribution",
    "items": [
     {
      "title": "Get the repo running",
      "text": "You need Bun and Node.js. `bun install` also builds every package.",
      "code": "git clone https://github.com/pyreon/pyreon.git\ncd pyreon\nbun install\nbun run test"
     },
     {
      "title": "Branch from main",
      "text": "Fork the repo and create a feature branch from `main`. Keep commits focused: one logical change each, with an imperative message such as `fix(router): prevent open redirect via sanitizePath`."
     },
     {
      "title": "Write the test",
      "text": "Every change comes with test coverage. Run one package with `bun run --filter='@pyreon/<pkg>' test`."
     },
     {
      "title": "Check it",
      "text": "Run the linters and the typecheck before you push.",
      "code": "bun run lint\nbun run typecheck"
     },
     {
      "title": "Add a changeset",
      "text": "If you touched a published package, describe the change for users. Pyreon is `0.x`: pick `minor` or `patch`, never `major`.",
      "code": "bun changeset"
     },
     {
      "title": "Open the pull request",
      "text": "Say what changed and why. CI runs the rest."
     }
    ]
   },
   {
    "kind": "links",
    "title": "Pick something to work on",
    "items": [
     {
      "label": "Good first issues",
      "href": "https://github.com/pyreon/pyreon/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22",
      "text": "Issues picked for newcomers. If the list is empty, open an issue saying what you would like to work on and we will find you a first task.",
      "withChannel": {
       "discord": {
        "text": "Issues picked for newcomers. If the list is empty, tell us on Discord what you would like to work on."
       }
      }
     },
     {
      "label": "Help wanted",
      "href": "https://github.com/pyreon/pyreon/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22",
      "text": "Issues where extra hands are welcome."
     },
     {
      "label": "Contributing guide",
      "href": "https://github.com/pyreon/pyreon/blob/main/CONTRIBUTING.md",
      "text": "Setup, conventions, the memory-leak checklist and how releases work."
     }
    ]
   },
   {
    "kind": "list",
    "title": "Reporting a bug",
    "items": [
     {
      "title": "Search first",
      "text": "Someone may have hit it already."
     },
     {
      "title": "Make it small",
      "text": "A code snippet, a repo link or a failing test."
     },
     {
      "title": "Say where",
      "text": "Your Bun version, OS and, if relevant, browser."
     }
    ]
   }
  ],
  "end": {
   "title": "Come for the signals. Stay for the changelog.",
   "cta": {
    "label": "Watch the releases",
    "href": "https://github.com/pyreon/pyreon/releases",
    "withChannel": {
     "discord": {
      "label": "Join the Discord",
      "href": "https://pyreon.dev/discord"
     }
    }
   }
  },
  "sources": [
   {
    "claim": "Live stats at /open (refreshed daily); never quote counts. /discord and /newsletter appear only once their address is set in docs/src/site-links.ts",
    "path": "00-brief/facts.md \"Identity\""
   },
   {
    "claim": "MIT license",
    "path": "LICENSE; CONTRIBUTING.md \"License\""
   },
   {
    "claim": "Blog and full-content RSS at /blog/rss.xml",
    "path": "docs/src/routes/blog/; docs/README.md \"Blog\""
   },
   {
    "claim": "Setup commands, fork and branch from main, tests, lint and typecheck, focused commits, commit message example",
    "path": "CONTRIBUTING.md \"Getting Started\", \"Submitting Changes\", \"Commit Messages\""
   },
   {
    "claim": "Per-package test command; bun install builds packages",
    "path": "AGENTS.md \"Commands\""
   },
   {
    "claim": "Changeset required; minor or patch only",
    "path": "CONTRIBUTING.md \"Releases\""
   },
   {
    "claim": "Bug report checklist",
    "path": "CONTRIBUTING.md \"Reporting Bugs\""
   },
   {
    "claim": "Labels \"good first issue\" and \"help wanted\" exist",
    "path": "gh label list -R pyreon/pyreon (checked 11 Nov)"
   }
  ]
 },
 "brand": {
  "id": "brand",
  "route": "/brand",
  "title": "Brand",
  "lede": "The Pyreon mark, colours and type, and the few rules that keep them meaning something. Download the files, use them to talk about Pyreon, and keep the ember for the moment a signal changes.",
  "sections": [
   {
    "kind": "logos",
    "title": "The mark",
    "text": "The mark is the \"-on\" from the wordmark: a solid ember disc for the `o` (one lit particle) and a heavy bracket-stroke `n`. It is drawn on a 120 × 120 grid. Write the name \"Pyreon\", never \"PyreonJS\".",
    "items": [
     {
      "file": "logo-on-color.svg",
      "href": "/brand/logo-on-color.svg",
      "use": "Primary mark. Ember disc, paper `n`. Dark backgrounds only: the `n` is paper-coloured and disappears on light.",
      "background": "#0A0A0E"
     },
     {
      "file": "logo-on-mono-dark.svg",
      "href": "/brand/logo-on-mono-dark.svg",
      "use": "One colour, paper (#F4EFE6). For dark backgrounds and single-colour print on dark.",
      "background": "#0A0A0E"
     },
     {
      "file": "logo-on-mono-light.svg",
      "href": "/brand/logo-on-mono-light.svg",
      "use": "One colour, ink (#14141C in the file). For paper and light backgrounds.",
      "background": "#FAF5EB"
     },
     {
      "file": "favicon.svg",
      "href": "/favicon.svg",
      "use": "The colour mark on a rounded ink tile, sized 32 × 32. Browser tabs and app icons.",
      "background": "#FAF5EB"
     }
    ]
   },
   {
    "kind": "list",
    "title": "Using the mark",
    "items": [
     {
      "title": "Clear space",
      "text": "Keep at least half the disc's radius free on every side: 11 units on the 120-unit grid, about 9% of the mark's width."
     },
     {
      "title": "Minimum size",
      "text": "Colour mark: 32 px. One-colour mark: 16 px."
     },
     {
      "title": "With the wordmark",
      "text": "Set \"pyreon\" in lower case, Space Grotesk 600, at 0.7 × the mark's height, with a gap of 0.22 × its height, on the baseline of the `n`."
     },
     {
      "title": "Ember \"on\"",
      "text": "In a hero you may set \"pyre\" in ink or paper and give the trailing \"on\" the ember gradient. Once per page at most."
     }
    ]
   },
   {
    "kind": "palette",
    "title": "Colour",
    "text": "Two neutrals, one gradient, two cool accents. Ember marks signal propagation and active state; everything else stays quiet.",
    "swatches": [
     {
      "name": "Ink",
      "hex": "#0A0A0E",
      "role": "Dark background, text on paper"
     },
     {
      "name": "Paper",
      "hex": "#F4EFE6",
      "role": "Text on ink, code wells on light"
     },
     {
      "name": "Page paper",
      "hex": "#FAF5EB",
      "role": "Light page background"
     },
     {
      "name": "Ember plasma",
      "hex": "#FF1F8C",
      "role": "Gradient start"
     },
     {
      "name": "Ember core",
      "hex": "#FF5E1A",
      "role": "Gradient middle, the signal pulse"
     },
     {
      "name": "Ember warm",
      "hex": "#FFC83D",
      "role": "Gradient end"
     },
     {
      "name": "Ember on paper",
      "hex": "#A8380A",
      "role": "Text-safe ember for type on paper"
     },
     {
      "name": "Cyan",
      "hex": "#22D3EE",
      "role": "Links and interactive elements on ink"
     },
     {
      "name": "Cyan on paper",
      "hex": "#0A6E89",
      "role": "Links and interactive elements on paper"
     },
     {
      "name": "Violet",
      "hex": "#A78BFA",
      "role": "Types in code, secondary accent"
     }
    ],
    "gradient": {
     "name": "Ember gradient",
     "css": "linear-gradient(95deg, #FF1F8C 0%, #FF5E1A 55%, #FFC83D 100%)",
     "role": "The mark's disc, the \"on\" of the wordmark, a winning cell"
    }
   },
   {
    "kind": "type",
    "title": "Type",
    "faces": [
     {
      "name": "Space Grotesk",
      "weights": [
       400,
       500,
       600,
       700
      ],
      "role": "Headings, body and the wordmark. Headings from 22 px up get negative letter-spacing, tighter as they grow.",
      "href": "https://fonts.google.com/specimen/Space+Grotesk"
     },
     {
      "name": "JetBrains Mono",
      "weights": [
       400,
       500
      ],
      "role": "Code, and the small upper-case eyebrow labels above sections.",
      "href": "https://fonts.google.com/specimen/JetBrains+Mono"
     }
    ]
   },
   {
    "kind": "story",
    "title": "Motion",
    "text": [
     "When a value changes, only the node that reads it moves: a 200 ms pulse from its resting colour to ember core and back, easing `cubic-bezier(.2, .7, .3, 1)`. Nothing else animates: no page transitions, hover effects or loaders in ember.",
     "With reduced motion, the pulse becomes a static 2 px ember underline, so the meaning survives without the movement."
    ]
   },
   {
    "kind": "dodont",
    "title": "Do and don't",
    "items": [
     {
      "do": "Use the colour mark on ink.",
      "dont": "Put the colour mark on paper; its `n` vanishes. Use the one-colour ink mark instead.",
      "why": "Contrast."
     },
     {
      "do": "Scale the mark as a whole.",
      "dont": "Stretch, rotate, outline or re-colour the gradient.",
      "why": "The disc and the `n` are one letterform."
     },
     {
      "do": "Keep ember for change and active state.",
      "dont": "Use ember as a full-bleed background, a default button fill or a decorative border.",
      "why": "Overused, it stops meaning \"this changed\"."
     },
     {
      "do": "\"2.6× faster than React at 10,000 rows (synthetic, author-run).\"",
      "dont": "\"Lightning-fast. Crushes the competition.\"",
      "why": "A number someone can check beats an adjective nobody can."
     },
     {
      "do": "Write \"Pyreon\".",
      "dont": "Write \"PyreonJS\" or \"Pyreon.js\".",
      "why": "One name everywhere."
     }
    ]
   }
  ],
  "end": {
   "title": "One lit particle. Use it where something changes.",
   "cta": {
    "label": "Download the colour mark",
    "href": "/brand/logo-on-color.svg"
   }
  },
  "sources": [
   {
    "claim": "Mark concept, construction on 120 grid, clear space 11 units (~9%), min sizes 32/16 px, lockup ratios, ember \"on\" once per page",
    "path": "09-site/reference/design_handoff_pyreon_brand/README.md §2"
   },
   {
    "claim": "Logo files served from docs/public/brand/ and docs/public/favicon.svg; color mark n stroke #F4EFE6; mono-light fill #14141C; favicon 32×32 ink tile",
    "path": "docs/public/brand/logo-on-*.svg; docs/public/favicon.svg"
   },
   {
    "claim": "Unified palette hexes and gradient angle",
    "path": "maintainer brief for the site (11 Nov); README §3 for the ember stops, 95deg gradient and roles"
   },
   {
    "claim": "Ember only for propagation/active state; never full-bleed, default CTA fill or decorative border",
    "path": "design handoff README §3 \"Ember\""
   },
   {
    "claim": "Space Grotesk 400–700; JetBrains Mono for code and eyebrows; negative letter-spacing from 22 px",
    "path": "design handoff README §4 (weights narrowed to 400/500 for mono per the site brief)"
   },
   {
    "claim": "Motion: 200 ms pulse, easing, reduced-motion underline",
    "path": "design handoff README §5"
   },
   {
    "claim": "Name is Pyreon, never PyreonJS",
    "path": "00-brief/facts.md \"Identity\""
   },
   {
    "claim": "2.6× at 10,000 rows",
    "path": "BENCHMARKS.md §1"
   }
  ]
 },
 "notFound": {
  "id": "not-found",
  "route": "/404",
  "code": "404",
  "title": "signal not found",
  "text": "the path you asked for has no readers",
  "lede": "Nothing subscribed to this URL, so nothing rendered. Unlike our components, you can try again.",
  "snippet": "const page = signal(undefined) // 0 readers",
  "links": [
   {
    "label": "Home",
    "href": "/",
    "text": "Start where everything is wired up."
   },
   {
    "label": "Docs",
    "href": "/docs",
    "text": "200+ pages, each with readers."
   },
   {
    "label": "Benchmarks",
    "href": "/benchmarks",
    "text": "Every result, ties and losses included."
   },
   {
    "label": "Report a broken link",
    "href": "https://github.com/pyreon/pyreon/issues",
    "text": "If a link brought you here, tell us where."
   }
  ],
  "sources": [
   {
    "claim": "\"signal not found · the path you asked for has no readers\"",
    "path": "09-site/reference/design_handoff_pyreon_brand/README.md §6.1 \"Branded 404\""
   },
   {
    "claim": "Docs site has 200+ pages",
    "path": "AGENTS.md (226 pages; 223 files counted) via 00-brief/facts.md"
   }
  ]
 }
} satisfies ProjectFile
