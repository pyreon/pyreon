import { h } from '@pyreon/core'

// A loader AND getStaticPaths — mode 'auto' infers 'ssg' (getStaticPaths
// wins over the loader), so every enumerated slug prerenders.
export default function Post() {
  return h('h1', null, 'AUTO_INFERRED_SSG_POST')
}

export async function loader() {
  return {}
}

export function getStaticPaths() {
  return [{ params: { slug: 'hello' } }]
}
