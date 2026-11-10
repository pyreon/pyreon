import { describe, expect, it } from 'vitest'
import { blogCollection, blogSchema, validateBlogFrontmatter } from '../blog/schema'
import { countWords } from '../pipeline/word-count'
import { compileMarkdown } from '../pipeline/parse'

const valid = {
  title: 'Components run once',
  description: 'What the compiler does with your JSX.',
  date: new Date('2026-11-16'),
  slug: 'components-run-once',
  tags: ['javascript', 'webdev'],
  cover: '/blog/covers/components-run-once.png',
}

function messages(input: unknown): string[] {
  return validateBlogFrontmatter(input).map((i) => `${(i.path ?? []).join('.')}: ${i.message}`)
}

describe('blogSchema', () => {
  it('accepts the frontmatter the pyreon.dev posts use (title, description, date, slug, tags, cover, canonical?, draft?)', () => {
    expect(messages(valid)).toEqual([])
    expect(messages({ ...valid, canonical: 'https://dev.to/x', draft: true, date: '2026-11-16' })).toEqual([])
  })

  it('accepts every optional field', () => {
    expect(
      messages({
        ...valid,
        updated: '2026-11-20T09:30:00Z',
        coverAlt: 'Diagram',
        author: ['ada', 'Grace Hopper'],
      }),
    ).toEqual([])
    expect(messages({ title: 'T', description: 'D', date: '2026-01-01', author: 'ada' })).toEqual([])
  })

  it('reports every problem in one pass', () => {
    const out = messages({
      title: '',
      date: '16/11/2026',
      updated: 'soon',
      slug: 'Not A Slug',
      tags: 'web',
      cover: 'covers/x.png',
      coverAlt: 3,
      author: [],
      canonical: '/relative',
      draft: 'yes',
      tag: ['typo'],
    })
    expect(out).toEqual([
      'title: `title` is required: a non-empty string',
      'description: `description` is required: a non-empty string',
      'date: `date` is required: a calendar date such as 2026-11-16 (the publish date)',
      'updated: `updated` must be a calendar date such as 2026-11-20',
      'slug: `slug` must be lowercase words joined by hyphens, e.g. `my-first-post`',
      'tags: `tags` must be a list of non-empty strings, e.g. `[javascript, webdev]`',
      'cover: `cover` must be a site-root path (`/blog/covers/post.png`) or an absolute http(s) URL',
      'coverAlt: `coverAlt` must be a string',
      'author: `author` must be a name (or an `authors` key from defineBlog), or a list of them',
      'canonical: `canonical` must be an absolute http(s) URL',
      'draft: `draft` must be `true` or `false`',
      expect.stringContaining('tag: unknown field `tag`') as unknown as string,
    ])
  })

  it('rejects a date that matches the pattern but is not a day', () => {
    expect(messages({ ...valid, date: '2026-13-45' })).toHaveLength(1)
    expect(messages({ ...valid, date: new Date('nope') })).toHaveLength(1)
  })

  it('rejects non-objects', () => {
    expect(messages('title: x')).toEqual([': frontmatter must be a YAML mapping (`key: value` lines)'])
    expect(messages(null)).toHaveLength(1)
    expect(messages([])).toHaveLength(1)
  })

  it('is a Standard Schema that validates without transforming', () => {
    const ok = blogSchema['~standard'].validate(valid)
    expect(ok).toEqual({ value: valid })
    const bad = blogSchema['~standard'].validate({})
    expect('issues' in bad && bad.issues !== undefined && bad.issues.length).toBe(3)
  })
})

describe('blogCollection', () => {
  it('is a pages collection dated by `date` that omits unpublished posts by default', () => {
    expect(blogCollection()).toEqual({
      type: 'pages',
      schema: blogSchema,
      publishDate: 'date',
      unpublished: 'omit',
    })
    expect(blogCollection({ path: 'posts', unpublished: 'runtime' })).toMatchObject({
      path: 'posts',
      unpublished: 'runtime',
    })
  })
})

describe('wordCount — counted when the markdown compiles', () => {
  it('counts prose, inline code and code blocks; not frontmatter, MDX expressions or image alt text', async () => {
    const source = [
      '---',
      'title: Many words in the frontmatter that must not count',
      '---',
      '',
      '# Heading words',
      '',
      'One two `three` [four](/x).',
      '',
      '![alt text that does not count](/a.png)',
      '',
      '{/* an MDX comment that does not count */}',
      '',
      '```js',
      'const five = six',
      '```',
    ].join('\n')
    const result = await compileMarkdown(source, '/p/src/content/blog/x.md', { highlight: false })
    // Heading(2) + One two three four (4) + `const five = six` (3: `=` is not a word)
    expect(result.wordCount).toBe(9)
    expect(result.code).toContain('export const wordCount = 9')
  })

  it('an empty tree has no words', () => {
    expect(countWords({ type: 'root', children: [] })).toBe(0)
  })
})
