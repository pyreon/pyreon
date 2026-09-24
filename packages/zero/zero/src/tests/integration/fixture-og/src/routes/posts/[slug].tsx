import type { OgImage } from '../../../../../../server'

export const getStaticPaths = () => [{ params: { slug: 'hello' } }, { params: { slug: 'world' } }]

export const loader = async ({ params }: { params: { slug: string } }) => ({ title: `Post ${params.slug}` })

export default function Post() {
  return <h1>Post</h1>
}

export const og: OgImage<{ title: string }, { slug: string }> = ({ data, params }) => (
  <svg width="1200" height="630">
    <rect width="1200" height="630" fill={params.slug === 'hello' ? '#ff0000' : '#00ff00'} />
    <text x="60" y="320" font-size="64" fill="#ffffff">{data?.title}</text>
  </svg>
)
