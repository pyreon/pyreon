// https://nuxt.com/docs/api/configuration/nuxt-config
// Starter template (nuxt/starter v4) + the document head the CONTRACT asks for
// (https://nuxt.com/docs/4.x/getting-started/seo-meta). Nuxt injects
// <meta charset> and the viewport meta itself.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  telemetry: false,
  app: {
    head: {
      title: 'Items',
      htmlAttrs: { lang: 'en' },
    },
  },
})
