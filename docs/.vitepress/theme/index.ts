import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import APICard from './components/APICard.vue'
import CompatMatrix from './components/CompatMatrix.vue'
import PackageBadge from './components/PackageBadge.vue'
import PropTable from './components/PropTable.vue'
import Since from './components/Since.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('PackageBadge', PackageBadge)
    app.component('PropTable', PropTable)
    app.component('APICard', APICard)
    app.component('CompatMatrix', CompatMatrix)
    app.component('Since', Since)
  },
} satisfies Theme
