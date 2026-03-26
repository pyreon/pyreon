import pyreon from "@pyreon/vite-plugin"
import zero from "@pyreon/zero"
import { fontPlugin } from "@pyreon/zero/font"
import { seoPlugin } from "@pyreon/zero/seo"

export default {
  plugins: [
    pyreon(),
    zero({ mode: "ssr", ssr: { mode: "stream" } }),

    // Google Fonts — self-hosted at build time, CDN in dev
    fontPlugin({
      google: ["Inter:wght@400;500;600;700;800", "JetBrains Mono:wght@400"],
      // Size-adjusted fallbacks to eliminate CLS while fonts load
      fallbacks: {
        Inter: { fallback: "Arial", sizeAdjust: 1.07, ascentOverride: 90 },
      },
    }),

    // Generate sitemap.xml and robots.txt at build time
    seoPlugin({
      sitemap: { origin: "https://example.com" },
      robots: {
        rules: [{ userAgent: "*", allow: ["/"] }],
        sitemap: "https://example.com/sitemap.xml",
      },
    }),
  ],
}
