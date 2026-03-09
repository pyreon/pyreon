import type { ReactNode } from 'react'
import { RootProvider } from 'fumadocs-ui/provider'
import 'fumadocs-ui/style.css'
import './globals.css'

interface Props {
  children: ReactNode
}

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
