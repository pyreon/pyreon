/**
 * Data for the Migrate demo (DemoMigrate.tsx).
 *
 * MIGRATIONS: the step-one config lines and the step-two snippets from the
 * page's reference prototype (content/products/migrate.json → demo); the
 * React pair is the one the `pyreon check` capture below ran on
 * (pyreon-promo/06-videos/captures/text/c30-Counter.{react,pyreon}.tsx).
 * The diffs are ILLUSTRATIVE, and the demo says so.
 *
 * CHECK_BEFORE / CHECK_AFTER: real `pyreon check src/Counter.tsx` output on
 * those two files, re-captured 2026-11-11 with the worktree's CLI
 * (`bun packages/tools/cli/src/index.ts check src/Counter.tsx`); identical
 * to the c30-check-{react,pyreon}.txt captures. Exit codes 1 and 0.
 */
export type Framework = 'React' | 'Preact' | 'Vue' | 'Solid' | 'Svelte'

export interface Migration {
  pkg: string
  from: string
  to: string
  before: string
  after: string
  note: string
}

export const MIGRATIONS: Record<Framework, Migration> = {
  "React": {
    "pkg": "@pyreon/react-compat",
    "from": "plugins: [react()]",
    "to": "plugins: [pyreon({ compat: 'react' })]",
    "before": "import { useState, useEffect } from 'react'\n\nexport function Counter() {\n  const [count, setCount] = useState(0)\n  useEffect(() => {\n    document.title = `Count: ${count}`\n  }, [count])\n  return <button onClick={() => setCount((n) => n + 1)}>Count: {count}</button>\n}",
    "after": "import { signal, effect } from '@pyreon/reactivity'\n\nexport function Counter() {\n  const count = signal(0)\n  effect(() => {\n    document.title = `Count: ${count()}`\n  })\n  return <button onClick={() => count.update((n) => n + 1)}>Count: {count()}</button>\n}",
    "note": "react, react-dom and the JSX runtime resolve to @pyreon/react-compat. Function components and hooks, React 19 ones included. Class components are stubs."
  },
  "Preact": {
    "pkg": "@pyreon/preact-compat",
    "from": "plugins: [preact()]",
    "to": "plugins: [pyreon({ compat: 'preact' })]",
    "before": "import { computed, effect, signal } from '@preact/signals'\n\nconst count = signal(0)\nconst double = computed(() => count.value * 2)\neffect(() => console.log(double.value))\ncount.value++",
    "after": "import { computed, effect, signal } from '@pyreon/reactivity'\n\nconst count = signal(0)\nconst double = computed(() => count() * 2)\neffect(() => console.log(double()))\ncount.update((n) => n + 1)",
    "note": "preact, preact/hooks and @preact/signals resolve to @pyreon/preact-compat, with the same three entry points."
  },
  "Vue": {
    "pkg": "@pyreon/vue-compat",
    "from": "import { computed, ref, watch } from 'vue'",
    "to": "import { computed, ref, watch } from '@pyreon/vue-compat'",
    "before": "import { computed, ref, watch } from 'vue'\n\nconst count = ref(0)\nconst double = computed(() => count.value * 2)\nwatch(count, (next, prev) => console.log(prev, '→', next, 'double', double.value))\ncount.value++",
    "after": "import { computed, signal, watch } from '@pyreon/reactivity'\n\nconst count = signal(0)\nconst double = computed(() => count() * 2)\nwatch(count, (next, prev) => console.log(prev, '→', next, 'double', double()))\ncount.update((n) => n + 1)",
    "note": "The Composition API: ref, reactive, computed, watch, lifecycle, provide/inject. Not a .vue compiler, and no Options API."
  },
  "Solid": {
    "pkg": "@pyreon/solid-compat",
    "from": "plugins: [solid()]",
    "to": "plugins: [pyreon({ compat: 'solid' })]",
    "before": "import { createEffect, createSignal, Show } from 'solid-js'\n\nexport function Toggle() {\n  const [open, setOpen] = createSignal(false)\n  createEffect(() => console.log('open:', open()))\n  return (\n    <>\n      <button onClick={() => setOpen(!open())}>Toggle</button>\n      <Show when={open()}>\n        <p>Hello</p>\n      </Show>\n    </>\n  )\n}",
    "after": "import { Show } from '@pyreon/core'\nimport { effect, signal } from '@pyreon/reactivity'\n\nexport function Toggle() {\n  const open = signal(false)\n  effect(() => console.log('open:', open()))\n  return (\n    <>\n      <button onClick={() => open.update((v) => !v)}>Toggle</button>\n      <Show when={open}>\n        <p>Hello</p>\n      </Show>\n    </>\n  )\n}",
    "note": "Signals, stores, resources and control flow. A compat component re-runs as a whole, not node by node."
  },
  "Svelte": {
    "pkg": "@pyreon/svelte-compat",
    "from": "import { derived, writable } from 'svelte/store'",
    "to": "import { derived, writable } from '@pyreon/svelte-compat/store'",
    "before": "import { derived, writable } from 'svelte/store'\n\nconst count = writable(0)\nconst double = derived(count, ($count) => $count * 2)\nconst stop = double.subscribe((value) => console.log(value))\ncount.update((n) => n + 1)\nstop()",
    "after": "import { computed, effect, signal } from '@pyreon/reactivity'\n\nconst count = signal(0)\nconst double = computed(() => count() * 2)\nconst logger = effect(() => console.log(double()))\ncount.update((n) => n + 1)\nlogger.dispose()",
    "note": "Stores, lifecycle and context: the APIs you import. Not a .svelte compiler, and no rune syntax."
  }
}

export const CHECK_BEFORE = "\n  src/Counter.tsx\n    1:0  [react:react-import] (auto-fixable — run with --fix)\n      Import from 'react' is a React package. Use Pyreon equivalent.\n      → import { ... } from \"@pyreon/core\"\n    4:28  [react:use-state] (auto-fixable — run with --fix)\n      useState is a React API. In Pyreon, use signal(). Read: count(), Write: count.set(x)\n      → count = signal(0)\n    5:2  [react:use-effect-deps] (auto-fixable — run with --fix)\n      useEffect with dependency array. In Pyreon, effect() auto-tracks dependencies — no array needed.\n      → effect(() => {\n  // reads are auto-tracked\n})\n\n  3 findings in 1 file  ·  some are auto-fixable with --fix"

export const CHECK_AFTER = "  ✓ no Pyreon anti-patterns in 1 file"
