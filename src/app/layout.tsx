import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LiveShell Config Generator',
  description: 'LiveShell PRO ローカルモード設定音声生成ツール',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
