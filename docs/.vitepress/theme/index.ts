import { useData, type Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { defineComponent, h, watch } from 'vue'
import APICard from './components/APICard.vue'
import CompatMatrix from './components/CompatMatrix.vue'
import PackageBadge from './components/PackageBadge.vue'
import Playground from './components/Playground.vue'
import PropTable from './components/PropTable.vue'
import Since from './components/Since.vue'
// Canonical Pyreon design tokens (verbatim from the brand handoff).
// Imported first so custom.css can build on the variables.
import './tokens.css'
import './custom.css'

// Keep the brand token system (which keys light off `data-theme`) in
// sync with VitePress's appearance toggle (which sets `<html.dark>`) at
// RUNTIME — the head script in config.ts only handles the pre-paint
// initial state. SSR-guarded; first paint already correct via that script.
const Layout = defineComponent({
  name: 'PyreonLayout',
  setup() {
    const { isDark } = useData()
    if (!import.meta.env.SSR) {
      watch(
        isDark,
        (dark) => {
          document.documentElement.dataset.theme = dark ? 'dark' : 'light'
        },
        { immediate: true },
      )
    }
    return () => h(DefaultTheme.Layout)
  },
})

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('PackageBadge', PackageBadge)
    app.component('PropTable', PropTable)
    app.component('APICard', APICard)
    app.component('CompatMatrix', CompatMatrix)
    app.component('Since', Since)
    app.component('Playground', Playground)
  },
} satisfies Theme
