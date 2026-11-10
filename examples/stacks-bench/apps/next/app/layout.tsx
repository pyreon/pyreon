// Root layout — https://nextjs.org/docs/app/api-reference/file-conventions/layout
// Metadata — https://nextjs.org/docs/app/getting-started/metadata-and-og-images
// Next injects <meta charset> and the viewport meta itself.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Items',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
