export const meta = {
  title: "Static vs SSR — picking the right rendering mode",
  date: "2026-04-20",
  description:
    "Pyreon Zero ships four rendering modes. Here's a one-paragraph guide to picking between them for a content site.",
  tags: ["pyreon", "ssg", "ssr"],
}

export default function Post() {
  return (
    <>
      <p>
        Pyreon Zero ships four rendering modes — SSG, SSR (string), SSR (stream), and SPA.
        For a blog, SSG is almost always the right choice. Here's why.
      </p>

      <h2>SSG (this template's default)</h2>
      <p>
        Every page is HTML on disk. Cheap to host (any static CDN), fast to load (zero
        server work), and indexable by every search engine and AI crawler. The downside:
        new content requires a rebuild + redeploy. For a blog where posts are written, not
        scraped, this is a feature.
      </p>

      <h2>SSR string / stream</h2>
      <p>
        Render on every request. Required for per-user content (dashboards, social feeds).
        The streaming variant flushes HTML chunks as they're ready — fastest TTFB. Overkill
        for a blog unless you're personalizing posts.
      </p>

      <h2>SPA</h2>
      <p>
        Client-only rendering. Never the right answer for a content site — search engines and
        AI crawlers see an empty shell. Reserve for behind-login dashboards.
      </p>

      <h2>Mixing modes</h2>
      <p>
        Pyreon supports per-route overrides. Even on this SSG template, you can mark a single
        route SSR by exporting <code>renderMode</code>:
      </p>
      <pre>
        <code>
          {`export const renderMode = "ssr-stream"

export default function LiveStats() {
  // ...
}`}
        </code>
      </pre>
    </>
  )
}
