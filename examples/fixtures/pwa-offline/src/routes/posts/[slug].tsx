export const getStaticPaths = () => [{ params: { slug: 'hello' } }]

export default function Post() {
  return <h1 id="page">Post page</h1>
}
