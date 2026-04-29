import type { ComponentFn } from "@pyreon/core"

export interface PostMeta {
  title: string
  date: string
  description: string
  tags?: string[]
}

export interface Post extends PostMeta {
  slug: string
  Component: ComponentFn<unknown>
}

interface PostModule {
  meta: PostMeta
  default: ComponentFn<unknown>
}

/**
 * Enumerate all `.tsx` posts in `src/content/posts/` at build time. Eagerly
 * loads modules so SSG renders see frontmatter immediately. The slug is the
 * filename without extension (`welcome.tsx` → `welcome`).
 */
const modules = import.meta.glob<PostModule>("../content/posts/*.tsx", {
  eager: true,
})

export const posts: Post[] = Object.entries(modules)
  .map(([path, mod]) => {
    const slug = path
      .split("/")
      .pop()!
      .replace(/\.tsx$/, "")
    return { ...mod.meta, slug, Component: mod.default }
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1))

export function postBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug)
}

export function postSlugs(): string[] {
  return posts.map((p) => p.slug)
}
