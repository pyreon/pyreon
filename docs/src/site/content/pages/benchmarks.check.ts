// Written by scripts/sync-site-content.ts from content/_benchmarks.json. Do not edit: re-run the sync.
// Typecheck only (never imported): fails when _benchmarks.json does not match BenchmarksPage.
import type { BenchmarksPage } from '../types-site'

export const checked = {
  "record": "BENCHMARKS.md 2026-11-24",
  "frameworks": [
    "Vanilla",
    "Pyreon",
    "Vue 3.6 Vapor (RC)",
    "Octane 0.19",
    "Vue 3",
    "Solid 1.9",
    "Solid 2.0",
    "Svelte 5",
    "React 19",
    "Preact"
  ],
  "rowBoard": {
    "create 1,000 rows": [
      6.62,
      7.29,
      7.25,
      7.39,
      7.33,
      8.02,
      8.02,
      8.16,
      9.13,
      10.37
    ],
    "replace all rows": [
      6.63,
      7.14,
      7.19,
      7.09,
      7.23,
      8.01,
      7.92,
      8.02,
      9.11,
      10.35
    ],
    "partial update": [
      0.695,
      0.68,
      0.68,
      0.68,
      1.04,
      1.19,
      1.28,
      0.785,
      0.91,
      0.935
    ],
    "select row": [
      0.005,
      0.01,
      0.025,
      0.025,
      0.355,
      0.025,
      0.07,
      0.35,
      0.27,
      0.285
    ],
    "swap rows": [
      0.745,
      0.745,
      0.75,
      0.825,
      1.06,
      0.965,
      0.835,
      1.49,
      5.92,
      0.995
    ],
    "remove row": [
      5.75,
      5.7,
      5.64,
      5.52,
      5.9,
      5.79,
      5.73,
      6.38,
      6.01,
      5.89
    ],
    "clear rows": [
      0.095,
      0.125,
      0.145,
      0.14,
      0.225,
      0.525,
      0.295,
      0.345,
      0.655,
      0.26
    ],
    "create 10,000 rows": [
      66.8,
      73.09,
      74.38,
      73.98,
      73.89,
      78.79,
      79.79,
      87.54,
      195.91,
      283.66
    ],
    "append 1k → 10k": [
      11.84,
      13,
      62.12,
      13.24,
      62.88,
      13.87,
      13.98,
      19.68,
      15.62,
      16.93
    ]
  },
  "rowVerdicts": {
    "create 1,000 rows": [
      "tie",
      "tie with Vapor, Vue 3 and Octane in both runs"
    ],
    "replace all rows": [
      "tie",
      "tie with Octane, Vapor and Vue 3 in both runs"
    ],
    "partial update": [
      "split",
      "tie in run 1, a 1.09× win over Vapor in run 2, so not claimed"
    ],
    "select row": [
      "info",
      "below clock resolution here; batch-timed on the same board, Pyreon is 1.58× faster than Octane (both runs)"
    ],
    "swap rows": [
      "split",
      "tie in run 1, Vapor 1.11× ahead in run 2, so not claimed either way"
    ],
    "remove row": [
      "tie",
      "tie with Octane, Vapor and both Solids in both runs"
    ],
    "clear rows": [
      "win",
      "win, 1.12× vs Octane and Vapor (both runs)"
    ],
    "create 10,000 rows": [
      "tie",
      "tie with Vue 3 and Octane in both runs · 2.7× faster than React 19, 3.9× than Preact (run 1 figures)"
    ],
    "append 1k → 10k": [
      "tie",
      "tie with Octane in both runs"
    ]
  },
  "scenarios": [
    {
      "op": "dbmon tick (100×6, every cell changes)",
      "pyreon": "1.71 ms",
      "rival": "Octane 1.74",
      "verdict": "tie",
      "label": "three-way tie with Octane and Svelte (both runs, 2026-11-05); never quoted as a win"
    },
    {
      "op": "mount deep tree (2,047 components)",
      "pyreon": "3.09 ms",
      "rival": "Solid 1.9 3.03",
      "verdict": "tie",
      "label": "tie with Solid 1.9 (both runs) · Solid 2.0 1.09–1.11× and React 1.12–1.15× slower"
    },
    {
      "op": "context → 1,024 consumers",
      "pyreon": "1.74 ms",
      "rival": "Solid 2.0 1.84",
      "verdict": "tie",
      "label": "tie with both Solids (both runs)"
    },
    {
      "op": "effect list: update 500",
      "pyreon": "880 µs",
      "rival": "Solid 2.0 875",
      "verdict": "tie",
      "label": "tie (both runs)"
    },
    {
      "op": "effect list: dispose 500",
      "pyreon": "45 µs",
      "rival": "Solid 2.0 45",
      "verdict": "info",
      "label": "no verdict: Pyreon and both Solids read 35–50 µs, below 10 clock quanta"
    },
    {
      "op": "memo wall: blocked",
      "pyreon": "12.6 µs",
      "rival": "Solid 2.0 13.0",
      "verdict": "tie",
      "label": "tie with Solid 2.0 (both runs); Vue 1.25× slower"
    },
    {
      "op": "memo wall: passthrough",
      "pyreon": "410 µs",
      "rival": "Svelte 438",
      "verdict": "win",
      "label": "1.07× (both runs)"
    },
    {
      "op": "retained heap, one mounted deep tree",
      "pyreon": "531.7 KB",
      "rival": "Solid 1.9 202.0",
      "verdict": "loss",
      "label": "Solid 1.9 2.57–2.63×, Solid 2.0 1.30× lighter (both runs, no CI)"
    },
    {
      "op": "keyed list: clear 1,000 rows (<For>)",
      "pyreon": "490 µs",
      "rival": "Vue 3 335",
      "verdict": "loss",
      "label": "Vue 3 1.46–1.58×, Solid 2.0 tied with Vue (both runs)"
    },
    {
      "op": "app page hydration (2,206 nodes)",
      "pyreon": "4.02 ms",
      "rival": "React 4.15",
      "verdict": "win",
      "label": "1.03× · Preact 1.07× · Vue 1.11× (one run, 2026-11-05)"
    },
    {
      "op": "1,000-row table hydration",
      "pyreon": "6.07 ms",
      "rival": "Vue 6.02",
      "verdict": "split",
      "label": "walk tied both runs; total Vue 1.01× in run 2 (2026-11-05)"
    }
  ],
  "scaling": {
    "sizes": [
      "100",
      "1,000",
      "5,000",
      "10,000",
      "20,000"
    ],
    "select": {
      "Pyreon": [
        0.426,
        0.442,
        0.431,
        0.439,
        0.442
      ],
      "Octane": [
        0.868,
        0.9,
        0.826,
        0.832,
        0.823
      ],
      "Solid": [
        1.8,
        7.5,
        36.3,
        60.8,
        109.9
      ]
    },
    "partial update": {
      "Pyreon": [
        60.1,
        518,
        3210,
        6830,
        15980
      ],
      "Octane": [
        64.8,
        578,
        3370,
        7320,
        16930
      ],
      "Solid": [
        62.5,
        555,
        3320,
        7290,
        16910
      ]
    },
    "swap": {
      "Pyreon": [
        68.1,
        480,
        2220,
        4670,
        10720
      ],
      "Octane": [
        61,
        436,
        2290,
        5000,
        11850
      ],
      "Solid": [
        67.9,
        497,
        2540,
        5250,
        12310
      ]
    }
  },
  "ssr": [
    {
      "rows": "10 rows",
      "pyreon": 1.8,
      "vue": 3.03,
      "svelte": 2.18,
      "react": 10.3
    },
    {
      "rows": "100 rows",
      "pyreon": 11.64,
      "vue": 15.66,
      "svelte": 18.08,
      "react": 76.52
    },
    {
      "rows": "1,000 rows",
      "pyreon": 109.9,
      "vue": 124.9,
      "svelte": 160.5,
      "react": 714.4
    }
  ],
  "bundle": [
    [
      "Vanilla",
      3.6
    ],
    [
      "Solid",
      7.7
    ],
    [
      "Preact",
      10.1
    ],
    [
      "Svelte 5",
      16.1
    ],
    [
      "Pyreon",
      18.5
    ],
    [
      "Vue 3",
      27.7
    ],
    [
      "Octane",
      33.9
    ],
    [
      "React 19",
      69.6
    ]
  ],
  "reactivity": {
    "V8 · Node 26": [
      [
        "signal create + read + write",
        63,
        13,
        20,
        "loss",
        "4.8×"
      ],
      [
        "computed diamond",
        4424,
        5761,
        38021,
        "win",
        "1.30–1.31×"
      ],
      [
        "effect propagation",
        1407,
        2874,
        15910,
        "win",
        "2.04–2.13×"
      ],
      [
        "batch 50 signals",
        456,
        888,
        4759,
        "win",
        "1.94–1.95×"
      ],
      [
        "deep chain",
        107237,
        75639,
        677221,
        "loss",
        "1.42–1.43×"
      ],
      [
        "wide fan-out",
        1651,
        1602,
        4886,
        "loss",
        "1.03–1.04×"
      ]
    ],
    "JavaScriptCore · Bun 1.4": [
      [
        "signal create + read + write",
        31,
        6,
        30,
        "loss",
        "≈5×"
      ],
      [
        "computed diamond",
        5201,
        5556,
        15839,
        "win",
        "1.07–1.08×"
      ],
      [
        "effect propagation",
        1573,
        4269,
        7417,
        "win",
        "2.5–2.7×"
      ],
      [
        "batch 50 signals",
        456,
        1050,
        1829,
        "win",
        "2.30–2.34×"
      ],
      [
        "deep chain",
        137424,
        119299,
        287720,
        "loss",
        "1.15–1.21×"
      ],
      [
        "wide fan-out",
        1590,
        2202,
        3015,
        "win",
        "1.33–1.38×"
      ]
    ]
  },
  "forms": [
    [
      "mount 12 fields",
      210,
      [
        [
          "Solid modular-forms",
          305
        ],
        [
          "Formik",
          340
        ],
        [
          "vee-validate",
          570
        ],
        [
          "Felte",
          575
        ],
        [
          "React Hook Form",
          640
        ],
        [
          "TanStack Form",
          680
        ]
      ]
    ],
    [
      "keystroke, validating",
      460,
      [
        [
          "Solid modular-forms",
          570
        ],
        [
          "React Hook Form",
          830
        ],
        [
          "Felte",
          1150
        ],
        [
          "Formik",
          1320
        ],
        [
          "vee-validate",
          2260
        ],
        [
          "TanStack Form",
          2380
        ]
      ]
    ]
  ],
  "todomvc": [
    [
      "add 100 todos (varies by day)",
      "765 µs",
      "1.53 ms",
      "1.14–1.99×"
    ],
    [
      "toggle 1,000",
      "4.60 ms",
      "11.41 ms",
      "2.48×"
    ],
    [
      "clear 1,000",
      "320 µs",
      "1.00 ms",
      "3.14×"
    ]
  ],
  "losses": [
    [
      "Memory per component",
      "A mounted 2,047-component tree retains 531.7 KB in Pyreon, 410.2 KB in Solid 2.0 and 202–207 KB in Solid 1.9 (both runs, no CI). On the row board Preact's retained heap is lighter too: 3.14 vs 3.21 MB."
    ],
    [
      "A keyed list with conditional cells",
      "With <For>, clearing 1,000 rows is 1.46–1.58× behind Vue 3 (Solid 2.0 and Preact are ahead too), replace 1.05–1.06× and create 1.03×. A plain .map() of JSX rows loses create, replace, swap, remove and clear (1.12–2.35×). Both runs."
    ],
    [
      "Most of the row board is a tie",
      "Create 1,000, replace, remove, create 10,000 and append tie Vue 3.6 Vapor, Octane and Vue 3. Partial update and swap split between runs; swap was a 1.11× loss to Vapor in one. We win clear rows and the batch-timed select outright."
    ],
    [
      "Swap at 100 and 1,000 rows",
      "Octane leads 1.12× and 1.10× on the batch instrument (one run, 2026-11-05), a result that moves with batch size. We report it as a loss."
    ],
    [
      "Hydrating a 1,000-row table",
      "Tied with Vue 3 on the framework walk in both runs. On the total, tied in run 1 and Vue 1.01× ahead in run 2."
    ],
    [
      "Charts line mounts, row input",
      "10,000 points: uPlot 1.17–1.20×. 1,000,000 points: Chart.js 1.16–1.20×. Columnar input ties, except a 1.18× loss to uPlot at 10,000 points in run 1."
    ],
    [
      "Signal creation",
      "About 5× slower than Preact Signals on both engines. Deep unobserved chains lose too (1.42–1.43× on V8, 1.15–1.21× on JavaScriptCore), and so does wide fan-out on V8 (1.03–1.04×)."
    ],
    [
      "Bundle size",
      "18.5 KB for the same app. Solid ships 7.7 KB, Preact 10.1 KB, Svelte 16.1 KB."
    ],
    [
      "Small route tables",
      "Hono matches 10 routes 1.91× faster (one run). Per row, Pyreon trails the fastest router on static, nested-static, dynamic, nested-dynamic and splat matches at every size. The harness changed after these figures (PR #4142: Hono's arm now builds its params object like every other arm), so the next run will move them."
    ],
    [
      "Store setup and reads",
      "The record lists store setup and store reads as losses to Zustand. The harness changed after those figures (PR #4142: the setup op no longer builds a store id inside the timed loop), so we don't quote them until the next quiet-machine run replaces them."
    ],
    [
      "Six validator cells",
      "Zod's compiled mode wins valid email, int and array-of-20 parses; ArkType wins the valid user-object parse. On checks, typia and ArkType win valid email and ArkType wins invalid email. One run."
    ],
    [
      "A few nanoseconds and kilobytes",
      "Storage reads (1.5×), url-state integer parse (1.1×), form heap (Solid modular-forms 0.09 MB lighter), code editor bundle (4%)."
    ],
    [
      "Happy-dom table and list rows",
      "Under happy-dom (not a browser), table mount at 1,000 rows, single-cell update vs memoized rows at 1,000 and sort vs memoized rows at 100 lose to react-table, and virtual's 10,000-row mount loses 1.1×. In real Chromium the table mount ties in one run and wins 1.03× in the other, and virtual mounts 1.15× faster (one run)."
    ],
    [
      "Unbundled Node",
      "A process that imports the built package without a bundler pays a live process.env read per dev check, about 145 ns each on V8. Every bundler folds it away."
    ]
  ],
  "withdrawn": [
    [
      "\"Solid mounts a deep component tree 1.15–1.18× faster\"",
      "Gone since #4199 (static component props folded at compile time), bisected. The mount now ties Solid 1.9 in both runs. Its memory is still a loss."
    ],
    [
      "\"Pyreon ties Preact as the lightest framework\"",
      "Preact is lighter: 3.14 vs 3.21 MB after the row board, in every pass."
    ],
    [
      "\"Solid wins effect-list dispose by one clock quantum\"",
      "Every close arm reads 35–50 µs, under 10 clock quanta, so it gets no verdict."
    ],
    [
      "\"~4.9× partial update lead over Solid\"",
      "A table-layout harness bug inflated it. Re-measured at about 2.1×; today Pyreon is 1.75–2.02× faster than Solid 1.9 and 2.0 on partial update."
    ],
    [
      "\"Octane wins clear rows\"",
      "Old. Pyreon now wins clear rows in both runs, 1.12× vs Octane and Vapor."
    ],
    [
      "\"Pyreon outright on create 1,000 / replace all / create 10,000\"",
      "Create 1,000, replace all and create 10,000 tie in both runs."
    ],
    [
      "\"Append 1k → 10k: Pyreon wins 1.02×\"",
      "Page-load-aware intervals turned it into a split, and the 2026-11-24 runs tie in both. Not claimed."
    ],
    [
      "\"Vue 3.6 Vapor outright on replace all (1.02×) and swap rows (1.08×)\"",
      "Ties in both runs. Withdrawn for them too."
    ],
    [
      "\"Fastest framework\"",
      "Never as a bare claim. Most of the row board is a tie; we name the operation and the margin."
    ],
    [
      "\"Pyreon has the lowest retained heap\" (forms)",
      "Solid modular-forms is lighter, 2.33 vs 2.42 MB."
    ],
    [
      "\"Fastest median on dbmon\"",
      "A three-way tie in both runs. dbmon is never a win for anyone."
    ],
    [
      "\"cssVariables theming 1.16× / 1.22× faster\"",
      "Reversed: classic mode is 1.13× faster."
    ],
    [
      "\"react-table mounts 1.12–1.13× faster\"",
      "Didn't reproduce on the current build: a tie in run 1, Pyreon 1.03× in run 2."
    ],
    [
      "\"Preact wins the computed diamond\" (1.13× V8, 1.01× JavaScriptCore)",
      "Pyreon now wins it in both runs: 1.30–1.31× on V8, 1.07–1.08× on JavaScriptCore."
    ],
    [
      "\"zod wins invalid scalar string 1.17×\"",
      "Pyreon leads that cell now, 1.40× vs zod (one run, the weakest of twelve)."
    ],
    [
      "runtime-server throughput of 2026-09-24",
      "Not comparable: the harness was re-added after that run (#3642)."
    ],
    [
      "Any figure older than 2026-11-05",
      "This record supersedes every earlier run. Sections the 2026-11-24 refresh did not re-measure keep their 2026-11-05 figures and say so."
    ]
  ],
  "competitors": [
    "react 19.3.1",
    "vue 3.5.45",
    "Vue Vapor 3.6.0-rc.11",
    "svelte 5.57.3",
    "solid-js 1.9.19",
    "Solid 2.0.3",
    "preact 11.2.0",
    "octane 0.19.2",
    "@xyflow/react 12.12.0",
    "echarts 6.1.0",
    "uplot 1.6.32",
    "chart.js 4.6.1",
    "recharts 3.10.1",
    "@tanstack/react-table 9.3.1",
    "@tanstack/react-virtual 3.14.23",
    "@tanstack/query-core 5.105.0",
    "@tanstack/form-core 1.33.5",
    "@preact/signals-core 1.14.4",
    "zod 4.6.7",
    "valibot 1.5.0",
    "arktype 2.2.9",
    "typia 15.2.1",
    "typebox 0.34.52",
    "yup 1.7.1",
    "joi 18.3.1",
    "zustand 5.0.16",
    "jotai 3.0.1",
    "mobx-state-tree 9.0.0",
    "mobx 7.1.1",
    "xstate 5.33.3",
    "i18next 26.5.11",
    "@casl/ability 7.0.2",
    "ky 2.2.0",
    "ofetch 1.5.1",
    "redaxios 0.5.1",
    "axios 1.20.0",
    "hotkeys-js 4.0.8",
    "tinykeys 4.0.1",
    "mousetrap 1.6.5",
    "nuqs 2.10.2",
    "react-hook-form 7.91.0",
    "formik 2.4.9",
    "react-hot-toast 2.6.1",
    "sonner 2.0.8",
    "rxjs 7.8.2",
    "unhead 3.4.3",
    "hono 4.13.14",
    "react-router 8.5.0",
    "vue-router 5.4.0",
    "find-my-way 9.10.0",
    "radix3 1.1.2",
    "@emotion/css 11.13.5",
    "goober 2.1.19",
    "styled-components 6.6.0"
  ],
  "method": [
    [
      "One suite at a time",
      "Every suite runs alone, gated on a machine load below 4, with load stamped before and after."
    ],
    [
      "Correct before fast",
      "Every implementation must produce the same observable result before a single timing counts."
    ],
    [
      "Intervals, not single numbers",
      "Medians with bootstrap 95% confidence intervals that resample whole page loads, not just samples."
    ],
    [
      "Wins have to repeat",
      "A win needs non-overlapping intervals in every run. Overlap is a tie, not \"basically faster\". A result measured once says \"one run\"."
    ],
    [
      "Production builds",
      "NODE_ENV=production and a real vite build for every browser suite, cross-origin isolated for a 5 µs clock."
    ],
    [
      "Author-run, and we say so",
      "We wrote these benchmarks and we judge them, on one machine, in Chromium only. A keyed implementation is staged for krausest/js-framework-benchmark, the independent venue (not yet submitted)."
    ]
  ],
  "heroStats": [
    {
      "stat": "2.7×",
      "label": "faster than React 19 creating 10,000 rows",
      "condition": "73.09 vs 195.91 ms, real Chromium, row board run twice (figures from run 1)",
      "source": "BENCHMARKS.md 2026-11-24 §1, create 10,000 row"
    },
    {
      "stat": "3.8×",
      "label": "less JavaScript than React 19 for the same app",
      "condition": "18.5 KB vs 69.6 KB gzip -9, the same keyed-table app per framework (sizes are deterministic)",
      "source": "BENCHMARKS.md 2026-11-24 §7"
    },
    {
      "stat": "6.5×",
      "label": "faster server rendering than React 19 at 1,000 rows",
      "condition": "compiled SSR, 109.9 vs 714.4 µs per render, one run",
      "source": "BENCHMARKS.md 2026-11-05 §5, compiled SSR table"
    },
    {
      "stat": "8.7×",
      "label": "faster than ECharts 6 mounting a 100,000-point line chart",
      "condition": "4.36 vs 37.95 ms, real Chromium, one run",
      "source": "BENCHMARKS.md 2026-11-05 §2, charts vs ECharts 6"
    }
  ],
  "caveat": "Synthetic, author-run, one machine (Apple M3 Max), Chromium only. Row board, core scenarios and bundle refreshed 2026-11-24; other sections 2026-11-05. Reproduce: pyreon.dev/docs/benchmarks",
  "lossesSection": {
    "title": "Every loss, in one list.",
    "intro": "Wins lead this page. Everything else is here too: every loss from §13 of the record, in one list. We publish where we lose, so you can trust where we win."
  },
  "harnessBugs": {
    "count": 8,
    "title": "Eight bugs we found in our own benchmarks.",
    "intro": "Each one was found, fixed, re-run and published, and each now has a guard that stops it. Where a bug flattered us, the claim came down.",
    "items": [
      {
        "title": "Rivals on slow paths",
        "text": "Svelte and Vue arms ran on deep proxies and Octane was pinned eight patches behind; the Svelte create-10,000 gap fell from about 2.5× to 1.19× once fixed. Guard: every arm on its framework's documented fast path, compiler-output arms diffed against the real toolchain's emit.",
        "pr": "#2878, #2864"
      },
      {
        "title": "A 100 µs clock",
        "text": "Chromium clamps performance.now() on a non-isolated page, so sub-millisecond ops reported clock ticks: \"Octane 2.00× ahead\" on clear rows was 1.19–1.45×. Guard: cross-origin-isolated pages with a measured 5 µs quantum (the harness aborts otherwise) and a batch instrument for ops under about 10 quanta.",
        "pr": "#2894"
      },
      {
        "title": "A String() wrapper",
        "text": "String(row.id) switched off Octane's compiler fast path and taxed four Octane ops. Guard: no presentation work a real user would not write, and competitor arms are checked by compiling them.",
        "pr": "#2897"
      },
      {
        "title": "A V8 string cache",
        "text": "Growth of V8's number-to-string cache was billed to the retained heap of the five arms that stringified ids. Guard: every arm renders the raw row.id, and a heap-diff script checks GC-root-held entries.",
        "pr": "#2899"
      },
      {
        "title": "table-layout: auto",
        "text": "Whole-table re-measures made append bimodal and inflated a Pyreon partial-update lead about 2.3× (published as ~4.9×, now withdrawn). Guard: table-layout: fixed for every arm plus a bimodality guard.",
        "pr": "#2903, #2901"
      },
      {
        "title": "A busy machine",
        "text": "A hydration \"tie\" with Vue was measured at load 8.2; on a quiet machine Vue led by 3–4%. Guard: strictly sequential runs gated on a one-minute load below 4, and a close verdict needs two agreeing runs.",
        "pr": "#2920"
      },
      {
        "title": "A rival's upgrade",
        "text": "A ~3.1× clear-rows swing was about 1.5× Pyreon getting faster and about 3× Octane 0.2.2 getting slower. Guard: split \"Pyreon moved\" from \"competitor moved\" before explaining a change, and never call a gap architectural.",
        "pr": "#3301"
      },
      {
        "title": "Pooled intervals",
        "text": "100 samples from 5 page loads were bootstrapped as if independent. Guard: a two-stage cluster bootstrap over page loads; fewer than three page loads prints \"verdicts provisional\". It turned two pooled wins (create 10,000, append) into splits.",
        "pr": "#4129"
      }
    ]
  },
  "reproduce": {
    "title": "Don't trust us. Run it.",
    "intro": "Every suite is in the repository. Clone it, install, and the row board runs in real Chromium on your machine. Absolute times depend on the machine; compare ratios.",
    "command": "git clone https://github.com/pyreon/pyreon\ncd pyreon && bun install && bunx playwright install chromium\ncd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 4",
    "allSuites": "cd examples/benchmark\nbun bench-fair.ts --repeat 5 --wait-quiet 4\nbun bench-scenarios.ts --scenario <dbmon|tree|effects|memo> --repeat 5 --wait-quiet 4\nbun bench-scenarios.ts --scenario <flow|table|virtual|charts|charts-libs> --repeat 3 --wait-quiet 4\nbun bench-hydration.ts --repeat 5 --wait-quiet 4 && bun bench-apppage.ts --repeat 3 --wait-quiet 4\nbun bench-crossover.ts --repeat 3\nbun bench-bundle.ts\nbun bench-ssr.ts --wait-quiet 4 && bun bench-charts-bundle.ts\ncd ../.. && bun scripts/bench/core/reactivity.ts && bun scripts/bench/core/reactivity.ts --runtime node\nbun scripts/bench/core/router.ts && bun scripts/bench/core/validate.ts\n\n# any fundamentals package\ncd packages/fundamentals/<pkg> && NODE_ENV=production bun bench/<file>.ts",
    "note": "--wait-quiet 4 waits until the machine's one-minute load is 4 or less before measuring (up to five minutes, then it runs and warns that the run is suspect)."
  },
  "krausest": "A keyed implementation is staged for krausest/js-framework-benchmark (contrib/krausest/pyreon-keyed/), the independent venue. Not yet submitted.",
  "template": {
    "meta": {
      "title": "Benchmarks: every result, on the table · Pyreon",
      "description": "Pyreon's benchmark record: real Chromium, production builds, medians with 95% confidence intervals and a correctness check before anything is timed. Every win, tie and loss."
    },
    "hero": {
      "eyebrow": "Benchmarks · record of {date} · {count} competitor libraries",
      "title": "Every result, on the table.",
      "lede": "Real Chromium, production builds, medians with 95% confidence intervals and a correctness check before anything is timed. The row board and the core scenarios run twice, and a win has to win both runs. Refreshed 2026-11-24 with Solid 2.0 stable and Vue's Vapor release candidate on the board beside Solid 1.9 and Vue 3; sections not re-run keep their 2026-11-05 figures. Every number on every Pyreon page comes from here.",
      "statsLabel": "Headline results",
      "jumpsLabel": "On this page"
    },
    "jumps": {
      "method": "Method",
      "row-board": "Row board",
      "scenarios": "Scenarios",
      "scaling": "Scaling",
      "ssr": "SSR",
      "apps": "Real apps",
      "bundle": "Bundle",
      "reactivity": "Reactivity",
      "every-product": "Every product",
      "losses": "Every loss",
      "withdrawn": "Withdrawn",
      "harness": "Harness bugs",
      "reproduce": "Reproduce"
    },
    "method": {
      "label": "method",
      "title": "How we measure.",
      "text": "Synthetic benchmarks can't predict your app. They can be run fairly. Apple M3 Max, Chromium 159 (2026-11-24) and 156 (2026-11-05), Node 26 (V8) and Bun 1.4 (JavaScriptCore).",
      "guide": {
        "text": "The suites and how to run them are documented in the",
        "link": {
          "label": "benchmarks guide",
          "href": "/docs/benchmarks"
        }
      }
    },
    "rows": {
      "label": "dom · 10 frameworks · real chromium",
      "title": "The row board: level with the fastest, 2.7× ahead of React.",
      "text": "The classic keyed-table benchmark against nine other implementations, including hand-written vanilla JS. Pick an operation. Run 1 shown; verdicts cover both runs.",
      "chart": "Row board chart",
      "table": "Every operation and framework, as a table",
      "caption": "Row board, run 1, milliseconds (lower is better). Verdicts cover both runs.",
      "columns": {
        "op": "Operation",
        "verdict": "Verdict"
      },
      "run": "Run 1 medians, 2026-11-24; real Chromium; the full board ranks each operation fastest first",
      "initial": "create 10,000 rows",
      "fastestFirst": "{op}, fastest first: {list}",
      "live": {
        "control": "Operation",
        "title": "Row board, {op}: milliseconds, lower is better",
        "pyreon": "Pyreon",
        "others": "Other frameworks"
      }
    },
    "scenarios": {
      "label": "scenarios · real chromium",
      "title": "Real component shapes, not just rows.",
      "text": "Deep trees, context fan-out, effect lists, memo walls, a keyed list and hydration. Two runs each unless marked.",
      "columns": {
        "op": "Scenario",
        "pyreon": "Pyreon",
        "rival": "Fastest rival",
        "verdict": "Verdict"
      },
      "run": "Two runs each unless marked; dbmon and hydration from 2026-11-05"
    },
    "scaling": {
      "label": "scaling · 100 → 20,000 rows",
      "title": "Select stays flat. Everyone else's doesn't.",
      "text": "The same operations at five sizes, batch-timed. Solid's select grows with the row count; Pyreon's is O(1) and twice as fast as Octane's. One run.",
      "chart": "Scaling chart",
      "table": "Every size, as a table",
      "caption": "{op}: µs per operation, one run",
      "columns": {
        "framework": "Framework",
        "size": "{size} rows"
      },
      "run": "Batch-timed, one run, 2026-11-05",
      "live": {
        "control": "Operation",
        "title": "{op}: µs per operation by row count, log scale",
        "note": "{op} · log scale · µs per op · one run"
      }
    },
    "ssr": {
      "label": "server rendering",
      "title": "The fastest server render we measured, at every size.",
      "text": "Compiled SSR, idiomatic per framework, µs per render (overnight run).",
      "chart": "Server rendering chart",
      "table": "As a table",
      "caption": "Compiled SSR, µs per render (lower is better), one run",
      "columns": {
        "rows": "Rows",
        "pyreon": "Pyreon",
        "vue": "Vue 3",
        "svelte": "Svelte 5",
        "react": "React 19"
      },
      "run": "Overnight run, one run, 2026-11-05"
    },
    "apps": {
      "label": "real-app shapes",
      "title": "Forms and to-do lists, the apps people build every day.",
      "text": "A 12-field form against six form libraries, and TodoMVC against React 19. One run each.",
      "forms": {
        "chart": "Forms chart",
        "table": "Forms, as a table",
        "caption": "12-field form, µs (lower is better), one run",
        "columns": {
          "op": "Operation",
          "pyreon": "Pyreon",
          "rivals": "Rivals, fastest first"
        }
      },
      "todomvc": {
        "chart": "TodoMVC chart",
        "table": "TodoMVC, as a table",
        "caption": "TodoMVC shape vs React 19, one run",
        "columns": {
          "op": "Operation",
          "pyreon": "Pyreon",
          "react": "React 19",
          "ratio": "Ratio"
        }
      },
      "run": "One run each, 2026-11-05"
    },
    "bundle": {
      "label": "bundle size · same app · gzip -9",
      "title": "Bigger than Solid. Smaller than Vue and React.",
      "text": "The same keyed-table app built with each framework. This is a loss and we're not hiding it: Solid, Preact and Svelte ship less.",
      "chart": "Bundle size chart",
      "table": "As a table",
      "caption": "Same keyed-table app, KB gzip -9 (smaller is better)",
      "columns": {
        "framework": "Framework",
        "kb": "KB gzip"
      },
      "run": "Sizes are deterministic · 2026-11-24"
    },
    "reactivity": {
      "label": "reactivity core · ns/op",
      "title": "Signals, measured on two engines.",
      "text": "Pyreon vs Preact Signals and Solid. Two runs per engine. Pyreon wins propagation and batching, loses creation and deep unobserved chains.",
      "control": "Engine",
      "caption": "{engine}: ns per op (lower is better), two runs",
      "columns": {
        "test": "Test",
        "pyreon": "Pyreon",
        "preact": "Preact Signals",
        "solid": "Solid",
        "verdict": "Verdict vs Preact"
      },
      "run": "Two runs per engine, 2026-11-05"
    },
    "products": {
      "label": "every product",
      "title": "Head-to-head, product by product.",
      "text": "Each card links to the benchmark section on that product's page.",
      "control": "Filter products",
      "filters": {
        "all": "all",
        "win": "has wins",
        "loss": "has losses",
        "info": "throughput only"
      },
      "shown": "{shown} of {total} products",
      "card": "{name}: {headline} {tally}. Open its benchmarks.",
      "tally": {
        "win": [
          "win",
          "wins"
        ],
        "tie": [
          "tie",
          "ties"
        ],
        "split": [
          "split",
          "splits"
        ],
        "loss": [
          "loss",
          "losses"
        ],
        "info": [
          "measurement",
          "measurements"
        ]
      }
    },
    "losses": {
      "label": "where we lose"
    },
    "withdrawn": {
      "label": "withdrawn claims",
      "title": "We retract our own numbers.",
      "text": "When a harness bug turns up or a result doesn't reproduce, the claim comes down, including claims in our favour.",
      "tag": "withdrawn"
    },
    "harness": {
      "label": "{count} harness bugs",
      "pr": "PR #{n}"
    },
    "reproduce": {
      "label": "reproduce",
      "command": "The row board, on your machine",
      "allSuites": "Every suite",
      "competitors": "Competitors, installed and verified ({count})",
      "more": {
        "label": "How to run every suite →",
        "href": "/docs/benchmarks"
      },
      "guide": {
        "label": "Read the benchmarks guide",
        "href": "/docs/benchmarks"
      }
    }
  }
} satisfies BenchmarksPage
