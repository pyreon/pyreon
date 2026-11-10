// https://reactrouter.com/start/framework/routing
import { type RouteConfig, route } from '@react-router/dev/routes'

export default [route('items', 'routes/items.tsx'), route('items/:id', 'routes/item.tsx')] satisfies RouteConfig
