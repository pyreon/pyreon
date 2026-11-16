import { useHead } from '@pyreon/head'

export const meta = {
  title: 'About',
  description: 'About this blog.',
}

export default function About() {
  useHead({
    title: meta.title,
    meta: [{ name: 'description', content: meta.description }],
  })

  return (
    <>
      <h1>About</h1>
      <p>
        This is a Pyreon Zero blog. Edit <code>src/routes/about.tsx</code> to replace this with your
        bio.
      </p>
      <p>
        The blog renders statically — every page on this site is plain HTML on disk after{' '}
        <code>bun run build</code>. Posts are markdown files in <code>src/content/blog/</code>; add
        one and it appears in the listings, on its tag pages and in the RSS feed.
      </p>
    </>
  )
}
