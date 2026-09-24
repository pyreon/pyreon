/**
 * Vue templates for the row suite (`impl/vue.ts`) and the hydration fixture
 * (`impl/hydration-shared.ts`).
 *
 * Same contract as `dbmon-vue-template.ts`: this module has NO imports so
 * `vite.config.ts` can read it at BUILD time and precompile each template with
 * `@vue/compiler-dom` using the options `@vue/compiler-sfc`'s `compileTemplate`
 * passes (`VUE_SFC_COMPILE_OPTIONS`). That is what a real Vue app ships: the
 * compiled render function carries patch flags (`KEYED_FRAGMENT` on the
 * `v-for`, `CLASS` on the row, `TEXT` on each cell) and block tracking, so a
 * re-render diffs ONLY the dynamic parts. A hand-written `h()` arm has none of
 * that and forces full-props diffs on every row — a handicap no Vue user pays.
 *
 * The row template is the krausest `vue` keyed implementation's shape
 * (`:class="{ danger: … }"` → here `selected`, the class this suite's gates
 * assert on).
 */

/** Row suite — `<tr>` per row, class toggled on selection. */
export const ROWS_VUE_TEMPLATE = `<table><tbody><tr v-for="row in rows" :key="row.id" :class="{ selected: row.id === selectedId }"><td>{{ row.id }}</td><td>{{ row.label }}</td></tr></tbody></table>`

/**
 * Hydration fixture — the page shape every hydration arm shares:
 * `<tr class={selected?'danger':''}><td>{id}</td><td><a onClick>{label}</a></td></tr>`.
 * BOTH the fixture generator (server render, compiled at runtime in bun) and
 * the browser (compiled at build time by vite.config.ts) compile THIS string
 * with the SAME options, so SSR markup and client vnodes cannot drift.
 */
export const HYDRATION_VUE_TEMPLATE = `<table><tbody><tr v-for="row in rows" :key="row.id" :class="selected === row.id ? 'danger' : ''"><td>{{ row.id }}</td><td><a @click="selected = row.id">{{ row.label }}</a></td></tr></tbody></table>`

/**
 * Deep-tree scenario (`scenario-tree.ts`) — one recursive node component and
 * the root that provides the context. The `v-if`/`v-else` pair keeps each node
 * a single root element (no comment anchor), so the DOM matches every other
 * arm. `<VueNode>` resolves to itself by component name (`resolveComponent`),
 * exactly as a self-recursive options-API SFC does.
 */
export const TREE_NODE_VUE_TEMPLATE = `<span v-if="depth <= 1" class="leaf">{{ ctx }}</span><div v-else class="branch"><VueNode :depth="depth - 1" /><VueNode :depth="depth - 1" /></div>`
export const TREE_ROOT_VUE_TEMPLATE = `<div class="tree-root"><VueNode :depth="depth" /></div>`

/**
 * Effect-heavy list (`scenario-effects.ts`) — 500 row components under one
 * keyed `v-for`. `value` is the row's ref, returned as setup state (unwrapped).
 */
export const FX_ROW_VUE_TEMPLATE = `<span class="fx-row">{{ value }}</span>`
export const FX_LIST_VUE_TEMPLATE = `<div class="fx-list"><FxRow v-for="i in slots" :key="i" :index="i" /></div>`

/**
 * Memoization wall (`scenario-memo.ts`) — root, memo'd list (two roots = a Vue
 * fragment, matching the other arms' DOM) and the 300 consumer components.
 */
export const MEMO_APP_VUE_TEMPLATE = `<div class="memo-root"><span class="memo-source">{{ source }}</span><MemoList :bucket="bucket" /></div>`
export const MEMO_LIST_VUE_TEMPLATE = `<span class="memo-bucket">{{ bucket }}</span><div class="memo-consumers"><MemoConsumer v-for="i in slots" :key="i" :bucket="bucket" /></div>`
export const MEMO_CONSUMER_VUE_TEMPLATE = `<span class="memo-consumer">{{ bucket }}</span>`

/**
 * App-page hydration scenario (`apppage-shared.ts`) — the settings page as
 * three SFC-style components. Like `HYDRATION_VUE_TEMPLATE`, BOTH the fixture
 * generator (server render, compiled at runtime in bun) and the browser
 * (compiled at build time) compile these strings with the SAME options, so SSR
 * markup and client vnodes cannot drift. `<template v-for>` carries the key and
 * the `v-if`/`v-else` picks the component, mirroring the other arms'
 * `kind === 'header' ? <SectionHeader/> : <FormRow/>` map.
 */
export const APPPAGE_VUE_TEMPLATE = `<div class="page"><div class="page-hd"><h1 class="page-title">Settings</h1><button type="button" :class="selected === 'save' ? 'page-save active' : 'page-save'" @click="selected = 'save'">Save</button></div><template v-for="(d, i) in rows" :key="i"><SectionHeader v-if="d.kind === 'header'" :title="d.label" :hint="d.hint" /><FormRow v-else :label="d.label" :name="d.name" :value="d.value" :hint="d.hint" /></template></div>`
export const APPPAGE_SECTION_HEADER_VUE_TEMPLATE = `<div class="sec-hd"><h2 class="sec-title">{{ title }}</h2><span class="sec-hint">{{ hint }}</span></div>`
export const APPPAGE_FORM_ROW_VUE_TEMPLATE = `<div class="row"><label class="row-label">{{ label }}</label><div class="row-ctl"><input class="row-input" type="text" :name="name" :value="value"><small class="row-hint">{{ hint }}</small></div></div>`

/**
 * The option set `@vue/compiler-sfc`'s `compileTemplate` hands `compile()` for
 * a `<template>` block (minus `mode`, which the caller picks: `'module'` for
 * the vite virtual module, `'function'` for the bun fixture generator — the
 * render BODY is identical in both).
 */
export const VUE_SFC_COMPILE_OPTIONS = {
  prefixIdentifiers: true,
  hoistStatic: true,
  cacheHandlers: true,
} as const
