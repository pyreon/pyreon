export const meta = {
  title: "Welcome to your new Pyreon blog",
  date: "2026-04-28",
  description:
    "A quick tour of how this blog is wired together — TSX posts, SSG, RSS, and dark mode out of the box.",
  tags: ["pyreon", "ssg", "intro"],
}

export default function Post() {
  return (
    <>
      <p>
        This blog ships pre-rendered at build time. Every post is a small TSX file in{" "}
        <code>src/content/posts/</code>, and the loader at <code>src/lib/posts.ts</code> walks
        the directory via Vite's <code>import.meta.glob</code>.
      </p>

      <h2>Adding a post</h2>

      <p>
        Drop a new <code>.tsx</code> file alongside this one. Export <code>meta</code> with{" "}
        <code>title</code>, <code>date</code>, and <code>description</code>, then a default
        component for the body:
      </p>

      <pre>
        <code>
          {`export const meta = {
  title: "My new post",
  date: "2026-05-01",
  description: "One sentence summary.",
}

export default function Post() {
  return <p>The body of the post.</p>
}`}
        </code>
      </pre>

      <p>
        The post auto-appears in <code>/blog/</code> and the <code>/api/rss</code> feed. The
        slug comes from the filename.
      </p>

      <h2>Why TSX instead of Markdown?</h2>

      <p>
        TSX gives you the full Pyreon component model inside posts — interactive demos, live
        signals, charts — without an extra build step or a markdown-to-JSX bridge. If you'd
        prefer markdown, swap the loader for a remark/MDX pipeline; the route shape stays the
        same.
      </p>

      <h2>What's next?</h2>

      <ul>
        <li>
          Edit <code>src/routes/_layout.tsx</code> to change the site header
        </li>
        <li>
          Edit <code>src/global.css</code> for typography
        </li>
        <li>
          Update <code>src/routes/api/rss.xml.ts</code> with your domain
        </li>
        <li>Replace this post with your own.</li>
      </ul>
    </>
  )
}
