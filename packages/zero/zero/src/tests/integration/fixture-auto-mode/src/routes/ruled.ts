import { h } from '@pyreon/core'

// A loader (inferred 'ssr'), but zero({ routeRules: { '/ruled': 'ssg' } })
// in the test overrides it — the rule must win and the route prerender.
export default function Ruled() {
  return h('h1', null, 'RULE_DECLARED_SSG')
}

export async function loader() {
  return {}
}
