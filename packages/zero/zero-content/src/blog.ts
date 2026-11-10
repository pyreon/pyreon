// ─── @pyreon/zero-content/blog ────────────────────────────────────────────
//
// A production blog on a content collection: frontmatter schema, queries,
// SEO (Open Graph, Twitter, JSON-LD), components and route components.
// Client-safe — the RSS feed stays in the content plugin's `seo.rss`.
//
//   content.config.ts   collections: { blog: blogCollection() }
//   src/blog.ts         export const blog = defineBlog({ siteUrl, title, description })
//   src/routes/blog/…   five one-line route files (see `defineBlog`)
//
// Optional default styles: `import '@pyreon/zero-content/blog.css'`.

export { blogCollection, blogSchema, normalizeBlogFrontmatter, validateBlogFrontmatter } from './blog/schema'
export type {
  BlogCollectionOptions,
  BlogFrontmatter,
  BlogPostData,
  BlogSchema,
  FrontmatterDate,
} from './blog/schema'

export { defineBlog, pageFromParam, resolveBlogConfig } from './blog/define-blog'
export type { Blog, BlogConfig, BlogPostEnd, BlogStaticPaths, ResolvedBlogConfig } from './blog/define-blog'

export {
  adjacentPosts,
  countTags,
  formatPostDate,
  isoDay,
  paginate,
  postsWithTag,
  readingMinutes,
  relatedPosts,
  slugifyTag,
  sortNewestFirst,
  toBlogPost,
  toDate,
} from './blog/posts'
export type {
  AdjacentPosts,
  BlogAuthor,
  BlogCover,
  BlogPage,
  BlogPost,
  BlogPostContext,
  BlogTag,
  BlogTagCount,
} from './blog/posts'

export { absoluteUrl, blogListHead, blogPostHead, blogPostingJsonLd } from './blog/seo'
export type { BlogListHeadOptions, BlogSeoSite } from './blog/seo'

export {
  Byline,
  CallToAction,
  CoverImage,
  NewsletterForm,
  Pagination,
  PostCard,
  PostDate,
  PostEnd,
  PostHeader,
  PostList,
  PostMeta,
  PostNav,
  RelatedPosts,
  ShareLinks,
  shareTargets,
  TagList,
} from './blog/components'
export type {
  BylineProps,
  CallToActionLink,
  CallToActionProps,
  CoverImageProps,
  CoverSize,
  NewsletterFormProps,
  PaginationProps,
  PostCardProps,
  PostDateProps,
  PostEndProps,
  PostHeaderProps,
  PostListProps,
  PostMetaProps,
  PostNavProps,
  RelatedPostsProps,
  ShareLinksProps,
  ShareTarget,
  TagListProps,
} from './blog/components'
