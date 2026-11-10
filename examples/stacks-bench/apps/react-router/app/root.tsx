// Root route as in the official template — https://reactrouter.com/start/framework/route-module
// (Layout + Meta/Links/Scripts/ScrollRestoration), minus CSS/fonts per the benchmark contract.
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'

export function meta() {
  return [{ title: 'Items' }]
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}
