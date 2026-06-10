import { PyreonNotFound } from '../components/PyreonNotFound'

// 404 page — fs-router convention. Rendered for any URL that doesn't
// match a real route. Uses the branded PyreonNotFound component
// (ported from docs/.vitepress/theme/components/PyreonNotFound.vue).
export default function NotFoundPage() {
  return <PyreonNotFound />
}
